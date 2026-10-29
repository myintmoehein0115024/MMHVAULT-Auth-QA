'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const v=require('../integration/N10-A7.34-pages-trigger-and-origin-LOCKED.cjs');
const source=fs.readFileSync('integration/N10-A7.34-pages-trigger-and-origin-LOCKED.cjs','utf8');
const stable='b99e5b10fa0ee68aa02a9f6f8a6b0d1397ba50cc';
const project={
 name:'mmhvault-auth-qa-locked',subdomain:'mmhvault-auth-qa-locked.pages.dev',
 production_branch:'n10-a7-3-staging-readonly-review',
 source:{type:'github',config:{repo_name:'MMHVAULT-Auth-QA',
  production_branch:'n10-a7-3-staging-readonly-review',
  deployments_enabled:true,production_deployments_enabled:false,
  preview_deployment_setting:'none'}},
 build_config:{build_command:'node hosting/N10-A7.32-build-quarantined-preview.cjs',
  destination_dir:'qa/n10a732-preview-dist'},
 custom_domains:[]
};
const sampleDeployments=[
 {projectName:v.PROJECT,branch:v.BRANCH,trigger:'github:push',stage:'queued',status:'idle',
  sha:'ad3b17c5a9923e0aefeeb31bf05ba4c18cd64dee'},
 {projectName:v.PROJECT,branch:v.BRANCH,trigger:'github:push',stage:'queued',status:'idle',
  sha:'47bcfefd7ffed9d8f1591e8a707aa7c66d41b6f9'},
 {projectName:v.PROJECT,branch:v.BRANCH,trigger:'github:push',stage:'queued',status:'idle',
  sha:'a6c43ab8ec19858f78c114d9e857331355d35d86'},
 {projectName:v.PROJECT,branch:v.BRANCH,trigger:'ad_hoc',stage:'deploy',status:'success',sha:stable}
];
function baseScope(){
 return {hostingOrigin:v.LOCKED_QA,edgeOrigin:v.OLD_QA,turnstileHostname:'myintmoehein0115024.github.io',
  sitekeyHostname:'myintmoehein0115024.github.io',jsSdkOrigin:v.OLD_QA,
  expectedAction:'mmh_n10a6_login',codeGate:false,windowStartUTC:v.CLOSED,windowEndUTC:v.CLOSED,
  secretEnabled:false,userApprovedStagingChange:false};
}
const clone=x=>JSON.parse(JSON.stringify(x));
test('three explicit immutable real-cloud/authorization gates are false',()=>{
 assert.match(source,/const ALLOW_CLOUDFLARE_MUTATION=false/);
 assert.match(source,/const ALLOW_STAGING_ORIGIN_MIGRATION=false/);
 assert.match(source,/const ALLOW_REAL_G10_G11=false/);
 for(const f of ['deploy','patchCloudflare','setSecret','enableLogin','changeOrigin'])
  assert.equal(Object.hasOwn(v,f),false);
});
test('Cloudflare read-only observation flags deprecated global deploy true even if fine-grained false',()=>{
 const r=v.pagesConfigReview(project);
 assert.equal(r.configCoherent,false);
 assert.ok(r.blockers.includes('legacy_deployments_enabled_not_false'));
 assert.ok(!r.blockers.includes('production_auto_deploy_not_disabled'));
 assert.ok(!r.blockers.includes('preview_auto_deploy_not_disabled'));
 assert.equal(r.automaticDeployGuaranteedOff,false);
 assert.equal(r.mutationPerformed,false);
});
test('all three deployment controls false is a coherent CONFIG proposal, not proof of future behavior',()=>{
 const c=clone(project);c.source.config.deployments_enabled=false;
 const r=v.pagesConfigReview(c);assert.equal(r.configCoherent,true);
 assert.equal(r.automaticDeployGuaranteedOff,false);
});
for(const [name,change,error] of [
 ['wrong site',x=>x.name='other','wrong_pages_project'],
 ['unexpected subdomain',x=>x.subdomain='mmhvault.com','unexpected_pages_domain'],
 ['wrong GitHub repo',x=>x.source.config.repo_name='MMHVAULT','wrong_pages_source'],
 ['wrong GitHub branch',x=>x.production_branch='main','wrong_pages_source'],
 ['auto production enabled',x=>x.source.config.production_deployments_enabled=true,'production_auto_deploy_not_disabled'],
 ['auto preview enabled',x=>x.source.config.preview_deployment_setting='all','preview_auto_deploy_not_disabled'],
 ['custom prod hostname',x=>x.custom_domains=['mmhvault.com'],'custom_domain_not_empty'],
 ['custom qa hostname',x=>x.custom_domains=['qa.mmhvault.com'],'custom_domain_not_empty'],
 ['changed build command',x=>x.build_config.build_command='npx wrangler pages deploy','unsafe_build_command_or_output'],
 ['wrong build output',x=>x.build_config.destination_dir='public','unsafe_build_command_or_output'],
 ['missing source',x=>delete x.source,'wrong_pages_source']
]){
 test('Cloudflare config review denies '+name,()=>{
  const x=clone(project);x.source.config.deployments_enabled=false;change(x);
  const r=v.pagesConfigReview(x);
  assert.equal(r.configCoherent,false);assert.ok(r.blockers.includes(error),JSON.stringify(r));
 });
}
test('four observed deployments distinguish one successful ad hoc from three queued/idle',()=>{
 const r=v.lineageReview(sampleDeployments,stable);
 assert.equal(r.ok,true);assert.equal(r.successfulCount,1);assert.equal(r.queuedIdleCount,3);
 assert.equal(r.futureDeploymentPreventionProved,false);
 assert.equal(r.authAllowed,false);
});
test('missing deployment evidence rejects a conclusion',()=>{
 for(const x of [[],null,{},undefined]){
  assert.equal(v.lineageReview(x,stable).ok,false);
 }
 assert.equal(v.lineageReview(sampleDeployments,'invalid').ok,false);
});
test('unexpected second successful deployment is not treated as harmless queued event',()=>{
 const x=clone(sampleDeployments);
 x[0]={...x[0],trigger:'github:push',stage:'deploy',status:'success'};
 const r=v.lineageReview(x,stable);assert.equal(r.ok,false);
 assert.ok(r.blockers.includes('success_baseline_changed'));
});
test('non-idle queued or changed process state requires review',()=>{
 const x=clone(sampleDeployments);x[0].status='active';
 assert.ok(v.lineageReview(x,stable).blockers.includes('unreviewed_deployment_stage'));
});
test('unexpected foreign branch and project cannot be accepted as QA',()=>{
 const x=clone(sampleDeployments);x[0].branch='main';x[1].projectName='MMHVAULT';
 assert.ok(v.lineageReview(x,stable).blockers.includes('foreign_deployment_record'));
});
test('unknown queued trigger is not accepted',()=>{
 const x=clone(sampleDeployments);x[0].trigger='ad_hoc';
 assert.ok(v.lineageReview(x,stable).blockers.includes('unexpected_queued_trigger'));
});
test('successful SHA must match actual manually deployed locked build',()=>{
 assert.ok(v.lineageReview(sampleDeployments,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  .blockers.includes('success_baseline_changed'));
});
test('a queued record with same locked SHA signals additional review',()=>{
 const x=clone(sampleDeployments);x[0].sha=stable;
 assert.ok(v.lineageReview(x,stable).blockers.includes('duplicate_success_baseline_queued'));
});
test('correct locked QA host is deliberately different from Staging code origin',()=>{
 const x=baseScope();
 assert.notEqual(v.LOCKED_QA,v.OLD_QA);
 const r=v.migrationScope(x);
 assert.equal(r.ready,false);assert.equal(r.canRunRealAuth,false);
 assert.ok(r.blockers.includes('staging_change_approval_missing'));
 assert.ok(r.blockers.includes('staging_origin_change_not_authorized'));
});
for(const [name,modify,error] of [
 ['wrong Pages host',x=>x.hostingOrigin='https://mmhvault.com','not_the_isolated_locked_qa_host'],
 ['www production host',x=>x.hostingOrigin='https://www.mmhvault.com','not_the_isolated_locked_qa_host'],
 ['new Pages host to old SDK guard',x=>x.jsSdkOrigin=v.LOCKED_QA,'sdk_origin_not_current'],
 ['new Pages host to Staging CORS without approval',x=>x.edgeOrigin=v.LOCKED_QA,'staging_edge_origin_not_current'],
 ['Turnstile changed hostname',x=>x.turnstileHostname='mmhvault-auth-qa-locked.pages.dev','turnstile_hostname_not_current'],
 ['Turnstile sitekey hostname changed',x=>x.sitekeyHostname='mmhvault-auth-qa-locked.pages.dev','turnstile_hostname_not_current'],
 ['CAPTCHA unsupported action',x=>x.expectedAction='mmh_signup','captcha_action_unexpected'],
 ['Edge codegate open',x=>x.codeGate=true,'staging_window_not_closed'],
 ['window future',x=>x.windowEndUTC='2026-10-30T09:00:00.000Z','staging_window_not_closed'],
 ['Secret unknown',x=>x.secretEnabled=undefined,'staging_secret_not_confirmed_false'],
 ['Secret true',x=>x.secretEnabled=true,'staging_secret_not_confirmed_false']
]){
 test('origin plan rejects '+name,()=>{
  const x=baseScope();modify(x);const r=v.migrationScope(x);
  assert.equal(r.canRunRealAuth,false);assert.ok(r.blockers.includes(error),JSON.stringify(r));
 });
}
test('even a synthetic approval flag cannot authorize code-level cloud change',()=>{
 const x=baseScope();x.userApprovedStagingChange=true;
 const r=v.migrationScope(x);
 assert.equal(r.ready,false);assert.equal(r.canRunRealAuth,false);
 assert.equal(r.canModifyCloud,false);
 assert.ok(r.blockers.includes('real_g10_g11_not_authorized'));
});
test('strict origin parser rejects deceptive URL variants',()=>{
 for(const u of ['http://mmhvault-auth-qa-locked.pages.dev',
  'https://mmhvault-auth-qa-locked.pages.dev.evil.example',
  'https://mmhvault-auth-qa-locked.pages.dev/path',
  'https://mmhvault-auth-qa-locked.pages.dev?token=abc',
  'https://x:mmh@mmhvault-auth-qa-locked.pages.dev/',
  'https://mmhvault-auth-qa-locked.pages.dev:8443/'])
  assert.notEqual(v.originOf(u),v.LOCKED_QA);
 assert.equal(v.originOf(v.LOCKED_QA),v.LOCKED_QA);
});
test('locked Pages live output cannot become credential form by proposed migration',()=>{
 const html=fs.readFileSync('hosting/n10a732-preview/index.html','utf8');
 const headers=fs.readFileSync('hosting/n10a732-preview/_headers','utf8');
 assert.match(html,/id="locked-password"[^>]*disabled/);
 assert.match(html,/id="real-run"[^>]*disabled/);
 assert.match(headers,/connect-src 'none'/);
 assert.match(headers,/frame-src 'none'/);
});
test('historical six integration/authorization locks remain false',()=>{
 for(const [file,check] of [
 ['integration/N10-A7.23-real-username-acceptance-LOCKED.cjs','ALLOW_REAL_OPERATIONS=false'],
 ['integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs','STAGING_ADAPTER_ENABLED=false'],
 ['integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs','STAGING_SDK_BOOTSTRAP_ENABLED=false'],
 ['integration/N10-A7.29-turnstile-actions-LOCKED.cjs','ALLOW_TURNSTILE_ACTIONS=false'],
 ['integration/N10-A7.30-browser-acceptance-LOCKED.cjs','ALLOW_BROWSER_ACCEPTANCE=false'],
 ['integration/N10-A7.31-host-and-edge-evidence-LOCKED.cjs','ALLOW_REAL_STAGING_SIGNOFF=false'],
 ['integration/N10-A7.31-closure-reconciliation-LOCKED.cjs','ALLOW_ROLLBACK_EXECUTION=false']
 ]){
  assert.ok(fs.readFileSync(file,'utf8').includes('const '+check),file);
 }
});
