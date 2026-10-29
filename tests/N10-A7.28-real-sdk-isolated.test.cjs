'use strict';
/**
 * N10-A7.28: REAL @supabase/supabase-js (pinned) behind the actual committed
 * default-locked N10-A7.27 bridge, in Node VM unlocked ONLY for synthetic tests.
 * No live network, no real Auth users, no real JWT/Cloudflare tokens.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const pkgRequire=createRequire(path.resolve('qa/n10-a728-real-sdk/package.json'));
const {createClient}=pkgRequire('@supabase/supabase-js');
const pkg=pkgRequire('@supabase/supabase-js/package.json');
const SRC=fs.readFileSync('integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs','utf8');
const CTRL=fs.readFileSync('integration/N10-A7.23-real-username-acceptance-LOCKED.cjs','utf8');
const ADAPT=fs.readFileSync('integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs','utf8');
const ID='ldivswlhtgmznzwhzsoi',BASE='https://'+ID+'.supabase.co';
const EDGE=BASE+'/functions/v1/mmh-n10a6-username';
const HOST='https://myintmoehein0115024.github.io';
const UID='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const identity={username:'qa_alpha',email:'synthetic.728@example.invalid',password:'synthetic-only-do-not-use'};
const cfg={project:ID,base:BASE,endpoint:EDGE,origin:HOST,publishableKey:'sb_publishable_FAKE_FOR_TESTS_0123456789'};
const nonce='a1234567-1234-4567-8123-123456789012';
const body64=(value)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const fakeAccess=(uid=UID)=>[body64({alg:'HS256',typ:'JWT'}),body64({
 sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,
 iat:Math.floor(Date.now()/1000)-30,email:identity.email,iss:BASE+'/auth/v1'
}),Buffer.from('synthetic-signature').toString('base64url')].join('.');
const access=fakeAccess();
const refresh='synthetic-qa-refresh-0123456789012345';
function load(source,marker,unlocked=false) {
 if(unlocked){assert.equal(source.split(marker).length,2);
  source=source.replace(marker,marker.replace('false','true'))}
 const mod={exports:{}};
 vm.runInNewContext(source,{module:mod,Map,URL,console}, {filename:'n10-a728-isolated-review-vm.cjs',timeout:1500});
 return mod.exports;
}
function makeFakeUser(uid=UID){
 return {id:uid,email:identity.email,email_confirmed_at:'2026-10-29T00:00:00.000Z',
    is_anonymous:false,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},
    created_at:'2026-10-29T00:00:00.000Z'};
}
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{
 'Content-Type':'application/json','Cache-Control':'no-store'}});
function fixture(opts={}){
 const traces=[],state={signedIn:false,owner:UID,rate:0,bindings:0};
 const badNetwork=()=>{throw Error('unmocked_live_network_forbidden')};
 async function fetcher(input,request={}){
  const url=String(typeof input==='string'?input:input.url),u=new URL(url),action=request.method||input.method||'GET';
  assert.equal(u.origin,BASE,'must not access production or another host');
  traces.push({path:u.pathname,search:u.search,action,mode:request.mode||null,
   credentials:request.credentials||null,redirect:request.redirect||null,
   hasPayload:!!request.body});
  if(u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password'){
   if(opts.badPassword)return json({code:'invalid_grant',msg:'Invalid login credentials'},400);
   state.signedIn=true;state.owner=UID;
   return json({access_token:access,refresh_token:refresh,token_type:'bearer',
    expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:makeFakeUser()});
  }
  if(u.pathname==='/auth/v1/user'&&action==='GET'){
   if(!state.signedIn)return json({msg:'User not found'},401);
   return json({user:makeFakeUser(opts.remoteMismatch?OTHER:state.owner)});
  }
  if(u.pathname==='/auth/v1/logout'&&action==='POST'){
   if(opts.logoutReject)return json({msg:'Logout rejected',code:'unexpected_failure'},503);
   state.signedIn=false;
   return json({});
  }
  if(u.pathname==='/rest/v1/mmh_n10a6_auth_owner_probe'){
   if(opts.rlsDenied)return json({message:'RLS denied',code:'42501'},403);
   return json([{user_id:opts.ownerMismatch?OTHER:state.owner}]);
  }
  if(u.pathname==='/functions/v1/mmh-n10a6-username'){
   const payload=JSON.parse(request.body||'{}');
   if(payload.action==='preflight')return json({code:'preflight_ok',
    scope:'isolated_staging_only',registration_enabled:false,enabled:opts.windowClosed!==true});
   if(payload.action==='bind'){
    state.bindings++;
    return json({code:opts.bindConflict?'username_unavailable':'bind_success'},opts.bindConflict?409:200);
   }
   if(payload.action==='login')return json({code:'login_success',access_token:access,refresh_token:refresh});
  }
  return badNetwork();
 }
 function bootstrap({unlocked=true,cfgOverride=null,origin=HOST}={}){
  const a=load(SRC,'const STAGING_SDK_BOOTSTRAP_ENABLED=false',unlocked);
  return a.createIsolatedStagingSdk({cfg:cfgOverride||cfg,origin,createClient,fetcher,randomUUID:()=>nonce});
 }
 function syntheticController(bridge){
  const a=load(ADAPT,'const STAGING_ADAPTER_ENABLED=false',true);
  const c=load(CTRL,'const ALLOW_REAL_OPERATIONS=false',true);
  const api=a.makeStagingAdapter({cfg,client:bridge.client,transport:bridge.transport});
  assert.equal(api.enabled,true);
  const taken=[];
  const captcha={async take(action){
   taken.push(action);
   if(action==='mmh_n10a6_bind')return 'fake-bind-token-for-qa-only-0123456789';
   if(action==='mmh_n10a6_login')return 'fake-login-token-for-qa-only-0123456789';
   throw Error('unexpected_captcha_action');
  }};
  return {api,captcha,taken,run:options=>c.runControlledAcceptance({cfg,api,captcha,credentials:identity,options})};
 }
 return {bootstrap,syntheticController,traces,state};
}
test('pinned actual npm SDK and committed default-lock code gates',()=>{
 assert.equal(pkg.version,'2.118.0');
 assert.match(SRC,/const STAGING_SDK_BOOTSTRAP_ENABLED=false/);
 assert.match(CTRL,/const ALLOW_REAL_OPERATIONS=false/);
 assert.match(ADAPT,/const STAGING_ADAPTER_ENABLED=false/);
 assert.ok(!SRC.includes('mmhvault.com'));
});
test('locked bridge never initializes actual SDK nor makes a network call',()=>{
 const f=fixture(),res=f.bootstrap({unlocked:false});
 assert.equal(res.enabled,false);assert.equal(res.code,'staging_sdk_bootstrap_locked');
 assert.equal(f.traces.length,0);
});
test('actual SDK initializes with ephemeral storage but no session or network on creation',async()=>{
 const f=fixture(),b=f.bootstrap();
 assert.equal(b.enabled,true);
 const s=await b.client.auth.getSession();
 assert.equal(s.error,null);assert.equal(s.data.session,null);
 assert.equal(f.traces.length,0);
 const end=await b.close();assert.equal(end.ok,true);
});
test('real SDK authenticates synthetic email with no actual server and verifies remote UID / RLS',async()=>{
 const f=fixture(),b=f.bootstrap();
 const sign=await b.client.auth.signInWithPassword({email:identity.email,password:identity.password});
 assert.equal(sign.error,null,sign.error?.message);
 assert.equal(sign.data.user.id,UID);
 const remote=await b.client.auth.getUser();
 assert.equal(remote.error,null,remote.error?.message);
 assert.equal(remote.data.user.id,UID);
 const session=await b.client.auth.getSession();
 assert.equal(session.error,null);
 assert.equal(session.data.session.user.id,UID);
 const r=await b.client.from('mmh_n10a6_auth_owner_probe').select('user_id').limit(2);
 assert.equal(r.error,null,r.error?.message);
 assert.deepEqual(r.data,[{user_id:UID}]);
 const close=await b.close();assert.equal(close.ok,true);
 assert.equal((await f.traces.filter(x=>x.path==='/auth/v1/logout').length),1);
 for(const x of f.traces){
  assert.equal(x.credentials,'omit');
  assert.equal(x.redirect,'error');
 }
});
test('real SDK setSession reinstalls synthetic token, validates remote getUser, and clears on close',async()=>{
 const f=fixture(),b=f.bootstrap();
 // Install a synthetic-only token; no access to real network is possible.
 f.state.signedIn=true;
 const signed=await b.client.auth.setSession({access_token:access,refresh_token:refresh});
 assert.equal(signed.error,null,signed.error?.message);
 assert.equal(signed.data.user.id,UID);
 const remote=await b.client.auth.getUser();
 assert.equal(remote.error,null);
 assert.equal(remote.data.user.id,UID);
 const closed=await b.close();
 assert.equal(closed.ok,true);
});
test('real SDK local logout clears session, prevents any further account operations',async()=>{
 const f=fixture(),b=f.bootstrap();
 const s=await b.client.auth.signInWithPassword({email:identity.email,password:identity.password});
 assert.equal(s.error,null);
 const l=await b.client.auth.signOut({scope:'local'});
 assert.equal(l.error,null,l.error?.message);
 assert.equal((await b.client.auth.getSession()).data.session,null);
 assert.equal((await b.close()).ok,true);
 assert.throws(()=>b.client.auth.getUser(),/qa_session_closed/);
});
test('real SDK rejects global logout and forbidden financial tables',async()=>{
 const f=fixture(),b=f.bootstrap();
 assert.throws(()=>b.client.auth.signOut({scope:'global'}),/global_signout_forbidden/);
 assert.throws(()=>b.client.from('transactions'),/non_owner_table_forbidden/);
 assert.throws(()=>b.client.from('accounts'),/non_owner_table_forbidden/);
 assert.throws(()=>b.client.from('mmh_n10a6_username_links'),/non_owner_table_forbidden/);
 assert.equal((await b.close()).ok,true);
});
test('new domain cannot silently become an authorized origin',()=>{
 const f=fixture();
 for(const origin of ['https://mmhvault.com','https://www.mmhvault.com']){
  const b=f.bootstrap({origin});assert.equal(b.enabled,false);
 }
 assert.equal(f.traces.length,0);
});
test('real SDK refuses incorrect password and clears any test session',async()=>{
 const f=fixture({badPassword:true}),b=f.bootstrap();
 const result=await b.client.auth.signInWithPassword({email:identity.email,password:identity.password});
 assert.ok(result.error);
 const s=await b.client.auth.getSession();
 assert.equal(s.data.session,null);
 const c=await b.close();assert.equal(c.ok,true);
});
test('real SDK and 3 reviewed modules bind → login: same UID/RLS and verified final logout',async()=>{
 const f=fixture(),b=f.bootstrap(),c=f.syntheticController(b);
 const out=await c.run({mode:'bind_then_login'});
 assert.equal(out.ok,true,'failure code: '+out.code);
 assert.equal(out.code,'staging_username_acceptance_pass');
 assert.equal(f.state.bindings,1);
 assert.deepEqual(c.taken,['mmh_n10a6_bind','mmh_n10a6_login']);
 const s=await b.client.auth.getSession();
 assert.equal(s.data.session,null);
 assert.equal((await b.close()).ok,true);
 assert.ok(!JSON.stringify(out).includes(identity.email));
 assert.ok(!JSON.stringify(out).includes(identity.password));
 assert.ok(!JSON.stringify(out).includes(access));
});
test('real SDK flow blocks RLS mismatch and never binds',async()=>{
 const f=fixture({ownerMismatch:true}),b=f.bootstrap(),c=f.syntheticController(b);
 const out=await c.run({mode:'bind_then_login'});
 assert.equal(out.ok,false);assert.equal(out.code,'rls_owner_mismatch');
 assert.equal(f.state.bindings,0);
 assert.equal((await b.close()).ok,true);
});
test('real SDK flow blocks different remote UID and never binds',async()=>{
 const f=fixture({remoteMismatch:true}),b=f.bootstrap(),c=f.syntheticController(b);
 const out=await c.run({mode:'bind_then_login'});
 assert.equal(out.ok,false);assert.equal(out.code,'uid_mismatch');
 assert.equal(f.state.bindings,0);
 assert.equal((await b.close()).ok,true);
});
test('real SDK flow blocks closed server before email authentication',async()=>{
 const f=fixture({windowClosed:true}),b=f.bootstrap(),c=f.syntheticController(b);
 const out=await c.run({mode:'bind_then_login'});
 assert.equal(out.code,'server_window_closed');
 assert.equal(f.traces.filter(x=>x.path==='/auth/v1/token').length,0);
 assert.equal((await b.close()).ok,true);
});
