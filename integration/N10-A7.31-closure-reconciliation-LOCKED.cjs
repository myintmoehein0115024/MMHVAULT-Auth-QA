'use strict';
/* N10-A7.31 · Offline-only closure reconciliation. Never calls or mutates cloud.
 * All records are submitted evidence. They are not cryptographic attestations.
 * Actual Staging Secret verification remains a separate manual cloud-control step.
 */
const ALLOW_ROLLBACK_EXECUTION=false;
const PROJECT='ldivswlhtgmznzwhzsoi';
const SHA='0352514a17a62da58fbebea97ac0c570d6cf4bfcc50dc78bb7bdedc3774479e7';
const CLOSED='1970-01-01T00:00:00.000Z';
const FATAL_CODES=Object.freeze([
 'window_expired','origin_mismatch','registration_open','captcha_invalid',
 'rate_limited','uid_mismatch','rls_owner_mismatch','session_cleanup_unconfirmed',
 'server_gate_changed','secret_state_unknown','new_auth_user','unexpected_username_bind'
]);
function countsAreValid(c){
 return c&&Number.isSafeInteger(c.authUsers)&&c.authUsers>=0&&
  Number.isSafeInteger(c.aliases)&&c.aliases>=0&&
  Number.isSafeInteger(c.ownerProbe)&&c.ownerProbe>=0&&
  Number.isSafeInteger(c.throttle)&&c.throttle>=0;
}
function closedSnapshot(record){
 const errors=[];
 if(record?.project!==PROJECT)errors.push('wrong_project');
 if(record?.edgeSha!==SHA)errors.push('edge_version_not_restored');
 if(record?.codeGateOpen!==false)errors.push('code_gate_not_closed');
 if(record?.windowStartUTC!==CLOSED||record?.windowEndUTC!==CLOSED)
  errors.push('expired_window_not_restored');
 if(record?.secretDisabledVerified!==true)errors.push('secret_not_manually_verified_disabled');
 if(record?.registrationEnabled!==false)errors.push('registration_not_closed');
 if(!countsAreValid(record?.counts))errors.push('missing_data_counts');
 return Object.freeze({closed:errors.length===0,code:errors.length?'closure_not_verified':'closed_snapshot_pass',
  blockers:Object.freeze(errors)});
}
function reconcileClosedWindow({before,after,allowedAliasDelta=0,stopReasons=[]}={}){
 const first=closedSnapshot(before),last=closedSnapshot(after),blockers=[
  ...first.blockers.map(s=>'before_'+s),...last.blockers.map(s=>'after_'+s)
 ];
 if(!Number.isInteger(allowedAliasDelta)||allowedAliasDelta<0||allowedAliasDelta>1)
  blockers.push('invalid_username_write_allowance');
 if(first.closed&&last.closed&&Number.isInteger(allowedAliasDelta)&&allowedAliasDelta>=0&&allowedAliasDelta<=1){
  if(after.counts.authUsers!==before.counts.authUsers)blockers.push('new_auth_user');
  if(after.counts.ownerProbe!==before.counts.ownerProbe)blockers.push('owner_probe_changed');
  if(after.counts.aliases-before.counts.aliases!==allowedAliasDelta)
   blockers.push('unexpected_username_bind');
  if(after.counts.throttle<before.counts.throttle)
   blockers.push('throttle_counter_rolled_back_or_missing');
 }
 if(!Array.isArray(stopReasons)||stopReasons.some(x=>typeof x!=='string'))
  blockers.push('stop_reason_log_invalid');
 else for(const reason of stopReasons)if(!FATAL_CODES.includes(reason))
  blockers.push('unexpected_stop_reason_code');
 // A bookkeeping result is never permission to open, login, or deploy.
 return Object.freeze({
  ok:blockers.length===0,code:blockers.length?'post_window_closure_review_blocked':'bookkeeping_review_pass',
  blockers:Object.freeze([...new Set(blockers)]),
  realWindowOpened:false,cloudMutationPerformed:false,releaseReady:false,
  note:'Evidence-only local calculations; requires independent manual cloud verification.'
 });
}
module.exports={closedSnapshot,reconcileClosedWindow,countsAreValid,FATAL_CODES,SHA,CLOSED};
