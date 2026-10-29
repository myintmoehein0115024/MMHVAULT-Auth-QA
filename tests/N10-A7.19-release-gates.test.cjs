'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../release/N10-A7.19-release-gates.json'),'utf8'));
const ids=manifest.gates.map(g=>g.id);
test('production cutover hard-blocked until ALL blocking gates pass',()=>{
 assert.equal(manifest.release_ready,false);
 assert.equal(manifest.decision,'BLOCKED');
 assert.ok(manifest.gates.some(g=>g.blocking&&g.status!=='pass'));
});
test('at least 19 independent release gates have distinct IDs and evidence',()=>{
 assert.ok(manifest.gates.length>=19);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(manifest.gates.every(g=>/^[G]\d{2}$/.test(g.id)&&typeof g.evidence==='string'&&g.evidence.length>12));
});
test('only known evidence states; no premature skips or unknown outcomes',()=>{
 assert.ok(manifest.gates.every(g=>['pass','pending','fail'].includes(g.status)));
 assert.ok(manifest.gates.every(g=>typeof g.blocking==='boolean'));
});
test('production and staging refs are distinct and immutable in manifest',()=>{
 assert.equal(manifest.scope.production_supabase,'vrypucmyrztxgiqhjspd');
 assert.equal(manifest.scope.staging_supabase,'ldivswlhtgmznzwhzsoi');
 assert.notEqual(manifest.scope.production_supabase,manifest.scope.staging_supabase);
});
test('actual official login/app SHA baselines frozen',()=>{
 assert.equal(manifest.current_baseline['login.html'],'69b1ae5eeb621af3fff72d26e71c76ddae9f01a7');
 assert.equal(manifest.current_baseline['app.html'],'4abf71a70ad3c1f3388de2418e219ab13ba2d330');
});
test('small initial release scope only login.html and optional NEW JS/CSS',()=>{
 assert.deepEqual(manifest.candidate_minimal_paths.modify,['login.html']);
 assert.ok(manifest.candidate_minimal_paths.new.every(x=>x.startsWith('js/')||x.startsWith('css/')));
 assert.ok(manifest.candidate_minimal_paths.optional_later.includes('app.html'));
});
test('financial and PWA sources protected from direct modification',()=>{
 for(const p of ['app.html','business.html','ai-chat.html','mmh-push-sw.js'])
  assert.ok(manifest.protected_paths.includes(p),p);
});
test('staging username main remains code-closed with 1970 expiry',()=>{
 const s=manifest.staging_state;
 assert.equal(s.username_edge_version,17);
 assert.equal(s.closure_sha256,'caddafb86a553f012f601af375d6c89885b88dcf2f708238a839c3d348130b4e');
 assert.equal(s.code_gate_open,false);
 assert.equal(s.window_start,'1970-01-01T00:00:00.000Z');
 assert.equal(s.window_end,'1970-01-01T00:00:00.000Z');
});
test('real atomic replay is accepted as PASS only with evidence of 200 + 403, not prior 429',()=>{
 const g=manifest.gates.find(g=>g.id==='G04');
 assert.equal(g.status,'pass');
 assert.match(g.evidence,/HTTP 200/);
 assert.match(g.evidence,/HTTP 403/);
 assert.match(g.evidence,/token_replayed/);
 assert.match(g.evidence,/2026-10-28/);
 assert.ok(!/only.*429|429.*not 403/i.test(g.evidence));
});
test('registration and auth-side CAPTCHA remain blocked until actual verified signup',()=>{
 assert.equal(manifest.gates.find(g=>g.id==='G12').status,'pending');
 assert.ok(manifest.gates.find(g=>g.id==='G12').name.includes('CAPTCHA'));
});
test('production E2E and financial regressions remain required, not inferred from mocks',()=>{
 assert.equal(manifest.gates.find(g=>g.id==='G10').status,'pass','real existing-username login was accepted in bounded Staging');
 for(const id of ['G11','G12','G13','G14','G15','G16','G17','G18','G19'])
  assert.equal(manifest.gates.find(g=>g.id===id).status,'pending');
});
test('production deploy R6 requires explicit separate authorization gate G19',()=>{
 const prod=manifest.stages.find(s=>s.id==='R6');
 assert.equal(prod.environment,'Production');
 assert.ok(prod.requires.includes('G19'));
 assert.ok(prod.requires.includes('G04'));
 assert.ok(prod.requires.includes('G12'));
});
test('rollback does not include destructive auth or finance changes',()=>{
 assert.ok(manifest.rollback.procedure.some(v=>v.includes('Do NOT delete')));
 assert.ok(manifest.rollback.forbidden.some(v=>v.includes('Staging JWT')));
 assert.ok(manifest.rollback.forbidden.some(v=>v.includes('force push')));
});
test('all stages use concrete test gate identifiers',()=>{
 for(const s of manifest.stages)for(const id of s.requires)assert.ok(ids.includes(id),s.id+':'+id);
});
test('no server-side secret or bearer token values in QA manifest',()=>{
 const s=JSON.stringify(manifest);
 for(const pattern of [/sb_secret_[A-Za-z0-9_-]{10,}/,/Bearer\s+[A-Za-z0-9_.-]{24,}/,/service_role\s*[:=]\s*["'][A-Za-z0-9_.-]{24,}/i])
   assert.ok(!pattern.test(s));
});
