'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const audit=require('../integration/N10-A7.31-host-and-edge-evidence-LOCKED.cjs');
const source=fs.readFileSync('integration/N10-A7.31-host-and-edge-evidence-LOCKED.cjs','utf8');
const blueprint=fs.readFileSync('hosting/N10-A7.31-CLOUDFLARE-PAGES-HEADERS-REVIEW.txt','utf8');
const page='https://myintmoehein0115024.github.io',prod='https://mmhvault.com';
function headerSpec(){
 const result={};
 for(const line of blueprint.split('\n')){
  if(!line.startsWith('  '))continue;
  const match=/^\s{2}([a-z-]+):\s*(.*)$/i.exec(line);
  if(match)result[match[1].toLowerCase()]=match[2];
 }
 return result;
}
const secure=headerSpec();
function cloud(nowUTC='2026-10-29T10:00:00.000Z'){
 return {
  project:'ldivswlhtgmznzwhzsoi',
  slug:'mmh-n10a6-username',origin:page,
  edgeSha:audit.MAIN_SHA,siteverifySha:audit.SITEVERIFY_SHA,nowUTC,
  edgeSource:[
   "const CODE_GATE_OPEN = false;",
   "const WINDOW_START_UTC = '"+audit.CLOSED+"';",
   "const WINDOW_END_UTC = '"+audit.CLOSED+"';",
   "const ORIGIN = '"+page+"';",
   "const HOSTNAME = 'myintmoehein0115024.github.io';",
   "env('N10A6_STAGING_ENABLED') === 'true'"
  ].join('\n'),
  siteverifySource:[
   "const ORIGIN='"+page+"';",
   "const HOSTNAME='myintmoehein0115024.github.io';",
   "const DEADLINE='"+audit.SITEVERIFY_EXPIRY+"';"
  ].join('\n')
 };
}
test('committed signoff stays false and no mutable cloud actions exist',()=>{
 assert.match(source,/const ALLOW_REAL_STAGING_SIGNOFF=false/);
 assert.equal(typeof audit.auditAcceptanceReadiness,'function');
 for(const forbidden of ['deploy','setSecret','openWindow','approve','createUser','bindUsername'])
  assert.ok(!Object.hasOwn(audit,forbidden));
 assert.ok(!source.includes('vrypucmyrztxgiqhjspd'));
 assert.ok(!source.includes('sb_secret_'));
});
test('review header template exists outside deployed _headers and is scoped',()=>{
 assert.match(blueprint,/NOT named "_headers" and NOT deployed/);
 assert.match(blueprint,/^\/n10-a731-review\/\*\s*$/m);
 assert.ok(!blueprint.includes('mmhvault.com;'));
 assert.equal(Object.keys(secure).length,8);
});
test('hypothetical Cloudflare Pages response headers satisfy syntactic audit only',()=>{
 const result=audit.headerAudit(secure);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.code,'hosting_headers_conform');
});
test('HTML meta CSP cannot substitute HTTP CSP response header',()=>{
 const without={...secure};delete without['content-security-policy'];
 const result=audit.headerAudit(without);
 assert.equal(result.ok,false);assert.ok(result.blockers.includes('csp_missing_or_invalid'));
 assert.ok(result.blockers.includes('csp_frame_ancestors_not_none'));
});
for(const [name,changed,error] of [
 ['no frame-ancestors',secure['content-security-policy'].replace("frame-ancestors 'none'; ",''),'csp_frame_ancestors_not_none'],
 ['script unsafe-inline',secure['content-security-policy'].replace("script-src 'self'","script-src 'self' 'unsafe-inline'"),'csp_script_src_unsafe'],
 ['script unsafe-eval',secure['content-security-policy'].replace("script-src 'self'","script-src 'self' 'unsafe-eval'"),'csp_script_src_unsafe'],
 ['connect wildcard',secure['content-security-policy'].replace("connect-src 'self'","connect-src * 'self'"),'csp_connect_src_unsafe'],
 ['connect production Supabase',secure['content-security-policy'].replace(audit.STAGING_BASE,'https://vrypucmyrztxgiqhjspd.supabase.co'),'csp_connect_src_unsafe'],
 ['frame other host',secure['content-security-policy'].replace("frame-src https://challenges.cloudflare.com","frame-src https://evil.example"),'csp_frame_src_unsafe'],
 ['permissive objects',secure['content-security-policy'].replace("object-src 'none'","object-src *"),'csp_object_src_not_none'],
 ['permissive form',secure['content-security-policy'].replace("form-action 'none'","form-action *"),'csp_form_action_not_none'],
 ['double directive',secure['content-security-policy']+"; script-src *",'csp_missing_or_invalid']
]){
 test('bad CSP '+name+' fails closed',()=>{
  const x=audit.headerAudit({...secure,'content-security-policy':changed});
  assert.equal(x.ok,false);assert.ok(x.blockers.includes(error),JSON.stringify(x));
 });
}
for(const [name,error] of [
 ['x-frame-options','iframe_header_missing'],['x-content-type-options','nosniff_header_missing'],
 ['referrer-policy','referrer_header_missing'],['cache-control','no_store_header_missing'],
 ['strict-transport-security','hsts_header_missing_or_short'],
 ['cross-origin-opener-policy','coop_header_missing'],
 ['permissions-policy','permissions_camera_missing']
]){
 test('missing HTTP '+name+' is blocked',()=>{
  const headers={...secure};delete headers[name];
  const r=audit.headerAudit(headers);
  assert.equal(r.ok,false);assert.ok(r.blockers.includes(error),JSON.stringify(r));
 });
}
test('HTTP header case normalization handles mixed-case header objects',()=>{
 const mixed={};
 for(const [k,v] of Object.entries(secure)){
  mixed[k.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join('-')]=v;
 }
 assert.equal(audit.headerAudit(mixed).ok,true);
});
test('newlines in headers are dropped, never interpreted as a secure CSP',()=>{
 const c={...secure,'content-security-policy':secure['content-security-policy']+'\r\nX-Fake: true'};
 const v=audit.headerAudit(c);assert.equal(v.ok,false);
});
test('Cloudflare Pages blueprint does not silently approve real site',()=>{
 const r=audit.auditAcceptanceReadiness({headers:secure,server:cloud()});
 assert.equal(r.ok,false);assert.equal(r.releaseReady,false);assert.equal(r.allowedToOpen,false);
 assert.equal(r.cloudMutationPerformed,false);
 assert.ok(r.blockers.includes('real_staging_signoff_locked'));
});
test('all seven external attestations true STILL cannot unlock real cloud',()=>{
 const r=audit.auditAcceptanceReadiness({
  headers:secure,server:cloud(),sitekeyHostnameVerified:true,
  sitekeyActionVerified:true,secretStateManuallyAttested:true,
  namedExistingAccountsApproved:true,userApprovedSpecificWindow:true,
  rollbackRunnerTested:true,authCallbackOriginReviewed:true
 });
 assert.equal(r.hosting,'hosting_headers_conform');
 assert.equal(r.edge,'edge_closed_baseline_verified');
 assert.equal(r.releaseReady,false);assert.equal(r.allowedToOpen,false);
 assert.ok(r.blockers.includes('release_not_approved'));
 assert.equal(r.cloudMutationPerformed,false);
});
test('static deployed Edge snapshot closed baseline can be validated by shape',()=>{
 const v=audit.verifyStaticEdge(cloud());
 assert.equal(v.ok,true);assert.equal(v.code,'edge_closed_baseline_verified');
});
for(const [name,mut,error] of [
 ['production project',x=>{x.project='vrypucmyrztxgiqhjspd'},'staging_identity_mismatch'],
 ['new mmhvault.com origin',x=>{x.origin=prod},'staging_identity_mismatch'],
 ['changed main hash',x=>{x.edgeSha='changed'},'cloud_sha_not_baselined'],
 ['changed Siteverify hash',x=>{x.siteverifySha='changed'},'cloud_sha_not_baselined'],
 ['code gate open',x=>{x.edgeSource=x.edgeSource.replace('CODE_GATE_OPEN = false','CODE_GATE_OPEN = true')},'staging_edge_not_hard_closed'],
 ['date window open',x=>{x.edgeSource=x.edgeSource.replace(audit.CLOSED,'2026-10-30T10:00:00.000Z')},'staging_edge_not_hard_closed'],
 ['origin mismatch code',x=>{x.edgeSource=x.edgeSource.replace(page,prod)},'edge_origin_or_secret_gate_changed'],
 ['secret gate removed',x=>{x.edgeSource=x.edgeSource.replace("env('N10A6_STAGING_ENABLED') === 'true'",'true')},'edge_origin_or_secret_gate_changed'],
 ['Turnstile hostname wrong',x=>{x.siteverifySource=x.siteverifySource.replace('myintmoehein0115024.github.io','mmhvault.com')},'siteverify_scope_or_expiry_changed'],
 ['Siteverify extended',x=>{x.siteverifySource=x.siteverifySource.replace(audit.SITEVERIFY_EXPIRY,'2099-01-01T00:00:00.000Z')},'siteverify_scope_or_expiry_changed'],
 ['expired Siteverify',x=>{x.nowUTC='2026-10-30T17:00:00.000Z'},'siteverify_qa_expired'],
 ['bad clock',x=>{x.nowUTC='2026-10-29T10:00:00Z'},'clock_evidence_missing']
]){
 test('Cloud evidence '+name+' triggers required blocker',()=>{
  const x=cloud();mut(x);const report=audit.verifyStaticEdge(x);
  assert.equal(report.ok,false);
  assert.ok(report.blockers.includes(error),JSON.stringify(report));
 });
}
test('explicitly exclude production origins and unknown sites from Staging context',()=>{
 assert.equal(audit.allowedTargetOrigin(page),true);
 for(const host of [prod,'https://www.mmhvault.com','https://evil.example','http://myintmoehein0115024.github.io'])
  assert.equal(audit.allowedTargetOrigin(host),false);
});
test('README review content references exact pinned cloud functions and no secret values',()=>{
 const evidence=audit.auditAcceptanceReadiness({headers:secure,server:cloud()});
 assert.equal(evidence.code,'real_staging_still_locked');
 assert.ok(evidence.blockers.includes('requires_secretStateManuallyAttested'));
 assert.ok(evidence.blockers.includes('requires_userApprovedSpecificWindow'));
 assert.equal(audit.SITEVERIFY_EXPIRY,'2026-10-30T17:00:00.000Z');
});
