'use strict';
/**
 * N10-A7.39-P0. Evaluate preflight only. This module NEVER opens staging,
 * creates a Cloudflare widget, enables G10/G11, touches secrets, or deploys.
 * User-chosen approval signals remain non-authoritative evidence.
 */
const REAL_AUTH_EXECUTION_ALLOWED=false;
const CLOUD_MUTATIONS_ALLOWED=false;
const PRODUCTION_MUTATIONS_ALLOWED=false;
const CURRENT_STAGING_SHA='0352514a17a62da58fbebea97ac0c570d6cf4bfcc50dc78bb7bdedc3774479e7';
const CLOSED='1970-01-01T00:00:00.000Z';
const STAGING='ldivswlhtgmznzwhzsoi';
const EXPECTED_HOST='mmhvault-auth-qa-locked.pages.dev';
const OLD_HOST='myintmoehein0115024.github.io';
const ALLOWED_SCOPES=Object.freeze(['isolated_staging_existing_test_account_only']);
function exactUTC(value){
 if(typeof value!=='string'||
 !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return null;
 const ms=Date.parse(value);
 return Number.isFinite(ms)&&new Date(ms).toISOString()===value?ms:null;
}
function reviewWindow(window){
 const failures=[];
 if(window?.max_duration_seconds!==900)failures.push('max_duration_not_900');
 if(window?.abort_if_not_ready!==true)failures.push('missing_abort');
 if(window?.stop_on_first_uid_or_rls_mismatch!==true)failures.push('missing_uid_rls_fail_fast');
 if(window?.stop_on_any_unexpected_user_or_alias_delta!==true)failures.push('missing_counter_fail_fast');
 if(window?.require_local_signout!==true)failures.push('missing_local_signout');
 const start=exactUTC(window?.start_utc),end=exactUTC(window?.end_utc);
 if(start===null||end===null)failures.push('window_unscheduled');
 else {
  if(end<=start)failures.push('invalid_utc_order');
  if(end-start>900000)failures.push('window_over_15_minutes');
  if(window?.exact_utc_calendar_date!==window.start_utc.slice(0,10))
   failures.push('window_date_mismatch');
  if(window.start_utc.slice(0,10)!==window.end_utc.slice(0,10))
   failures.push('cross_day_requires_new_approval');
 }
 return {valid:failures.length===0,blockers:[...new Set(failures)],durationSeconds:start!==null&&end!==null?(end-start)/1000:null};
}
function evaluate(p){
 const b=[],r=p?.references||{},o=p?.observed||{},e=p?.preparatory_evidence||{};
 if(p?.phase!=='N10-A7.39-P0'||p.kind!=='PREPARE_ONLY_NEVER_EXECUTE')
  b.push('wrong_review_contract');
 if(!ALLOWED_SCOPES.includes(p?.scope)||r.staging_project_id!==STAGING||
    r.edge_slug!=='mmh-n10a6-username'||r.current_edge_version!==11||
    r.current_edge_sha256!==CURRENT_STAGING_SHA)
  b.push('unapproved_staging_project_or_sha');
 if(r.github_repo!=='myintmoehein0115024/MMHVAULT-Auth-QA'||
    r.git_review_branch!=='n10-a7-3-staging-readonly-review')
  b.push('unapproved_github_source');
 if(r.qa_locked_origin!=='https://'+EXPECTED_HOST||
    r.original_allowed_origin!=='https://'+OLD_HOST||r.production_domain!=='mmhvault.com')
  b.push('unapproved_origin');
 if(o.staging_edge_code_gate_open!==false||
    o.staging_window_start_utc!==CLOSED||o.staging_window_end_utc!==CLOSED)
  b.push('staging_code_and_time_gate_mismatch');
 if(o.staging_secret_enabled_value!=='UNKNOWN')
  b.push('secret_not_observed_as_unknown');
 if(o.turnstile_widget_name!=='MMHVAULT-Username-Staging'||
  !Array.isArray(o.turnstile_allowed_hostnames)||
  o.turnstile_allowed_hostnames.length!==1||
  o.turnstile_allowed_hostnames[0]!==OLD_HOST||
  o.turnstile_new_qa_host_allowed!==false)
  b.push('turnstile_configuration_changed');
 if(o.cloudflare_locked_qa_inputs_disabled!==true||
    o.cloudflare_locked_qa_credential_csp_compatible!==false||
    r.main_credential_input_not_deployed!==true)
  b.push('locked_host_baseline_changed');
 if(o.cloudflare_qa_auto_deploy_legacy!==false||
    o.cloudflare_qa_auto_deploy_production!==false||
    o.cloudflare_qa_auto_deploy_preview!=='none')
  b.push('cloudflare_auto_deploy_changed');
 if(o.prod_hostname_in_staging_config!==false)
  b.push('production_origin_added_to_staging');
 if(r.baseline_auth_user_count!==2||r.baseline_alias_count!==1||
    r.baseline_owner_probe_count!==2||r.baseline_throttle_count!==3)
  b.push('unapproved_baseline_data_change');
 for(const name of ['staging_change_allowed','turnstile_change_allowed',
   'cloudflare_pages_deploy_allowed','staging_secret_change_allowed',
   'real_password_request_allowed','real_g10_g11_allowed','production_release_allowed',
   'release_ready']){
  if(p?.[name]!==false)b.push(name+'_must_remain_false');
 }
 if(e.expected_alias_change_count!==0||e.account_creation_permitted!==false)
  b.push('unexpected_account_or_alias_write');
 if(e.allow_real_test_account!==false||e.approved_preexisting_account_uid_hash!==null||
    e.selected_turnstile_strategy!=='UNSELECTED'||e.selected_credential_host!=='UNSELECTED')
  b.push('real_test_scope_not_yet_approved');
 if(e.credential_host_access_restrictions_reviewed!==false||
    e.credential_host_security_headers_reviewed!==false||
    e.credential_host_sdk_code_reviewed!==false||
    e.required_turnstile_hostname_live_verified!==false||
    e.actual_staging_origin_live_verified!==false||
    e.short_lived_test_window_approved!==false||
    e.approval_scope_documented!==false||
    e.manual_secret_state_verified!==false||
    e.rollback_tested_with_actual_cloud_evidence!==false)
  b.push('real_prerequisites_claimed_complete_without_review');
 const window=reviewWindow(p?.future_test_window);
 // Report readiness blockers even when review snapshot is internally consistent.
 const pending=[
  'turnstile_qa_hostname_missing',
  'credential_enabled_access_restricted_qa_host_missing',
  'credential_page_safe_csp_and_sdk_not_approved',
  'staging_edge_host_and_cors_not_migrated',
  'staging_secret_value_unverified',
  'no_approved_account_or_utc_window',
  'real_g10_g11_not_run'
 ];
 return Object.freeze({
  contractConsistent:b.length===0&&window.blockers.every(x=>x==='window_unscheduled'),
  auditBlockers:Object.freeze([...new Set(b)]),
  pending:Object.freeze([...pending,...window.blockers]),
  timeWindow:window,
  readOnly:true,
  noRealOperations:true,
  realLoginPermitted:false,
  productionReady:false,
  cause:'CONFIG_GAPS_AND_INDEPENDENT_APPROVAL_REQUIRED'
 });
}
function validateCloseEvidence({before,after,reason}={}){
 const blockers=[];
 for(const obj of [before,after]){
  if(obj?.project!==STAGING||obj?.edgeSha!==CURRENT_STAGING_SHA||
    obj?.codeGateOpen!==false||obj?.windowStartUTC!==CLOSED||
    obj?.windowEndUTC!==CLOSED)
   blockers.push('staging_not_closed');
  if(obj?.secretDisabledVerified!==true)
   blockers.push('secret_false_not_independently_verified');
  if(obj?.registrationEnabled!==false)blockers.push('registration_not_closed');
  for(const key of ['authUsers','aliases','ownerProbe','throttle']){
   if(!Number.isSafeInteger(obj?.counts?.[key])||obj.counts[key]<0)
     blockers.push('missing_counters');
  }
 }
 if(!blockers.includes('missing_counters')&&before?.counts&&after?.counts){
  if(before.counts.authUsers!==after.counts.authUsers)blockers.push('auth_users_changed');
  if(before.counts.ownerProbe!==after.counts.ownerProbe)blockers.push('owner_probe_changed');
  if(after.counts.aliases-before.counts.aliases!==0)
   blockers.push('unapproved_alias_delta');
  // Counter cleanup or TTL may reduce rows; flag for review, not auto-fail if DB spec allows it.
  if(after.counts.throttle<before.counts.throttle)blockers.push('throttle_rows_reduced_requires_review');
 }
 if(reason!==undefined&&!(typeof reason==='string'&&/^[a-z_]{3,90}$/.test(reason)))
  blockers.push('invalid_stop_reason');
 return Object.freeze({closedReviewPass:blockers.length===0,
  blockers:Object.freeze([...new Set(blockers)]),realCleanupPerformed:false,
  mayAuthorizeProduction:false,manualSecretVerificationRequired:true});
}
module.exports={evaluate,reviewWindow,exactUTC,validateCloseEvidence,CLOSED,CURRENT_STAGING_SHA,STAGING};
