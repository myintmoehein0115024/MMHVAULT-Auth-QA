'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const v=require('../integration/N10-A7.39-P1-access-guard-NEVER-DEPLOY.cjs');
const p=JSON.parse(fs.readFileSync('review/N10-A7.39-P1-ISOLATED-HOST-ACCESS-GATE-NOT-APPLIED.json','utf8'));
const edge=fs.readFileSync('review/N10-A7.39-P1-EDGE-ISOLATED-HOST-CLOSED-NEVER-DEPLOY.ts','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
test('exact observed state of isolated Pages + dedicated Turnstile is consistent',()=>{
 const x=v.check(p);assert.equal(x.observedConfigurationConsistent,true,JSON.stringify(x.auditErrors));
 assert.equal(x.siteMustRemainUndeployed,true);assert.equal(x.accessRequiresHumanDashboardActivation,true);
 assert.equal(x.realCredentialsPermitted,false);assert.equal(x.turnstileActivationPermitted,false);
 assert.equal(x.productionReleaseAllowed,false);assert.equal(x.g10g11Status,'PENDING');
});
test('independent Pages project has no deployed credential site and all three autobuild controls disabled',()=>{
 assert.equal(p.pages_project.confirmed_total_deployments,0);
 assert.equal(p.pages_project.confirmed_successful_deployments,0);
 assert.equal(p.pages_project.deploy_legacy_enabled,false);
 assert.equal(p.pages_project.deploy_production_enabled,false);
 assert.equal(p.pages_project.deploy_preview_setting,'none');
});
test('Cloudflare Access is NOT available and no private credentials page may be deployed',()=>{
 assert.equal(p.access.enabled,false);
 assert.equal(p.access.read_error,'HTTP_403_9999_access.api.error.not_enabled');
 assert.equal(p.access.requires_user_dashboard_activation,true);
 assert.equal(p.access.unauthorized_guest_403_verified,false);
 assert.equal(p.access.exact_domain_covered,false);
});
test('independent widget allows only the isolated host and keeps original intact',()=>{
 assert.deepEqual(p.turnstile.permitted_hostnames,['mmhvault-auth-g10g11-locked.pages.dev']);
 assert.deepEqual(p.turnstile.original_widget_domains,['myintmoehein0115024.github.io']);
 assert.equal(p.turnstile.backend_secret_deployed,false);
 assert.equal(p.turnstile.original_widget_unchanged,true);
});
test('candidate Edge still cannot perform login and is never deployed',()=>{
 const r=v.checkEdgeCandidate(edge);
 assert.equal(r.valid,true,JSON.stringify(r.blockers));assert.equal(r.proposedOnly,true);assert.equal(r.cloudApplied,false);
});
test('credential preview remains locked under HTTP CSP and build whitelist',()=>{
 const r=v.checkCredentialPreview();
 assert.equal(r.valid,true,JSON.stringify(r.errors));assert.equal(r.canAcceptCredentials,false);
});
test('no remote Cloudflare or Supabase API clients and no real auth authorizers exist in guard code',()=>{
 const src=fs.readFileSync('integration/N10-A7.39-P1-access-guard-NEVER-DEPLOY.cjs','utf8');
 for(const name of ['CLOUD_DEPLOYMENT_ALLOWED','REAL_AUTH_ALLOWED','STAGING_EDGE_MUTATION_ALLOWED',
  'TURNSTILE_SECRET_EXPORT_ALLOWED','PROD_MUTATION_ALLOWED'])
  assert.ok(src.includes('const '+name+'=false;'));
 assert.doesNotMatch(src,/\bfetch\s*\(|\bhttps\.request\s*\(|\bcreateClient\s*\(/);
});
for(const [label,mutate,reason] of [
 ['foreign repo',x=>x.pages_project.source_repo='myintmoehein0115024/MMHVAULT','wrong_private_host_source'],
 ['changed build script',x=>x.pages_project.build_command='npm start','wrong_private_host_source'],
 ['auto-deploy production',x=>x.pages_project.deploy_production_enabled=true,'unsafe_deployed_host'],
 ['auto-deploy global',x=>x.pages_project.deploy_legacy_enabled=true,'unsafe_deployed_host'],
 ['preview enabled',x=>x.pages_project.deploy_preview_setting='all','unsafe_deployed_host'],
 ['external public deployment',x=>x.pages_project.confirmed_successful_deployments=1,'unsafe_deployed_host'],
 ['public login page claimed',x=>x.pages_project.public_login_page_exists=true,'unsafe_deployed_host'],
 ['Access enabled without approval evidence',x=>x.access.enabled=true,'access_state_drift'],
 ['Access policy claimed',x=>x.access.policy_exists=true,'access_state_drift'],
 ['Access guest 403 claimed',x=>x.access.unauthorized_guest_403_verified=true,'access_state_drift'],
 ['Access identity fabricated',x=>x.access.permitted_identity='owner@example.com','access_state_drift'],
 ['Turnstile adds production',x=>x.turnstile.permitted_hostnames.push('mmhvault.com'),'turnstile_scope_drift'],
 ['Old Turnstile changed',x=>x.turnstile.original_widget_domains=['mmhvault.com'],'turnstile_scope_drift'],
 ['Turnstile secret claimed deployed',x=>x.turnstile.backend_secret_deployed=true,'turnstile_scope_drift'],
 ['Edge points to production',x=>x.staging.project_id='vrypucmyrztxgiqhjspd','staging_hardlock_drift'],
 ['Edge gate opened',x=>x.staging.live_edge_code_gate_open=true,'staging_hardlock_drift'],
 ['Window opened',x=>x.staging.live_utc_window_end='2026-10-29T11:00:00.000Z','staging_hardlock_drift'],
 ['Secret state guessed',x=>x.staging.live_enabled_secret=false,'staging_hardlock_drift'],
 ['Release ready set',x=>x.release_ready=true,'release_gate_mismatch']
]){
 test('fail closed when review evidence tampered: '+label,()=>{
  const x=clone(p);mutate(x);
  const result=v.check(x);
  assert.equal(result.observedConfigurationConsistent,false);
  assert.ok(result.auditErrors.includes(reason),JSON.stringify(result.auditErrors));
  assert.equal(result.realCredentialsPermitted,false);
 });
}
for(const [label,change,reason] of [
 ['Origin wrong host',x=>x.replace("const ORIGIN = 'https://mmhvault-auth-g10g11-locked.pages.dev';","const ORIGIN = 'https://mmhvault.com';"),'new_hostname_not_exact'],
 ['Login opened',x=>x.replace('const CODE_GATE_OPEN = false;','const CODE_GATE_OPEN = true;'),'edge_real_auth_lock_unsafe'],
 ['No captcha action validation',x=>x.replace("j?.hostname === HOSTNAME && j?.action === action","j?.hostname === HOSTNAME"),'lost_secret_or_action_verification'],
 ['Prod project reference',x=>x+'\n// vrypucmyrztxgiqhjspd','production_secret_or_project_leaked']
]){
 test('staging candidate refuses '+label,()=>{
  const x=v.checkEdgeCandidate(change(edge));
  assert.equal(x.valid,false);
  assert.ok(x.blockers.includes(reason),JSON.stringify(x.blockers));
 });
}
test('old locked QA website original bundle never imports new host candidate',()=>{
 const original=fs.readFileSync('hosting/N10-A7.32-build-quarantined-preview.cjs','utf8');
 assert.doesNotMatch(original,/N10-A7\.39-P1|mmhvault-auth-g10g11-locked/);
});
