'use strict';
/* N10-A7.38: strict live OPTIONS-only CORS test. No POST, no Auth, no secrets.
   Actual live checks are read-only public CORS metadata, not G10/G11 tests. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const https=require('node:https'),fs=require('node:fs');
const v=require('../integration/N10-A7.38-live-staging-trust-gate-LOCKED.cjs');
const evidence=JSON.parse(fs.readFileSync('review/N10-A7.38-LIVE-STAGING-TRUST-MATRIX-NOT-APPLIED.json','utf8'));
const OLD='https://myintmoehein0115024.github.io';
const NEW='https://mmhvault-auth-qa-locked.pages.dev';
const PROD='https://mmhvault.com',WWW='https://www.mmhvault.com';
const ENDPOINT='https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username';
const clone=x=>JSON.parse(JSON.stringify(x));
function options(origin){
 return new Promise((resolve,reject)=>{
  const req=https.request(ENDPOINT,{
   method:'OPTIONS',timeout:13000,headers:{Origin:origin,
    'Access-Control-Request-Method':'POST',
    'Access-Control-Request-Headers':'content-type,apikey,authorization',
    'User-Agent':'MMHVAULT-N10A738-NONAUTH-CORS-AUDIT'}
  },res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,
    bodyBytes:Buffer.concat(chunks).length,redirect:res.headers.location||''}));
  });
  req.on('timeout',()=>req.destroy(Error('OPTIONS_request_timed_out')));
  req.on('error',reject);req.end();
 });
}
test('all approval and cloud mutation gates are hard-coded to false',()=>{
 const src=fs.readFileSync('integration/N10-A7.38-live-staging-trust-gate-LOCKED.cjs','utf8');
 for(const g of ['ALLOW_TURNSTILE_MUTATION','ALLOW_STAGING_EDGE_MUTATION',
  'ALLOW_REAL_ACCOUNT_OPERATIONS','ALLOW_PROD_RELEASE'])
  assert.ok(src.includes('const '+g+'=false;'));
 const m=v.evaluate(evidence);assert.equal(m.canModifyCloud,false);
 assert.equal(m.canRunRealAuth,false);assert.equal(m.canDeployToProduction,false);
 assert.equal(m.canChangeSecrets,false);assert.equal(m.stillBlocked,true);
});
test('live observed Turnstile allowed hostname is ONLY the original GitHub QA origin',()=>{
 assert.deepEqual(evidence.turnstile.configured_allowed_hostnames,['myintmoehein0115024.github.io']);
 assert.equal(evidence.cloudflare.qa_host,'mmhvault-auth-qa-locked.pages.dev');
 assert.equal(evidence.turnstile.proposed_host_allowed,false);
});
test('current observed trust matrix is internally consistent but real login remains denied',()=>{
 const r=v.evaluate(evidence);
 assert.equal(r.evidenceConsistent,true,JSON.stringify(r.reviewErrors));
 assert.equal(r.canRunRealAuth,false);
 assert.equal(r.currentStagingOrigin,OLD);assert.equal(r.proposedQaOrigin,NEW);
});
for(const [label,edit,error] of [
 ['Cloudflare project',x=>x.cloudflare.qa_project='MMHVAULT','wrong_isolated_qa_project'],
 ['Cloudflare domain',x=>x.cloudflare.qa_origin=PROD,'wrong_isolated_qa_project'],
 ['prod DNS binding',x=>x.cloudflare.custom_domains=[PROD],'custom_domain_binding'],
 ['legacy auto deploy',x=>x.cloudflare.deployments_enabled=true,'auto_deploy_enabled'],
 ['prod branch auto deploy',x=>x.cloudflare.production_deployments_enabled=true,'auto_deploy_enabled'],
 ['preview auto deploy',x=>x.cloudflare.preview_deployment_setting='all','auto_deploy_enabled'],
 ['prod Supabase',x=>x.staging.project_id='vrypucmyrztxgiqhjspd','staging_edge_baseline_drift'],
 ['changed Edge version',x=>x.staging.edge_version=12,'staging_edge_baseline_drift'],
 ['new allowed origin',x=>x.staging.origin=NEW,'unexpected_staging_origin'],
 ['live login gate',x=>x.staging.code_gate_open=true,'staging_window_not_closed'],
 ['window open',x=>x.staging.window_end_utc='2026-10-30T08:00:00.000Z','staging_window_not_closed'],
 ['secret guessed false',x=>x.staging.enabled_secret_state=false,'unverified_secret_state'],
 ['unapproved widget hostname',x=>x.turnstile.configured_allowed_hostnames=[NEW.slice(8)],'qa_hostname_setting_changed_without_review'],
 ['production Turnstile host',x=>x.turnstile.configured_allowed_hostnames=['mmhvault.com'],'production_domain_in_turnstile'],
 ['diagnostic extension',x=>x.diagnostic.expires_utc='2026-11-01T17:00:00.000Z','diagnostic_baseline_changed'],
 ['release ready',x=>x.acceptance.release_ready=true,'release_status_unsafe'],
 ['user auth approval flag',x=>x.user_has_approved_real_auth_window=true,'user_has_approved_real_auth_window_not_false']
]){
 test('fail closed when proposed manifest mutated: '+label,()=>{
  const m=clone(evidence);edit(m);
  const a=v.evaluate(m);
  assert.equal(a.canRunRealAuth,false);assert.equal(a.evidenceConsistent,false);
  assert.ok(a.reviewErrors.includes(error),JSON.stringify(a.reviewErrors));
 });
}
test('local CORS decoder validates exact origins with no credentials',()=>{
 const get=(origin,acao)=>v.inspectOptions({status:204,
  headers:{...(acao===undefined?{}:{'Access-Control-Allow-Origin':acao}),'Vary':'Origin'}},origin);
 assert.equal(get(OLD,OLD).ok,true);
 assert.equal(get(NEW,undefined).ok,true);
 assert.equal(get(PROD,undefined).ok,true);
 assert.equal(get(WWW,undefined).ok,true);
 assert.equal(get(NEW,NEW).ok,false);
 assert.equal(get(PROD,PROD).ok,false);
 assert.equal(get(OLD,undefined).ok,false);
 assert.equal(v.inspectOptions({status:200,headers:{}},OLD).ok,false);
 assert.equal(v.inspectOptions({status:204,headers:{
  'Access-Control-Allow-Origin':OLD,
  'Access-Control-Allow-Credentials':'true','Vary':'Origin'}},OLD).ok,false);
});
test('independent locked Cloudflare page still blocks all real Supabase connections',()=>{
 const p=fs.readFileSync('hosting/n10a732-preview/_headers','utf8');
 const html=fs.readFileSync('hosting/n10a732-preview/index.html','utf8');
 assert.match(p,/connect-src 'none'/);
 assert.match(p,/frame-ancestors 'none'/);
 assert.match(html,/id="login-password"[^>]*disabled|id="locked-password"[^>]*disabled/);
 assert.match(html,/id="real-run"[^>]*disabled/);
});
test('credential UI review is still not connected to real staging backend',()=>{
 const p=fs.readFileSync('review/n10a737-credential-qa-LOCKED/assets/auth-qa.js','utf8');
 for(const g of ['REAL_AUTH_ENABLED=false','REAL_REGISTRATION_ENABLED=false',
  'REAL_RESET_ENABLED=false','GOOGLE_OAUTH_ENABLED=false'])
  assert.ok(p.includes('const '+g));
 assert.doesNotMatch(p,/\bfetch\s*\(|\bcreateClient\s*\(|\bsignInWithPassword\s*\(/);
});
test('review-only Stage v11 candidate is not active in original QA live build',()=>{
 const liveBuild=fs.readFileSync('hosting/N10-A7.32-build-quarantined-preview.cjs','utf8');
 assert.ok(!liveBuild.includes('N10-A7.36-staging-edge-pages-origin'));
 assert.ok(!liveBuild.includes('n10a737'));
});
for(const [label,origin,expected] of [
 ['original GitHub QA',OLD,'old_qa_options_allowed'],
 ['new Cloudflare QA',NEW,'unauthorized_options_without_acao'],
 ['formal production',PROD,'unauthorized_options_without_acao'],
 ['www formal production',WWW,'unauthorized_options_without_acao']
]){
 test('REAL deployed Staging Edge OPTIONS only: '+label,async()=>{
  const res=await options(origin);
  assert.equal(res.status,204,JSON.stringify(res));
  assert.equal(res.bodyBytes,0);
  assert.equal(res.redirect,'');
  const a=v.inspectOptions(res,origin);
  assert.equal(a.ok,true,JSON.stringify(a));
  assert.equal(a.code,expected);
  assert.match(res.headers['cache-control']||'',/no-store/);
 });
}
