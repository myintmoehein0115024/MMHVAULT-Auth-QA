'use strict';
/* N10-A7.29 · Approval plan generator ONLY. No GitHub or Supabase write APIs.
 * Real operations remain forbidden. User approval requires a separate future turn. */
const ALLOW_CLOUD_WINDOW_MUTATION=false;
const PROJECT='ldivswlhtgmznzwhzsoi';
const EDGE='mmh-n10a6-username';
const ORIGIN='https://myintmoehein0115024.github.io';
const CLOSED_DATE='1970-01-01T00:00:00.000Z';
function exactUTC(s){
 return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&
  Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s;
}
function windowSafety({startUTC,endUTC,nowUTC,project,origin,edge,registrationEnabled=false}={}){
 if(project!==PROJECT||origin!==ORIGIN||edge!==EDGE)return 'wrong_staging_context';
 if(registrationEnabled!==false)return 'registration_not_closed';
 if(!exactUTC(startUTC)||!exactUTC(endUTC)||!exactUTC(nowUTC))return 'invalid_utc';
 const start=Date.parse(startUTC),end=Date.parse(endUTC),now=Date.parse(nowUTC);
 if(end<=start||end-start>900000)return 'window_not_bounded';
 if(start<=now||end<=now)return 'window_not_future';
 return 'review_window_valid';
}
function makeApprovalPlan(args={}){
 const code=windowSafety(args);
 if(code!=='review_window_valid')return {ok:false,code};
 return Object.freeze({
  ok:true,code:'approval_plan_only',status:'PENDING_EXPLICIT_USER_APPROVAL',
  project:PROJECT,edge:EDGE,allowedOrigin:ORIGIN,
  startUTC:args.startUTC,endUTC:args.endUTC,registrationEnabled:false,
  actions:Object.freeze(['mmh_n10a6_login','mmh_n10a6_bind']),
  realOperationsEnabled:ALLOW_CLOUD_WINDOW_MUTATION,cloudMutationPerformed:false,
  expectedBeforeAndAfter:Object.freeze({codeGateOpen:false,windowStartUTC:CLOSED_DATE,
   windowEndUTC:CLOSED_DATE,secretEnabled:false,releaseReady:false}),
  stopConditions:Object.freeze(['wrong_origin','wrong_project','missing_secret','captcha_error',
   'uid_mismatch','rls_denied','rate_limit','session_cleanup_unconfirmed',
   'time_expired','registration_open']),
  verification:Object.freeze(['G10_same_auth_uid_rls','G11_existing_user_bind_same_uid_rls',
   'local_signout_verified','edge_hard_closed_after','expired_1970_restored',
   'secret_disabled_confirmed','user_counts_reconciled']),
  restrictions:Object.freeze(['no_new_auth_users','no_production_changes',
   'no_real_test_without_explicit_scoped_approval'])
 });
}
module.exports={makeApprovalPlan,windowSafety,exactUTC,PROJECT,EDGE,ORIGIN,CLOSED_DATE};
