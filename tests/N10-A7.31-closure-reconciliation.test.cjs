'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const plan=require('../integration/N10-A7.31-closure-reconciliation-LOCKED.cjs');
const SRC=fs.readFileSync('integration/N10-A7.31-closure-reconciliation-LOCKED.cjs','utf8');
const core={
 project:'ldivswlhtgmznzwhzsoi',
 edgeSha:plan.SHA,codeGateOpen:false,
 windowStartUTC:plan.CLOSED,windowEndUTC:plan.CLOSED,
 secretDisabledVerified:true,registrationEnabled:false,
 counts:{authUsers:2,aliases:1,ownerProbe:2,throttle:3}
};
const clone=x=>JSON.parse(JSON.stringify(x));
const sample=()=>({before:clone(core),after:clone(core)});
test('committed rollback-execution hard-lock remains false and no cloud write interface exported',()=>{
 assert.match(SRC,/const ALLOW_ROLLBACK_EXECUTION=false/);
 assert.ok(!SRC.includes('vrypucmyrztxgiqhjspd'));
 assert.ok(!SRC.includes('sb_secret_'));
 for(const action of ['updateEdgeFunction','setSecret','deploy','openWindow','bindUsername','approve'])
  assert.equal(Object.hasOwn(plan,action),false);
});
test('closed sample snapshot is a bookkeeping check, not signed cloud evidence',()=>{
 const s=plan.closedSnapshot(core);
 assert.equal(s.closed,true);assert.equal(s.code,'closed_snapshot_pass');
 assert.equal(plan.reconcileClosedWindow(sample()).ok,true);
 const rec=plan.reconcileClosedWindow(sample());
 assert.equal(rec.cloudMutationPerformed,false);assert.equal(rec.releaseReady,false);
 assert.equal(rec.realWindowOpened,false);
});
for(const [name,change,error] of [
 ['unknown Secret',x=>delete x.secretDisabledVerified,'secret_not_manually_verified_disabled'],
 ['Secret true',x=>x.secretDisabledVerified=false,'secret_not_manually_verified_disabled'],
 ['gate true',x=>x.codeGateOpen=true,'code_gate_not_closed'],
 ['open window',x=>x.windowEndUTC='2026-10-30T08:15:00.000Z','expired_window_not_restored'],
 ['start window changed',x=>x.windowStartUTC='2026-10-30T08:00:00.000Z','expired_window_not_restored'],
 ['changed Edge SHA',x=>x.edgeSha='wrong','edge_version_not_restored'],
 ['prod project',x=>x.project='vrypucmyrztxgiqhjspd','wrong_project'],
 ['registration enabled',x=>x.registrationEnabled=true,'registration_not_closed'],
 ['missing table count',x=>delete x.counts.ownerProbe,'missing_data_counts']
]){
 test(name+' blocks post-window closure',()=>{
  const x=sample();change(x.after);
  const result=plan.reconcileClosedWindow(x);
  assert.equal(result.ok,false);
  assert.ok(result.blockers.includes('after_'+error),JSON.stringify(result));
 });
}
test('no new Auth users permitted',()=>{
 const x=sample();x.after.counts.authUsers=3;
 assert.ok(plan.reconcileClosedWindow(x).blockers.includes('new_auth_user'));
});
test('Owner Probe count changed unexpectedly',()=>{
 const x=sample();x.after.counts.ownerProbe=3;
 assert.ok(plan.reconcileClosedWindow(x).blockers.includes('owner_probe_changed'));
});
test('one approved alias bind can be accounted for without creating Auth users',()=>{
 const x=sample();x.after.counts.aliases=2;x.after.counts.throttle=5;
 const r=plan.reconcileClosedWindow({...x,allowedAliasDelta:1});
 assert.equal(r.ok,true);assert.equal(r.releaseReady,false);
});
test('missing expected alias is not a passed G11 test',()=>{
 const x=sample();
 const r=plan.reconcileClosedWindow({...x,allowedAliasDelta:1});
 assert.equal(r.ok,false);assert.ok(r.blockers.includes('unexpected_username_bind'));
});
test('surprise alias write blocks a zero-write plan',()=>{
 const x=sample();x.after.counts.aliases=2;
 const r=plan.reconcileClosedWindow(x);
 assert.ok(r.blockers.includes('unexpected_username_bind'));
});
test('multiple username writes are not approved by one test',()=>{
 const x=sample();x.after.counts.aliases=3;
 const r=plan.reconcileClosedWindow({...x,allowedAliasDelta:2});
 assert.equal(r.ok,false);assert.ok(r.blockers.includes('invalid_username_write_allowance'));
});
test('unexpected decreasing throttle count triggers review',()=>{
 const x=sample();x.after.counts.throttle=2;
 const r=plan.reconcileClosedWindow(x);
 assert.ok(r.blockers.includes('throttle_counter_rolled_back_or_missing'));
});
test('fatal stop code is recorded, not silently claimed PASS',()=>{
 const x=sample();const r=plan.reconcileClosedWindow({...x,stopReasons:['uid_mismatch']});
 assert.equal(r.ok,true);assert.equal(r.releaseReady,false);
});
test('unrecognized or ill-typed stop reasons are disallowed',()=>{
 const x=sample();const a=plan.reconcileClosedWindow({...x,stopReasons:['fake_success']});
 assert.equal(a.ok,false);assert.ok(a.blockers.includes('unexpected_stop_reason_code'));
 const b=plan.reconcileClosedWindow({...x,stopReasons:[{a:1}]});
 assert.equal(b.ok,false);assert.ok(b.blockers.includes('stop_reason_log_invalid'));
});
test('snapshot secret verification must also exist BEFORE the approval window',()=>{
 const x=sample();delete x.before.secretDisabledVerified;
 const r=plan.reconcileClosedWindow(x);
 assert.equal(r.ok,false);assert.ok(r.blockers.includes('before_secret_not_manually_verified_disabled'));
});
test('missing snapshots fail closed without throwing',()=>{
 for(const x of [{}, {before:core}, {after:core}, null]){
  const r=plan.reconcileClosedWindow(x||{});
  assert.equal(r.ok,false);assert.equal(r.releaseReady,false);
 }
});
