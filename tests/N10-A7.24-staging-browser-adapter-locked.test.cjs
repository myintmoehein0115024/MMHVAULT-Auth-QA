'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const SOURCE=fs.readFileSync('integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs','utf8');
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co',UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const KEY='sb_publishable_synthetic_testing_key_1234567890';
const cfg={project:'ldivswlhtgmznzwhzsoi',base:BASE,endpoint:BASE+'/functions/v1/mmh-n10a6-username',origin:'https://myintmoehein0115024.github.io',publishableKey:KEY};
function load(enabled=false){
 const module={exports:{}},source=enabled?SOURCE.replace('const STAGING_ADAPTER_ENABLED=false','const STAGING_ADAPTER_ENABLED=true'):SOURCE;
 vm.runInNewContext(source,{module},{timeout:1500});
 return module.exports;
}
function fixture(opts={}){
 const calls=[],privateJwt='synthetic_access_token_never_log',privateRefresh='synthetic_refresh_token_never_log';
 let active=opts.active!==false;
 const auth={
  async getUser(){calls.push('getUser');return opts.userError?{error:{message:'offline'}}:{data:{user:active?{id:opts.remote||UID,email_confirmed_at:opts.unconfirmed?null:'2026-10-01T00:00:00Z',is_anonymous:false}:null}}},
  async getSession(){calls.push('getSession');return opts.sessionError?{error:{message:'offline'}}:{data:{session:active?{user:{id:opts.local||UID},access_token:privateJwt}:null}}},
  async signInWithPassword(input){calls.push('emailPassword');assert.equal(input.email,'example@example.invalid');return {data:{user:{id:UID}}}},
  async signOut(options){calls.push('signOutLocal');assert.equal(options.scope,'local');active=false;return opts.signoutError?{error:{message:'offline'}}:{error:null}},
  async setSession(pair){calls.push('setSession');assert.equal(pair.access_token,privateJwt);active=true;return {data:{user:{id:UID}}}}
 };
 const client={
  auth,
  from(name){
   assert.equal(name,'mmh_n10a6_auth_owner_probe');calls.push('fromOwner');
   return {select(column){
    assert.equal(column,'user_id');
    return {async limit(limit){
      assert.equal(limit,2);
      return opts.ownerError?{error:{message:'owner table unavailable'}}:{data:opts.rows||[{user_id:UID}]};
    }};
   }};
  }
 };
 const transport=async (url,options)=>{
  calls.push('request');assert.equal(url,cfg.endpoint);assert.equal(options.credentials,'omit');
  assert.equal(options.headers.apikey,KEY);
  const d=JSON.parse(options.body);
  if(d.action==='preflight')return {status:200,async json(){return {code:'preflight_ok',enabled:opts.disabled!==true,registration_enabled:false,scope:'isolated_staging_only'}}};
  if(d.action==='bind'){
   assert.equal(options.headers.Authorization,'Bearer '+privateJwt);
   return {status:opts.bindError?409:200,async json(){return {code:opts.bindError?'username_unavailable':'bind_success'}}};
  }
  return {status:opts.invalidGrant?200:200,async json(){return opts.invalidGrant?{code:'login_success'}:{code:'login_success',access_token:privateJwt,refresh_token:privateRefresh}}};
 };
 return {calls,client,transport,auth,privateJwt,privateRefresh,make:()=>load(true).makeStagingAdapter({cfg,client,transport})};
}
test('source is locked and has no global browser network, session storage, or prod IDs',()=>{
 assert.match(SOURCE,/const STAGING_ADAPTER_ENABLED=false/);
 for(const term of ['fetch(', 'localStorage','sessionStorage','vrypucmyrztxgiqhjspd','service_role','window.location'])
  assert.ok(!SOURCE.includes(term),term);
});
test('locked adapter returns before invoking any passed client or transport',()=>{
 const f=fixture();
 const x=load(false).makeStagingAdapter({cfg,client:f.client,transport:f.transport});
 assert.equal(x.enabled,false);assert.equal(x.code,'review_locked');assert.equal(f.calls.length,0);
});
test('reject production project, URL, origin, endpoint or untrusted API key',()=>{
 for(const changes of [{project:'production'},{base:'https://unknown.supabase.co'},{origin:'https://evil.example'},{endpoint:'https://other.invalid/username'},{publishableKey:'sb_secret_fake'}]){
  const f=fixture();
  const x=load(true).makeStagingAdapter({cfg:{...cfg,...changes},client:f.client,transport:f.transport});
  assert.equal(x.enabled,false);assert.equal(f.calls.length,0);
 }
});
test('unlocked mocked SDK adapter accepts genuine preflight structure',async()=>{
 const f=fixture();const a=f.make();assert.equal(a.enabled,true);
 const p=await a.preflight();
 assert.deepEqual(JSON.parse(JSON.stringify(p)),{status:200,code:'preflight_ok',enabled:true,registration_enabled:false,scope:'isolated_staging_only'});
 assert.deepEqual(f.calls,['request']);
});
test('preflight disabled cannot be promoted by adapter',async()=>{
 const f=fixture({disabled:true});const p=await f.make().preflight();assert.equal(p.enabled,false);
});
test('SDK getUser and getSession data envelopes are correctly unwrapped',async()=>{
 const f=fixture();const a=f.make();
 assert.equal((await a.getUser()).id,UID);
 assert.equal((await a.getSession()).user.id,UID);
});
test('getUser error and getSession error reject before owner operation',async()=>{
 for(const opt of [{userError:true},{sessionError:true}]){
  const f=fixture(opt),a=f.make();
  await assert.rejects(()=>opt.userError?a.getUser():a.getSession());
  assert.ok(!f.calls.includes('fromOwner'));
 }
});
test('owner probe queries exact table, selects own row via RLS',async()=>{
 const f=fixture();const rows=await f.make().ownerProbe();assert.equal(rows.length,1);assert.equal(rows[0].user_id,UID);
 assert.ok(f.calls.includes('fromOwner'));
});
test('failed owner query cannot be treated as empty successful owner rows',async()=>{
 const f=fixture({ownerError:true});await assert.rejects(()=>f.make().ownerProbe(),/owner_probe_unavailable/);
});
test('bind enforces remote UID equal local UID before sending request',async()=>{
 const f=fixture({local:OTHER});await assert.rejects(()=>f.make().bindUsername({username:'qa_alpha',password:'fake',captcha_token:'synthetic-token-long-enough'}),/identity_mismatch/);
 assert.ok(!f.calls.includes('request'));
});
test('bind rejects foreign owner row before sending request',async()=>{
 const f=fixture({rows:[{user_id:OTHER}]});await assert.rejects(()=>f.make().bindUsername({username:'qa_alpha',password:'fake',captcha_token:'synthetic-token-long-enough'}),/owner_probe_rejected/);
 assert.ok(!f.calls.includes('request'));
});
test('bind uses verified session bearer, server response does not leak credentials',async()=>{
 const f=fixture();const result=await f.make().bindUsername({username:'qa_alpha',password:'fictional-password',captcha_token:'synthetic-token-long-enough'});
 assert.equal(result.status,200);assert.equal(result.code,'bind_success');
 assert.ok(!JSON.stringify(result).includes('fictional-password'));
 assert.ok(!JSON.stringify(result).includes(f.privateJwt));
});
test('bind conflict returns HTTP 409 without leaking body',async()=>{
 const f=fixture({bindError:true});const r=await f.make().bindUsername({username:'qa_alpha',password:'fake',captcha_token:'synthetic-token-long-enough'});
 assert.equal(r.status,409);assert.equal(r.code,'username_unavailable');
});
test('username login passes only bearer pair of same-project endpoint',async()=>{
 const f=fixture();const r=await f.make().loginUsername({username:'qa_alpha',password:'fake',captcha_token:'synthetic-token-long-enough'});
 assert.equal(r.status,200);assert.equal(r.code,'login_success');assert.equal(r.access_token,f.privateJwt);
 assert.equal(r.refresh_token,f.privateRefresh);
});
test('malformed login grant never returns tokens',async()=>{
 const f=fixture({invalidGrant:true});await assert.rejects(()=>f.make().loginUsername({username:'qa_alpha',password:'fake',captcha_token:'synthetic-token-long-enough'}),/invalid_server_response/);
});
test('email sign-in uses exact sample email + supplied password; invalid input blocks SDK',async()=>{
 const f=fixture();const a=f.make();
 assert.equal((await a.signInWithPassword({email:'example@example.invalid',password:'fake'})).data.user.id,UID);
 const count=f.calls.length;
 const r=await a.signInWithPassword({password:'fake'});
 assert.ok(r.error);assert.equal(f.calls.length,count);
});
test('setSession and signOutLocal delegate only to current Staging client',async()=>{
 const f=fixture();const a=f.make();
 await a.setSession({access_token:f.privateJwt,refresh_token:f.privateRefresh});
 await a.signOutLocal();
 assert.ok(f.calls.includes('setSession'));assert.ok(f.calls.includes('signOutLocal'));
});
test('SDK signOut errors are not hidden',async()=>{
 const f=fixture({signoutError:true});await assert.rejects(()=>f.make().signOutLocal(),/local_signout_failed/);
});
