'use strict';
/*
 * N10-A7.39-P1 Cloudflare Access and separate Turnstile pre-deployment guard.
 * NO CLOUD MUTATIONS, NO AUTH, NO NETWORK. Fail closed against live evidence.
 */
const CLOUD_DEPLOYMENT_ALLOWED=false;
const REAL_AUTH_ALLOWED=false;
const STAGING_EDGE_MUTATION_ALLOWED=false;
const TURNSTILE_SECRET_EXPORT_ALLOWED=false;
const PROD_MUTATION_ALLOWED=false;
const {readFileSync}=require('node:fs');
const SHA='0352514a17a62da58fbebea97ac0c570d6cf4bfcc50dc78bb7bdedc3774479e7';
const NEW='mmhvault-auth-g10g11-locked.pages.dev';
const OLD='myintmoehein0115024.github.io';
function check(evidence){
 const reasons=[];
 const p=evidence?.pages_project||{},a=evidence?.access||{},t=evidence?.turnstile||{},s=evidence?.staging||{};
 if(evidence?.phase!=='N10-A7.39-P1'||evidence?.kind!=='NONEXECUTABLE_CLOUD_EVIDENCE_AND_FAIL_CLOSED_ROLLOUT')
  reasons.push('invalid_evidence_kind');
 if(p.name!=='mmhvault-auth-g10g11-locked'||p.hostname!==NEW||
    p.source_repo!=='myintmoehein0115024/MMHVAULT-Auth-QA'||
    p.source_branch!=='n10-a7-3-staging-readonly-review'||
    p.build_command!=='node review/N10-A7.37-build-credential-ui-LOCKED.cjs'||
    p.build_output!=='qa/n10a737-preview-dist')
  reasons.push('wrong_private_host_source');
 if(p.deploy_legacy_enabled!==false||p.deploy_production_enabled!==false||
    p.deploy_preview_setting!=='none'||p.confirmed_total_deployments!==0||
    p.confirmed_successful_deployments!==0||
    p.public_login_page_exists!==false||p.access_protected_credential_page_exists!==false||
    p.secrets_deployed!==false)reasons.push('unsafe_deployed_host');
 if(a.enabled!==false||a.read_error!=='HTTP_403_9999_access.api.error.not_enabled'||
   a.requires_user_dashboard_activation!==true||a.access_application_installed!==false||
   a.policy_exists!==false||a.exact_domain_covered!==false||
   a.unauthorized_guest_403_verified!==false||a.bypass_routes_reviewed!==false||
   a.permitted_identity!=='UNSET')reasons.push('access_state_drift');
 if(t.dedicated_widget_created!==true||t.name!=='MMHVAULT-G10G11-Independent-Staging'||
   t.mode!=='managed'||!Array.isArray(t.permitted_hostnames)||
   t.permitted_hostnames.length!==1||t.permitted_hostnames[0]!==NEW||
   t.backend_secret_deployed!==false||t.original_widget_unchanged!==true||
   t.original_widget_domains?.length!==1||t.original_widget_domains[0]!==OLD)
  reasons.push('turnstile_scope_drift');
 if(s.project_id!=='ldivswlhtgmznzwhzsoi'||s.edge_slug!=='mmh-n10a6-username'||
    s.edge_version!==11||s.live_origin!=='https://'+OLD||
    s.proposed_new_origin!=='https://'+NEW||
    s.live_edge_code_gate_open!==false||
    s.live_utc_window_start!=='1970-01-01T00:00:00.000Z'||
    s.live_utc_window_end!=='1970-01-01T00:00:00.000Z'||
    s.live_enabled_secret!=='UNKNOWN'||s.edge_deploy_permitted!==false||
    s.real_account_operations_permitted!==false)reasons.push('staging_hardlock_drift');
 if(evidence?.release_ready!==false||evidence?.g10!=='NOT_RUN'||evidence?.g11!=='NOT_RUN')
  reasons.push('release_gate_mismatch');
 for(const name of ['mmhvault.com','www.mmhvault.com','vrypucmyrztxgiqhjspd'])
  if(!evidence?.explicitly_excluded?.includes(name))
   reasons.push('excluded_production_resource_missing');
 return Object.freeze({
  observedConfigurationConsistent:reasons.length===0,
  auditErrors:Object.freeze([...new Set(reasons)]),
  cloudChangesPerformed:false,
  siteMustRemainUndeployed:true,
  accessRequiresHumanDashboardActivation:true,
  realCredentialsPermitted:false,turnstileActivationPermitted:false,
  g10g11Status:'PENDING',productionReleaseAllowed:false
 });
}
function checkEdgeCandidate(source){
 const errors=[];
 if(typeof source!=='string'||!source.includes('Derived from live Staging mmh-n10a6-username v11 SHA256 '+SHA))
  errors.push('staging_source_reference_missing');
 if(!source.includes("const ORIGIN = 'https://"+NEW+"';")||
    !source.includes("const HOSTNAME = '"+NEW+"';"))
  errors.push('new_hostname_not_exact');
 if(!source.includes('const CODE_GATE_OPEN = false;')||
    !source.includes("const WINDOW_START_UTC = '1970-01-01T00:00:00.000Z';")||
    !source.includes("const WINDOW_END_UTC = '1970-01-01T00:00:00.000Z';"))
  errors.push('edge_real_auth_lock_unsafe');
 if(!source.includes("env('N10A6_STAGING_ENABLED') === 'true'")||
    !source.includes("j?.hostname === HOSTNAME && j?.action === action"))
  errors.push('lost_secret_or_action_verification');
 if(source.includes('vrypucmyrztxgiqhjspd')||source.includes('sb_secret_'))
  errors.push('production_secret_or_project_leaked');
 return Object.freeze({valid:errors.length===0,proposedOnly:true,cloudApplied:false,
  blockers:Object.freeze(errors)});
}
function checkCredentialPreview(){
 const js=readFileSync('review/n10a737-credential-qa-LOCKED/assets/auth-qa.js','utf8');
 const headers=readFileSync('review/n10a737-credential-qa-LOCKED/_headers','utf8');
 const build=readFileSync('review/N10-A7.37-build-credential-ui-LOCKED.cjs','utf8');
 const failures=[];
 for(const x of ['REAL_AUTH_ENABLED','REAL_REGISTRATION_ENABLED','REAL_RESET_ENABLED','GOOGLE_OAUTH_ENABLED'])
  if(!js.includes('const '+x+'=false;'))failures.push(x+'_not_locked');
 for(const x of ["connect-src 'none'","form-action 'none'","frame-ancestors 'none'"])
  if(!headers.includes(x))failures.push('credential_preview_headers_unsafe');
 if(!build.includes('qa/n10a737-preview-dist')||
    !build.includes('REAL_AUTH_ENABLED=false'))
  failures.push('unexpected_credential_preview_build');
 return Object.freeze({valid:failures.length===0,canAcceptCredentials:false,errors:failures});
}
module.exports={check,checkEdgeCandidate,checkCredentialPreview,NEW,OLD};
