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
 assert.equal(manifest.current_baseline['login.html'],'1183791db8cfad73ff740e96e157785f49a679b3');
 assert.equal(manifest.current_baseline['app.html'],'e4072fca7cc7a4096887be5feff9a78c92fb8346');
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
 assert.equal(s.username_edge_version,11);
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
 for(const id of ['G10','G11','G15','G16','G17','G19'])
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
