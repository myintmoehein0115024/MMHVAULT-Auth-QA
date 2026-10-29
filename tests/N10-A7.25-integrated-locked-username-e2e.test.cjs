'use strict';
// N10-A7.25: actual N10-A7.23 controller + N10-A7.24 adapter in one hermetic VM,
// with fake Supabase SDK/HTTP/Cloudflare. NEVER use real credentials or a network.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const CTRL=fs.readFileSync('integration/N10-A7.23-real-username-acceptance-LOCKED.cjs','utf8');
const ADAPT=fs.readFileSync('integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs','utf8');
const PROJECT='ldivswlhtgmznzwhzsoi',BASE='https://'+PROJECT+'.supabase.co';
const ENDPOINT=BASE+'/functions/v1/mmh-n10a6-username';
const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const JWT='synthetic-only-access-token-01234567890',REFRESH='synthetic-only-refresh-token-123456789';
const USER={username:'qa_alpha',email:'sample@example.invalid',password:'fictional-no-real-user-credential'};
const cfg={project:PROJECT,base:BASE,endpoint:ENDPOINT,origin:'https://myintmoehein0115024.github.io',publishableKey:'sb_publishable_SYNTHETIC_ONLY_123456789012'};
function moduleFrom(source,marker,unlocked){
 const module={exports:{}};
 if(unlocked){
  assert.equal(source.split(marker).length,2,'exactly one lock marker required');
  source=source.replace(marker,marker.replace('false','true'));
 }
 vm.runInNewContext(source,{module,console},{filename:'synthetic-integration-only.cjs',timeout:1500});
 return module.exports;
}
function fixture(opts={}){
 const events=[];let active=false,currentUid=null,preflightCount=0,bindUsed=false;
 const errorFor=kind=>({error:{code:'synthetic_'+kind}});
 const auth={
  async signInWithPassword(arg){
   events.push('email_auth');
   if(arg?.email!==USER.email||arg.password!==USER.password||opts.emailFails)return errorFor('bad_password');
   active=true;currentUid=UID;
   if(opts.emailThrowsAfterSession)throw Error('synthetic_sdk_failure_after_session');
   return {data:{user:{id:UID}}};
  },
  async getUser(){
   events.push('get_user');
   if(opts.remoteFails)return errorFor('remote_failure');
   const uid=active?(opts.remoteMismatch?OTHER:currentUid):null;
   return {data:{user:uid?{id:uid,email_confirmed_at:opts.unverified?null:'2026-10-28T00:00:00Z',is_anonymous:false}:null}};
  },
  async getSession(){
   events.push('get_session');
   if(opts.sessionFails)return errorFor('session_failure');
   return {data:{session:active?{user:{id:opts.cachedMismatch?OTHER:currentUid},access_token:JWT}:null}};
  },
  async setSession(pair){
   events.push('set_session');
   if(!pair?.access_token||!pair?.refresh_token)return errorFor('missing_tokens');
   if(opts.setSessionFails)return errorFor('session_install');
   active=true;currentUid=opts.newUsernameUid||UID;
   return {data:{user:{id:currentUid}}};
  },
  async signOut(arg){
   events.push('sign_out_local');
   if(arg?.scope!=='local')throw Error('unexpected_global_signout');
   const numberOfSignouts=events.filter(x=>x==='sign_out_local').length;
   if(opts.signoutFails||opts.finalSignoutFails&&numberOfSignouts===2)return errorFor('logout_failure');
   if(!opts.stickyLogout&&!(opts.finalSessionStaysActive&&numberOfSignouts===2)){active=false;currentUid=null}
   return {error:null};
  }
 };
 const client={auth,from(table){
  assert.equal(table,'mmh_n10a6_auth_owner_probe');events.push('owner_query');
  return {select(column){
   assert.equal(column,'user_id');
   return {async limit(n){
    assert.equal(n,2);
    if(opts.ownerError)return errorFor('owner_query');
    if(opts.noOwner)return {data:[]};
    return {data:[{user_id:opts.ownerMismatch?OTHER:currentUid}]};
   }};
  }};
 }};
 const transport=async(url,request)=>{
  assert.equal(url,ENDPOINT);assert.equal(request.credentials,'omit');
  assert.equal(request.headers.apikey,cfg.publishableKey);
  events.push('edge_request');
  const data=JSON.parse(request.body);
  if(data.action==='preflight'){
   preflightCount++;
   const enabled=!(opts.closed||opts.closeOnSecond&&preflightCount>=2||opts.closeOnThird&&preflightCount>=3);
   return {status:200,async json(){return {code:'preflight_ok',enabled,
    registration_enabled:!!(opts.registrationEnabled||opts.registrationTurnsOnAt===preflightCount),
    scope:'isolated_staging_only'}}};
  }
  if(data.action==='bind'){
   events.push('bind_edge');
   assert.equal(request.headers.Authorization,'Bearer '+JWT);
   assert.equal(data.username,USER.username);
   assert.equal(data.password,USER.password);
   assert.equal(data.captcha_token,'synthetic-bind-challenge-token-1234567890');
   if(opts.bindRateLimited)return {status:429,async json(){return {code:'too_many_attempts'}}};
   if(opts.bindConflict)return {status:409,async json(){return {code:'username_unavailable'}}};
   bindUsed=true;
   return {status:200,async json(){return {code:'bind_success'}}};
  }
  if(data.action==='login'){
   events.push('username_edge');
   assert.ok(!request.headers.Authorization,'login never forwards prior bearer');
   assert.equal(data.username,USER.username);
   assert.equal(data.password,USER.password);
   assert.equal(data.captcha_token,'synthetic-login-challenge-token-1234567890');
   if(opts.loginRateLimited)return {status:429,async json(){return {code:'too_many_attempts'}}};
   if(opts.loginFailure)return {status:401,async json(){return {code:'invalid_credentials'}}};
   return {status:200,async json(){return {code:'login_success',access_token:JWT,refresh_token:REFRESH}}};
  }
  throw Error('forbidden_server_action');
 };
 const used=[];
 const captcha={async take(action){
  events.push('captcha_'+action);
  if(opts.noCaptcha||opts.missingCaptchaFor===action)return null;
  assert.ok(!used.includes(action),'one widget per action');
  used.push(action);
  return action==='mmh_n10a6_bind'?'synthetic-bind-challenge-token-1234567890':
   action==='mmh_n10a6_login'?'synthetic-login-challenge-token-1234567890':null;
 }};
 const build=(controllerUnlocked=true,adapterUnlocked=true,overrides={})=>{
  const controller=moduleFrom(CTRL,'const ALLOW_REAL_OPERATIONS=false',controllerUnlocked);
  const adapter=moduleFrom(ADAPT,'const STAGING_ADAPTER_ENABLED=false',adapterUnlocked);
  const api=adapter.makeStagingAdapter({cfg:overrides.cfg||cfg,client,transport});
  return controller.runControlledAcceptance({cfg:overrides.cfg||cfg,api,captcha,
   credentials:overrides.credentials||USER,options:overrides.options||{}});
 };
 return {build,events,used,get active(){return active},get bindUsed(){return bindUsed}};
}
test('both committed modules remain hard locked and contain no prod URL or credentials',()=>{
 assert.ok(CTRL.includes('const ALLOW_REAL_OPERATIONS=false'));
 assert.ok(ADAPT.includes('const STAGING_ADAPTER_ENABLED=false'));
 for(const text of [CTRL,ADAPT]){
  assert.ok(!text.includes('vrypucmyrztxgiqhjspd'));
  assert.ok(!text.includes('sb_secret_'));
  assert.ok(!text.includes('synthetic-only-access-token'));
 }
});
test('controller lock means ZERO credentials, token, CAPTCHA or API use',async()=>{
 const f=fixture(),r=await f.build(false,true);
 assert.equal(r.code,'test_window_locked');assert.deepEqual(f.events,[]);
});
test('adapter lock refuses before any auth or network, even with isolated controller enabled',async()=>{
 const f=fixture(),r=await f.build(true,false);
 assert.equal(r.ok,false);assert.ok(!f.events.includes('email_auth'));
 assert.ok(!f.events.includes('edge_request'));
});
test('completed bind → local logout → username auth verifies same UID with 2 owner probes',async()=>{
 const f=fixture(),r=await f.build();
 assert.equal(r.ok,true);
 assert.equal(r.code,'staging_username_acceptance_pass');
 assert.equal(f.events.filter(x=>x==='owner_query').length,3,'adapter validates own RLS on bind');
 assert.ok(f.events.indexOf('bind_edge')<f.events.indexOf('username_edge'));
 assert.ok(f.events.indexOf('sign_out_local')<f.events.indexOf('username_edge'));
 assert.ok(f.events.includes('set_session'));
 assert.deepEqual(f.used,['mmh_n10a6_bind','mmh_n10a6_login']);
 assert.ok(!JSON.stringify(r).includes(JWT));
 assert.ok(!JSON.stringify(r).includes(USER.email));
 assert.equal(f.active,false);
 assert.ok([...r.steps].includes('final_local_logout_pass'),'PASS requires verified local logout');
});
test('existing alias only uses username captcha and does not bind',async()=>{
 const f=fixture(),r=await f.build(true,true,{options:{mode:'login_existing_alias'}});
 assert.equal(r.ok,true);assert.equal(f.bindUsed,false);
 assert.deepEqual(f.used,['mmh_n10a6_login']);
});
test('missing email fails before calling real auth and no bind/login attempts',async()=>{
 const f=fixture(),r=await f.build(true,true,{credentials:{username:USER.username,password:USER.password}});
 assert.equal(r.ok,false);
 assert.equal(r.code,'email_login_failed');
 assert.ok(!f.events.includes('email_auth'));
 assert.ok(!f.events.includes('bind_edge'));
 assert.equal(f.active,false);
});
test('disabled server preflight prevents email request and captcha allocation',async()=>{
 const f=fixture({closed:true}),r=await f.build();
 assert.equal(r.code,'server_window_closed');
 assert.equal(f.events.filter(x=>x==='edge_request').length,1);
 assert.ok(!f.events.includes('email_auth'));assert.deepEqual(f.used,[]);
});
test('server enabling registration blocks the entire process',async()=>{
 const f=fixture({registrationEnabled:true}),r=await f.build();
 assert.equal(r.code,'server_window_closed');
 assert.ok(!f.events.includes('email_auth'));
});
test('email password rejected cannot proceed to username binding',async()=>{
 const f=fixture({emailFails:true}),r=await f.build();
 assert.equal(r.code,'email_login_failed');assert.equal(f.bindUsed,false);
});
test('RLS owner query failure stops before any binding and signs out locally',async()=>{
 const f=fixture({noOwner:true}),r=await f.build();
 assert.equal(r.code,'rls_owner_mismatch');assert.ok(!f.events.includes('bind_edge'));
 assert.equal(f.active,false);
});
test('RLS foreign owner stops before binding and does not install username session',async()=>{
 const f=fixture({ownerMismatch:true}),r=await f.build();
 assert.equal(r.code,'rls_owner_mismatch');assert.ok(!f.events.includes('set_session'));
 assert.equal(f.active,false);
});
test('server window closes on second preflight, no binding attempted',async()=>{
 const f=fixture({closeOnSecond:true}),r=await f.build();
 assert.equal(r.code,'server_window_closed');assert.ok(!f.events.includes('bind_edge'));
 assert.equal(f.active,false);
});
test('server window closes on third preflight, bind may persist but no username login',async()=>{
 const f=fixture({closeOnThird:true}),r=await f.build();
 assert.equal(r.code,'server_window_closed');assert.equal(f.bindUsed,true);
 assert.ok(!f.events.includes('username_edge'));assert.equal(f.active,false);
});
test('username collision immediately stops and cleans local login',async()=>{
 const f=fixture({bindConflict:true}),r=await f.build();
 assert.equal(r.code,'bind_not_accepted');assert.ok(!f.events.includes('username_edge'));
 assert.equal(f.active,false);
});
test('bind limiter 429 stops without retry or creating username auth',async()=>{
 const f=fixture({bindRateLimited:true}),r=await f.build();
 assert.equal(r.code,'rate_limited_stop');
 assert.equal(f.events.filter(x=>x==='bind_edge').length,1);
 assert.ok(!f.events.includes('username_edge'));assert.equal(f.active,false);
});
test('login limiter 429 stops and never installs session',async()=>{
 const f=fixture({loginRateLimited:true}),r=await f.build();
 assert.equal(r.code,'rate_limited_stop');assert.ok(!f.events.includes('set_session'));
 assert.equal(f.active,false);
});
test('login rejected after existing alias always leaves local session closed',async()=>{
 const f=fixture({loginFailure:true}),r=await f.build(true,true,{options:{mode:'login_existing_alias'}});
 assert.equal(r.code,'username_login_failed');assert.equal(f.active,false);
});
test('UID differs after username SDK setSession: fail and local signout',async()=>{
 const f=fixture({newUsernameUid:OTHER}),r=await f.build();
 assert.equal(r.code,'uid_mismatch');assert.equal(f.active,false);
 assert.ok(!JSON.stringify(r).includes(OTHER));
});
test('getUser Auth error fails closed before bind, cleans local session',async()=>{
 const f=fixture({remoteFails:true}),r=await f.build();
 assert.equal(r.ok,false);assert.ok(!f.events.includes('bind_edge'));assert.equal(f.active,false);
});
test('SDK setSession failure after successful username auth triggers local cleanup',async()=>{
 const f=fixture({setSessionFails:true}),r=await f.build();
 assert.equal(r.code,'session_install_failed');
 assert.equal(f.active,false);
});
test('sticky logout must STOP and never submit username credentials',async()=>{
 const f=fixture({stickyLogout:true}),r=await f.build();
 assert.equal(r.code,'local_logout_failed');
 assert.equal(f.events.includes('username_edge'),false);
});
test('local signOut throws Error and must not continue to username login',async()=>{
 const f=fixture({signoutFails:true}),r=await f.build();
 assert.equal(r.ok,false);assert.equal(f.events.includes('username_edge'),false);
});
test('invalid staging project blocks before all SDK/network operations',async()=>{
 const f=fixture(),r=await f.build(true,true,{cfg:{...cfg,project:'vrypucmyrztxgiqhjspd'}});
 assert.equal(r.code,'wrong_staging_project');assert.deepEqual(f.events,[]);
});
test('sample public key is required and no service-role secret may appear',async()=>{
 const f=fixture(),r=await f.build(true,true,{cfg:{...cfg,publishableKey:'sb_secret_not_a_public_key'}});
 assert.equal(r.ok,false);assert.deepEqual(f.events,[]);
});

test('final signOut returns SDK error: NEVER report login acceptance PASS',async()=>{
 const f=fixture({finalSignoutFails:true}),r=await f.build();
 assert.equal(r.ok,false);assert.equal(r.code,'local_logout_failed');
 assert.ok(![...r.steps].includes('final_local_logout_pass'));
 assert.equal(f.events.filter(x=>x==='sign_out_local').length,3,'best-effort cleanup retried');
 assert.equal(f.active,false);
});
test('final signOut silently leaves session active: MUST reject PASS and retry cleanup',async()=>{
 const f=fixture({finalSessionStaysActive:true}),r=await f.build();
 assert.equal(r.ok,false);assert.equal(r.code,'local_logout_failed');
 assert.ok(![...r.steps].includes('final_local_logout_pass'));
 assert.equal(f.events.filter(x=>x==='sign_out_local').length,3);
 assert.equal(f.active,false);
});

test('N10-A7.27 registration reopening on second preflight blocks bind',async()=>{
 const f=fixture({registrationTurnsOnAt:2}),r=await f.build();
 assert.equal(r.code,'server_window_closed');assert.equal(f.bindUsed,false);
 assert.equal(f.events.includes('bind_edge'),false);assert.equal(f.active,false);
});
test('N10-A7.27 registration reopening after binding blocks username login',async()=>{
 const f=fixture({registrationTurnsOnAt:3}),r=await f.build();
 assert.equal(r.code,'server_window_closed');assert.equal(f.bindUsed,true);
 assert.equal(f.events.includes('username_edge'),false);assert.equal(f.active,false);
});
test('N10-A7.27 SDK throws after session creation: clean up despite no success response',async()=>{
 const f=fixture({emailThrowsAfterSession:true}),r=await f.build();
 assert.equal(r.ok,false);assert.equal(f.active,false);
 assert.equal(f.events.includes('sign_out_local'),true);
 assert.equal(f.events.includes('bind_edge'),false);
});
