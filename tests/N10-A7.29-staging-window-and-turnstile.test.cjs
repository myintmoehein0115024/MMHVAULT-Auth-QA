'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const TURN=fs.readFileSync('integration/N10-A7.29-turnstile-actions-LOCKED.cjs','utf8');
const PLAN=fs.readFileSync('integration/N10-A7.29-window-approval-LOCKED.cjs','utf8');
const P='ldivswlhtgmznzwhzsoi',O='https://myintmoehein0115024.github.io',E='mmh-n10a6-username';
function load(source,unlock=false){
 if(unlock){const needle='const ALLOW_TURNSTILE_ACTIONS=false';assert.equal(source.split(needle).length,2);
  source=source.replace(needle,'const ALLOW_TURNSTILE_ACTIONS=true')}
 const mod={exports:{}};
 vm.runInNewContext(source,{module:mod,Promise,Date,Number,Object,setTimeout,clearTimeout}, {timeout:1800});
 return mod.exports;
}
function fake({mode='success',origin=O,sitekey='FAKE_PUBLIC_SITEKEY_QA_1234567890123456'}={}){
 const calls=[],delays=[];
 let count=0;
 const widget={
  render(container,options){calls.push({kind:'render',action:options.action,options});return ++count},
  execute(id){
   calls.push({kind:'execute',id});
   const o=calls.filter(x=>x.kind==='render').at(-1).options;
   const value='fake-token-'+o.action+'-01234567890123456789';
   if(mode==='success')Promise.resolve().then(()=>o.callback(value));
   if(mode==='sync')o.callback(value);
   if(mode==='fail')Promise.resolve().then(()=>o['error-callback']());
   if(mode==='expired')Promise.resolve().then(()=>o['expired-callback']());
   if(mode==='widget_timeout')Promise.resolve().then(()=>o['timeout-callback']());
   if(mode==='throw')throw Error('intentional_fake_failure');
  },
  remove(id){calls.push({kind:'remove',id})}
 };
 const provider=load(TURN,true).createActionProvider({
  origin,sitekey,turnstile:widget,
  makeContainer:action=>{calls.push({kind:'container',action});return {remove(){calls.push({kind:'container_removed',action})}}},
  timeoutMs:3000,setDelay:f=>{delays.push(f);return delays.length},clearDelay:()=>{}
 });
 return {provider,calls,delays};
}
const plan=(extra={})=>load(PLAN).makeApprovalPlan({
 project:P,origin:O,edge:E,
 startUTC:'2026-10-30T08:00:00.000Z',endUTC:'2026-10-30T08:15:00.000Z',
 nowUTC:'2026-10-29T08:00:00.000Z',...extra
});
test('all four runtime modules plus new Turnstile remain default-locked',()=>{
 for(const [p,needle] of [
  ['integration/N10-A7.23-real-username-acceptance-LOCKED.cjs','const ALLOW_REAL_OPERATIONS=false'],
  ['integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs','const STAGING_ADAPTER_ENABLED=false'],
  ['integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs','const STAGING_SDK_BOOTSTRAP_ENABLED=false'],
  ['integration/N10-A7.29-turnstile-actions-LOCKED.cjs','const ALLOW_TURNSTILE_ACTIONS=false'],
  ['integration/N10-A7.29-window-approval-LOCKED.cjs','const ALLOW_CLOUD_WINDOW_MUTATION=false']
 ]){
  assert.ok(fs.readFileSync(p,'utf8').includes(needle),p);
 }
});
test('review Turnstile lock means zero widget calls and zero token requests',()=>{
 let calls=0;
 const r=load(TURN).createActionProvider({origin:O,
  turnstile:{render(){calls++},execute(){calls++}},makeContainer(){calls++}});
 assert.equal(r.enabled,false);assert.equal(r.code,'turnstile_review_locked');assert.equal(calls,0);
});
test('only exact independent Staging GitHub origin may configure Turnstile',()=>{
 for(const x of ['https://mmhvault.com','https://www.mmhvault.com','https://evil.example']){
  const f=fake({origin:x});assert.equal(f.provider.enabled,false);assert.deepEqual(f.calls,[]);
 }
});
test('no invalid key or missing widget dependencies may initialize',()=>{
 assert.equal(fake({sitekey:'sb_secret_not_a_site_key'}).provider.enabled,false);
 assert.equal(load(TURN,true).createActionProvider({origin:O,sitekey:'PUBLIC_TEST_KEY_12345678912345',
  turnstile:{render(){}},makeContainer:()=>({})}).enabled,false);
});
test('G11 binding and G10 login render separate widgets and correct action',async()=>{
 const f=fake();const bind=await f.provider.take('mmh_n10a6_bind');
 const login=await f.provider.take('mmh_n10a6_login');
 assert.notEqual(bind,login);assert.ok(bind.startsWith('fake-token-'));
 const render=f.calls.filter(x=>x.kind==='render');
 assert.equal(render.length,2);assert.deepEqual(render.map(x=>x.action),['mmh_n10a6_bind','mmh_n10a6_login']);
 assert.ok(render.every(x=>x.options.execution==='execute'&&x.options.theme==='dark'));
 assert.equal(f.calls.filter(x=>x.kind==='remove').length,2);
 assert.equal(f.provider.close().ok,true);
});
test('registration or unrelated CAPTCHA actions are blocked',async()=>{
 const f=fake();await assert.rejects(()=>f.provider.take('signup'),/turnstile_action_not_allowed/);
 assert.equal(f.calls.filter(x=>x.kind==='render').length,0);
});
test('pending challenge prevents duplicate concurrent issuance and closes cleanly',async()=>{
 const f=fake({mode:'pending'}),first=f.provider.take('mmh_n10a6_login');
 await assert.rejects(()=>f.provider.take('mmh_n10a6_bind'),/turnstile_busy/);
 f.provider.close();await assert.rejects(first,/turnstile_closed/);
 assert.equal(f.calls.filter(x=>x.kind==='remove').length,1);
 await assert.rejects(()=>f.provider.take('mmh_n10a6_login'),/turnstile_closed/);
});
for(const [mode,error] of [
 ['fail','turnstile_failed'],['expired','turnstile_expired'],
 ['widget_timeout','turnstile_timeout'],['throw','turnstile_widget_unavailable']
]){
 test('widget '+mode+' fails closed and gets removed',async()=>{
  const f=fake({mode});await assert.rejects(()=>f.provider.take('mmh_n10a6_login'),new RegExp(error));
  assert.equal(f.calls.filter(x=>x.kind==='remove').length,1);
 });
}
test('the timeout deadline stops a stalled browser challenge',async()=>{
 const f=fake({mode:'pending'}),promise=f.provider.take('mmh_n10a6_login');
 f.delays[0]();await assert.rejects(promise,/turnstile_timeout/);
 assert.equal(f.calls.filter(x=>x.kind==='remove').length,1);
});
test('even a synchronous widget callback cleans up after a valid token',async()=>{
 const f=fake({mode:'sync'}),t=await f.provider.take('mmh_n10a6_bind');
 assert.ok(t.length>=20);assert.equal(f.calls.filter(x=>x.kind==='remove').length,1);
});
test('review-only 15-minute UTC window is a plan, never an executable release',()=>{
 const p=plan();assert.equal(p.ok,true);assert.equal(p.status,'PENDING_EXPLICIT_USER_APPROVAL');
 assert.equal(p.realOperationsEnabled,false);assert.equal(p.cloudMutationPerformed,false);
 assert.equal(p.registrationEnabled,false);assert.equal(p.expectedBeforeAndAfter.codeGateOpen,false);
 assert.equal(p.expectedBeforeAndAfter.secretEnabled,false);
 assert.equal(p.expectedBeforeAndAfter.windowEndUTC,'1970-01-01T00:00:00.000Z');
 assert.equal(p.actions.length,2);assert.equal(Object.isFrozen(p),true);
});
for(const [label,over] of [
 ['longer-than-15',{endUTC:'2026-10-30T08:15:00.001Z'}],
 ['zero',{endUTC:'2026-10-30T08:00:00.000Z'}],
 ['reversed',{startUTC:'2026-10-30T08:20:00.000Z'}],
 ['past',{nowUTC:'2026-10-30T09:00:00.000Z'}],
 ['bad-format',{startUTC:'2026-10-30T08:00:00Z'}],
 ['invalid-calendar-day',{startUTC:'2026-10-32T08:00:00.000Z'}],
 ['production-project',{project:'vrypucmyrztxgiqhjspd'}],
 ['new-production-domain',{origin:'https://mmhvault.com'}],
 ['wrong-edge',{edge:'different-function'}],
 ['registration-open',{registrationEnabled:true}]
]){
 test('approval rejects '+label,()=>assert.equal(plan(over).ok,false));
}
test('plan contains no secret/JWT/user identifiers and no mutation hooks',()=>{
 const p=plan();assert.equal(p.ok,true);assert.ok(!JSON.stringify(p).includes('JWT'));
 assert.ok(!JSON.stringify(p).includes('password'));
 assert.equal(Object.isFrozen(p.expectedBeforeAndAfter),true);
 assert.ok(p.restrictions.includes('no_production_changes'));
});
test('historical deployed Staging Edge review source remains closed',()=>{
 const src=fs.readFileSync('edge/N10-A7.17-closed-main-captcha-replay-v11.js','utf8');
 assert.match(src,/const CODE_GATE_OPEN = false/);
 assert.match(src,/const WINDOW_START_UTC = '1970-01-01T00:00:00.000Z'/);
 assert.match(src,/const WINDOW_END_UTC = '1970-01-01T00:00:00.000Z'/);
});
