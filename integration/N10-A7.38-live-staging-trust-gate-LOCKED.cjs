'use strict';
/*
 N10-A7.38 ISOLATED STAGING TRUST BOUNDARY REVIEW.
 No dynamic cloud writes, no credentials, no secrets, no real authentication.
 Evaluate an evidence snapshot only; never treat user approval as a mutable flag.
*/
const ALLOW_TURNSTILE_MUTATION=false;
const ALLOW_STAGING_EDGE_MUTATION=false;
const ALLOW_REAL_ACCOUNT_OPERATIONS=false;
const ALLOW_PROD_RELEASE=false;
const PROD=Object.freeze(['mmhvault.com','www.mmhvault.com']);
const TARGET='mmhvault-auth-qa-locked.pages.dev';
const OLD='myintmoehein0115024.github.io';
function evaluate(m){
 const blockers=[];
 if(m?.kind!=='READ_ONLY_LIVE_EVIDENCE_NOT_APPLIED'||m?.phase!=='N10-A7.38')
  blockers.push('invalid_evidence_kind');
 for(const key of ['user_has_approved_real_auth_window','allow_staging_change',
 'allow_cloudflare_turnstile_widget_change','allow_open_registration',
 'allow_real_login','allow_production_deploy','allow_secret_rotation']){
  if(m?.[key]!==false)blockers.push(key+'_not_false');
 }
 const c=m?.cloudflare||{},s=m?.staging||{},t=m?.turnstile||{},d=m?.diagnostic||{};
 if(c.qa_project!=='mmhvault-auth-qa-locked'||c.qa_host!==TARGET||
   c.qa_origin!=='https://'+TARGET||c.source_repo!=='myintmoehein0115024/MMHVAULT-Auth-QA')
  blockers.push('wrong_isolated_qa_project');
 if(!Array.isArray(c.custom_domains)||c.custom_domains.length!==0)
  blockers.push('custom_domain_binding');
 if(c.deployments_enabled!==false||c.production_deployments_enabled!==false||
   c.preview_deployment_setting!=='none')
  blockers.push('auto_deploy_enabled');
 if(s.project_id!=='ldivswlhtgmznzwhzsoi'||s.edge_version!==11||
  s.edge_source_sha256!=='0352514a17a62da58fbebea97ac0c570d6cf4bfcc50dc78bb7bdedc3774479e7')
  blockers.push('staging_edge_baseline_drift');
 if(s.origin!=='https://'+OLD||s.captcha_hostname!==OLD)
  blockers.push('unexpected_staging_origin');
 if(s.code_gate_open!==false||s.window_start_utc!=='1970-01-01T00:00:00.000Z'||
   s.window_end_utc!=='1970-01-01T00:00:00.000Z')
  blockers.push('staging_window_not_closed');
 if(s.enabled_secret_state!=='UNKNOWN_NOT_READABLE')
  blockers.push('unverified_secret_state');
 if(t.widget_name!=='MMHVAULT-Username-Staging'||t.mode!=='managed'||
  !Array.isArray(t.configured_allowed_hostnames))
  blockers.push('unexpected_widget');
 else {
  if(t.configured_allowed_hostnames.some(h=>PROD.includes(h)))
   blockers.push('production_domain_in_turnstile');
  if(t.configured_allowed_hostnames.includes(TARGET)||
     t.proposed_host_allowed!==false)
   blockers.push('qa_hostname_setting_changed_without_review');
 }
 if(d.function_slug!=='mmh-n10a15-siteverify-qa'||d.version!==2||
  d.expires_utc!=='2026-10-30T17:00:00.000Z'||d.status!=='NOT_RENEWED')
  blockers.push('diagnostic_baseline_changed');
 if(m?.acceptance?.release_ready!==false||m?.acceptance?.production!=='BLOCKED'||
  m?.acceptance?.g10!=='PENDING'||m?.acceptance?.g11!=='PENDING')
  blockers.push('release_status_unsafe');
 const reasons=['turnstile_qa_hostname_not_allowed','staging_edge_qa_origin_not_allowed',
  'staging_browser_sdk_qa_origin_not_allowed','credential_qa_csp_disallows_network',
  'code_and_utc_window_closed','enabled_secret_unverified','live_g10_g11_unapproved'];
 for(const name of reasons)if(!m?.blockers?.includes(name))blockers.push('missing_'+name);
 return Object.freeze({
  evidenceConsistent:blockers.length===0,
  reviewErrors:Object.freeze(blockers),
  proposedQaOrigin:'https://'+TARGET,
  currentStagingOrigin:'https://'+OLD,
  stillBlocked:true,
  canRunRealAuth:false,
  canDeployToProduction:false,
  canChangeSecrets:false,
  canModifyCloud:false,
  action:'READ_ONLY_PRECHECK_ONLY'
 });
}
function inspectOptions(response,origin){
 const status=response?.status;
 const get=(name)=>{
  const h=response?.headers||{};
  const match=Object.keys(h).find(k=>k.toLowerCase()===name.toLowerCase());
  return match?String(h[match]):null;
 };
 const aca=get('access-control-allow-origin'),creds=get('access-control-allow-credentials');
 const varies=get('vary');
 const policy={status,origin,acao:aca,credentials:creds};
 if(status!==204)return {...policy,ok:false,code:'unexpected_options_status'};
 if(creds!==null)return {...policy,ok:false,code:'credential_cors_unexpected'};
 if(origin==='https://'+OLD){
  return {...policy,ok:aca===origin&&/Origin/i.test(varies||''),
   code:aca===origin&&/Origin/i.test(varies||'')?'old_qa_options_allowed':'old_qa_cors_missing'};
 }
 if(origin==='https://'+TARGET||origin==='https://mmhvault.com'||origin==='https://www.mmhvault.com'){
  return {...policy,ok:aca===null,code:aca===null?'unauthorized_options_without_acao':'unexpected_origin_allowed'};
 }
 return {...policy,ok:false,code:'unsupported_test_origin'};
}
module.exports={evaluate,inspectOptions,OLD,TARGET,PROD};
