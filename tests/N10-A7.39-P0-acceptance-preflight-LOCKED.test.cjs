'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const v=require('../integration/N10-A7.39-P0-acceptance-preflight-LOCKED.cjs');
const plan=JSON.parse(fs.readFileSync('review/N10-A7.39-REAL-ACCEPTANCE-PREFLIGHT-LOCKED.json','utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
function closedEvidence(){
 return {project:'ldivswlhtgmznzwhzsoi',
  edgeSha:'0352514a17a62da58fbebea97ac0c570d6cf4bfcc50dc78bb7bdedc3774479e7',
  codeGateOpen:false,windowStartUTC:'1970-01-01T00:00:00.000Z',
  windowEndUTC:'1970-01-01T00:00:00.000Z',
  secretDisabledVerified:true,registrationEnabled:false,
  counts:{authUsers:2,aliases:1,ownerProbe:2,throttle:3}};
}
test('P0 contract reflects observed live cloud config and denies actual operations',()=>{
 const r=v.evaluate(plan);
 assert.equal(r.contractConsistent,true,JSON.stringify(r.auditBlockers));
 assert.equal(r.readOnly,true);assert.equal(r.realLoginPermitted,false);
 assert.equal(r.productionReady,false);assert.equal(r.noRealOperations,true);
 assert.deepEqual(r.auditBlockers,[]);
 assert.ok(r.pending.includes('turnstile_qa_hostname_missing'));
 assert.ok(r.pending.includes('staging_edge_host_and_cors_not_migrated'));
 assert.ok(r.pending.includes('credential_enabled_access_restricted_qa_host_missing'));
 assert.ok(r.pending.includes('staging_secret_value_unverified'));
});
test('all live cloud and auth modification gates are hardcoded false',()=>{
 const src=fs.readFileSync('integration/N10-A7.39-P0-acceptance-preflight-LOCKED.cjs','utf8');
 for(const name of ['REAL_AUTH_EXECUTION_ALLOWED','CLOUD_MUTATIONS_ALLOWED','PRODUCTION_MUTATIONS_ALLOWED'])
  assert.ok(src.includes('const '+name+'=false'));
 for(const name of ['staging_change_allowed','turnstile_change_allowed','cloudflare_pages_deploy_allowed',
 'staging_secret_change_allowed','real_password_request_allowed','real_g10_g11_allowed',
 'production_release_allowed','release_ready'])assert.equal(plan[name],false);
});
test('UTC exact parser enforces strict canonical date and milliseconds',()=>{
 assert.equal(v.exactUTC('2026-10-29T09:00:00.000Z'),1793264400000);
 for(const x of [null,'','2026-10-29T09:00:00Z','2026-10-29T09:00:00.000+00:00',
 '2026-10-29 09:00:00','2026-02-31T09:00:00.000Z','2026-10-29T09:60:00.000Z',
 '2026-10-29T09:00:00.000+07:00','2026-10-29T09:00:00.000Zgarbage']){
  assert.equal(v.exactUTC(x),null,String(x));
 }
});
test('window is NOT scheduled and cannot auto-open on any commit',()=>{
 const w=v.reviewWindow(plan.future_test_window);
 assert.equal(w.valid,false);assert.deepEqual(w.blockers,['window_unscheduled']);
 assert.equal(w.durationSeconds,null);
});
test('hypothetical exact 15-minute window is a calculation, NOT an authorization',()=>{
 const p=clone(plan);
 p.future_test_window.start_utc='2026-10-29T10:00:00.000Z';
 p.future_test_window.end_utc='2026-10-29T10:15:00.000Z';
 p.future_test_window.exact_utc_calendar_date='2026-10-29';
 const w=v.reviewWindow(p.future_test_window);
 assert.equal(w.valid,true);assert.equal(w.durationSeconds,900);
 const gate=v.evaluate(p);
 assert.equal(gate.realLoginPermitted,false);assert.equal(gate.productionReady,false);
 assert.equal(gate.readOnly,true);
});
for(const [label,change,reason] of [
 ['more than 15 minutes',x=>x.end_utc='2026-10-29T10:15:00.001Z','window_over_15_minutes'],
 ['start after end',x=>x.end_utc='2026-10-29T09:59:59.000Z','invalid_utc_order'],
 ['date mismatch',x=>x.exact_utc_calendar_date='2026-10-30','window_date_mismatch'],
 ['different calendar day',x=>{x.start_utc='2026-10-29T23:55:00.000Z';x.end_utc='2026-10-30T00:05:00.000Z'},'cross_day_requires_new_approval'],
 ['nonUTC offset',x=>x.start_utc='2026-10-29T10:00:00.000+07:00','window_unscheduled'],
 ['disable fail fast',x=>x.stop_on_first_uid_or_rls_mismatch=false,'missing_uid_rls_fail_fast'],
 ['disable counter protection',x=>x.stop_on_any_unexpected_user_or_alias_delta=false,'missing_counter_fail_fast'],
 ['disable sign-out',x=>x.require_local_signout=false,'missing_local_signout'],
 ['disable abort',x=>x.abort_if_not_ready=false,'missing_abort'],
 ['extend configured maximum',x=>x.max_duration_seconds=1800,'max_duration_not_900']
]){
 test('window planning rejects '+label,()=>{
  const p=clone(plan.future_test_window);
  p.start_utc='2026-10-29T10:00:00.000Z';
  p.end_utc='2026-10-29T10:15:00.000Z';
  p.exact_utc_calendar_date='2026-10-29';change(p);
  const r=v.reviewWindow(p);
  assert.equal(r.valid,false);assert.ok(r.blockers.includes(reason),JSON.stringify(r));
 });
}
for(const [label,change,reason] of [
 ['switch to production Supabase',x=>x.references.staging_project_id='vrypucmyrztxgiqhjspd','unapproved_staging_project_or_sha'],
 ['switch to formal GitHub repo',x=>x.references.github_repo='myintmoehein0115024/MMHVAULT','unapproved_github_source'],
 ['changed Edge sha',x=>x.references.current_edge_sha256='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','unapproved_staging_project_or_sha'],
 ['QA origin becomes production',x=>x.references.qa_locked_origin='https://mmhvault.com','unapproved_origin'],
 ['modified credential host',x=>x.references.main_credential_input_not_deployed=false,'locked_host_baseline_changed'],
 ['Open staging code gate',x=>x.observed.staging_edge_code_gate_open=true,'staging_code_and_time_gate_mismatch'],
 ['Origin includes production',x=>x.observed.prod_hostname_in_staging_config=true,'production_origin_added_to_staging'],
 ['Secret guessed false',x=>x.observed.staging_secret_enabled_value=false,'secret_not_observed_as_unknown'],
 ['Turnstile host already changed',x=>x.observed.turnstile_new_qa_host_allowed=true,'turnstile_configuration_changed'],
 ['Cloudflare auto deploy opens',x=>x.observed.cloudflare_qa_auto_deploy_legacy=true,'cloudflare_auto_deploy_changed'],
 ['UID change',x=>x.references.baseline_auth_user_count=3,'unapproved_baseline_data_change'],
 ['Real account approval forged',x=>x.preparatory_evidence.allow_real_test_account=true,'real_test_scope_not_yet_approved'],
 ['Real user alias action',x=>x.preparatory_evidence.expected_alias_change_count=1,'unexpected_account_or_alias_write'],
 ['Real prerequisites asserted',x=>x.preparatory_evidence.credential_host_sdk_code_reviewed=true,'real_prerequisites_claimed_complete_without_review'],
 ['Staging change permission forged',x=>x.staging_change_allowed=true,'staging_change_allowed_must_remain_false'],
 ['Real auth permission forged',x=>x.real_g10_g11_allowed=true,'real_g10_g11_allowed_must_remain_false'],
 ['Production release permission forged',x=>x.production_release_allowed=true,'production_release_allowed_must_remain_false']
]){
 test('preflight fails closed if '+label,()=>{
  const p=clone(plan);change(p);
  const r=v.evaluate(p);
  assert.equal(r.contractConsistent,false);
  assert.ok(r.auditBlockers.includes(reason),JSON.stringify(r.auditBlockers));
  assert.equal(r.realLoginPermitted,false);
 });
}
test('hypothetical closed before/after evidence can be reconciled but never authorizes production',()=>{
 const before=closedEvidence(),after=closedEvidence();
 const r=v.validateCloseEvidence({before,after});
 assert.equal(r.closedReviewPass,true);
 assert.equal(r.realCleanupPerformed,false);
 assert.equal(r.manualSecretVerificationRequired,true);
 assert.equal(r.mayAuthorizeProduction,false);
});
for(const [label,change,reason] of [
 ['account user increment',x=>x.counts.authUsers++,'auth_users_changed'],
 ['alias unexpectedly bound',x=>x.counts.aliases++,'unapproved_alias_delta'],
 ['owner probe changed',x=>x.counts.ownerProbe++,'owner_probe_changed'],
 ['throttle table shrunk',x=>x.counts.throttle--,'throttle_rows_reduced_requires_review'],
 ['secret not independently checked',x=>x.secretDisabledVerified=false,'secret_false_not_independently_verified'],
 ['origin Edge hash not restored',x=>x.edgeSha='invalid','staging_not_closed'],
 ['1970 window not restored',x=>x.windowEndUTC='2026-10-29T11:00:00.000Z','staging_not_closed'],
 ['registration unexpectedly enabled',x=>x.registrationEnabled=true,'registration_not_closed'],
 ['negative count',x=>x.counts.authUsers=-1,'missing_counters']
]){
 test('closure check refuses '+label,()=>{
  const before=closedEvidence(),after=closedEvidence();change(after);
  const r=v.validateCloseEvidence({before,after});
  assert.equal(r.closedReviewPass,false);assert.ok(r.blockers.includes(reason),JSON.stringify(r));
  assert.equal(r.realCleanupPerformed,false);
 });
}
test('preflight tool and plan contain zero credential material and do not touch the live Pages build',()=>{
 const src=fs.readFileSync('integration/N10-A7.39-P0-acceptance-preflight-LOCKED.cjs','utf8');
 const planRaw=fs.readFileSync('review/N10-A7.39-REAL-ACCEPTANCE-PREFLIGHT-LOCKED.json','utf8');
 const build=fs.readFileSync('hosting/N10-A7.32-build-quarantined-preview.cjs','utf8');
 assert.doesNotMatch(src,/\bfetch\s*\(|\bWebSocket\s*\(|\brequire\s*\(\s*['"](?:https|axios|@supabase)/);
 assert.doesNotMatch(planRaw,/sb_secret_|Bearer\s+[^\s]+|access_token"\s*:/);
 assert.doesNotMatch(build,/N10-A7\.39/);
 assert.match(fs.readFileSync('hosting/n10a732-preview/_headers','utf8'),/connect-src 'none'/);
});
