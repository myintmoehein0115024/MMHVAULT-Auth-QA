'use strict';
// N10-A7.27: load committed REVIEW-LOCKED SDK bridge in isolated VM, never real network.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const CODE=fs.readFileSync('integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs','utf8');
const CTRL=fs.readFileSync('integration/N10-A7.23-real-username-acceptance-LOCKED.cjs','utf8');
const ADAPT=fs.readFileSync('integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs','utf8');
const PROJECT='ldivswlhtgmznzwhzsoi',BASE='https://'+PROJECT+'.supabase.co';
const EDGE=BASE+'/functions/v1/mmh-n10a6-username',ORIGIN='https://myintmoehein0115024.github.io';
const UID='11111111-1111-4111-8111-111111111111';
const USER={username:'qa_alpha',email:'synthetic@example.invalid',password:'FAKE-CREDENTIAL-NOT-REAL'};
const cfg={project:PROJECT,base:BASE,endpoint:EDGE,origin:ORIGIN,
 publishableKey:'sb_publishable_SYNTHETIC_ONLY_123456789'};
const fakeUUID='a1234567-1234-4567-8123-123456789012';
function moduleFrom(text,marker,unlock=false){
 if(unlock){
  assert.equal(text.split(marker).length,2);
  text=text.replace(marker,marker.replace('false','true'));
 }
 const mod={exports:{}};
 vm.runInNewContext(text,{module:mod,URL,Map,console},{timeout:2000,filename:'N10-A7.27-hermetic-vm.cjs'});
 return mod.exports;
}
function harness({logoutError=false,sessionSticks=false,creationError=false,
 remoteUID=UID,ownerUID=UID,failSecondPreflight=false}={}){
 const events=[];let activeSession=false,optionsPassed=null,store=null,preflights=0;
 const transport=async(url,options)=>{
  const u=typeof url==='string'?url:url.url;
  events.push({type:'fetch',url:u,method:options?.method,credentials:options?.credentials,redirect:options?.redirect,
    body:options?.body});
  if(u===EDGE){
   const payload=JSON.parse(options.body);
   if(payload.action==='preflight'){
    preflights++;
    return {status:200,async json(){return {code:'preflight_ok',enabled:!(failSecondPreflight&&preflights>1),
      registration_enabled:false,scope:'isolated_staging_only'}}};
   }
   if(payload.action==='bind'){
    assert.equal(payload.username,USER.username);
    assert.equal(payload.password,USER.password);
    assert.equal(payload.captcha_token,'fake-bind-token-1234567890123456');
    return {status:200,async json(){return {code:'bind_success'}}};
   }
   if(payload.action==='login'){
    assert.equal(payload.password,USER.password);
    assert.equal(payload.captcha_token,'fake-login-token-1234567890123456');
    return {status:200,async json(){return {code:'login_success',
      access_token:'FAKE-ACCESS-TOKEN-1234567890',refresh_token:'FAKE-REFRESH-TOKEN-1234567890'}}};
   }
   throw Error('unapproved_action');
  }
  return {status:200,async json(){return {code:'synthetic_sdk_ok'}}};
 };
 const createClient=(url,key,options)=>{
  events.push({type:'client_create',url,key});
  if(creationError)throw Error('fake_client_constructor_failed');
  assert.equal(url,BASE);
  assert.equal(key,cfg.publishableKey);
  optionsPassed=options;store=options.auth.storage;
  const sdkFetch=options.global.fetch;
  const auth={
   async signInWithPassword(c){
    events.push({type:'sdk_email_signin'});
    assert.equal(c.email,USER.email);assert.equal(c.password,USER.password);
    await sdkFetch(BASE+'/auth/v1/token?grant_type=password',{method:'POST'});
    activeSession=true;
    return {data:{user:{id:UID}}};
   },
   async getUser(){
    events.push({type:'sdk_get_user'});
    await sdkFetch(BASE+'/auth/v1/user',{method:'GET'});
    return {data:{user:activeSession?{id:remoteUID,email_confirmed_at:'2026-10-29T00:00:00Z',is_anonymous:false}:null}};
   },
   async getSession(){
    events.push({type:'sdk_get_session'});
    return {data:{session:activeSession?{user:{id:UID},access_token:'FAKE-ACCESS-TOKEN-1234567890'}:null}};
   },
   async setSession(tokens){
    events.push({type:'sdk_set_session'});
    assert.ok(tokens.access_token.startsWith('FAKE-'));
    activeSession=true;
    return {data:{user:{id:UID}}};
   },
   async signOut(arg){
    events.push({type:'sdk_logout',scope:arg.scope});
    assert.equal(arg.scope,'local');
    await sdkFetch(BASE+'/auth/v1/logout?scope=local',{method:'POST'});
    if(logoutError)return {error:{code:'synthetic_logout_error'}};
    if(!sessionSticks)activeSession=false;
    return {error:null};
   },
   async dispose(){events.push({type:'sdk_dispose'})}
  };
  return {auth,from(t){
   if(t!=='mmh_n10a6_auth_owner_probe')throw Error('non_probe_table');
   return {select(c){
    assert.equal(c,'user_id');
    return {async limit(n){
     assert.equal(n,2);
     await sdkFetch(BASE+'/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2',{method:'GET'});
     return {data:[{user_id:ownerUID}]};
    }};
   }};
  }};
 };
 let bridgeInstance=null;
 const make=(unlocked=true,overrides={})=>{
  const bridge=bridgeInstance||(bridgeInstance=moduleFrom(CODE,'const STAGING_SDK_BOOTSTRAP_ENABLED=false',unlocked));
  return bridge.createIsolatedStagingSdk({cfg:overrides.cfg||cfg,origin:overrides.origin||ORIGIN,
    createClient,fetcher:transport,randomUUID:()=>fakeUUID});
 };
 return {make,events,transport,createClient,get opts(){return optionsPassed},
  get store(){return store},get active(){return activeSession}};
}
test('committed triple locks remain false and never include real credentials',()=>{
 assert.match(CODE,/const STAGING_SDK_BOOTSTRAP_ENABLED=false/);
 assert.match(CTRL,/const ALLOW_REAL_OPERATIONS=false/);
 assert.match(ADAPT,/const STAGING_ADAPTER_ENABLED=false/);
 for(const file of [CODE,CTRL,ADAPT]){
  assert.ok(!file.includes('vrypucmyrztxgiqhjspd'));
  assert.ok(!file.includes('sb_secret_'));
  assert.ok(!file.includes('FAKE-CREDENTIAL-NOT-REAL'));
 }
});
test('default bridge lock means zero SDK initialization/randomness/network',()=>{
 const h=harness(),result=h.make(false);
 assert.equal(result.enabled,false);assert.equal(result.code,'staging_sdk_bootstrap_locked');
 assert.equal(h.events.length,0);
});
test('rejects production project, mismatched origin and invalid publishable key',()=>{
 const h=harness();
 const bad=[
  {cfg:{...cfg,project:'vrypucmyrztxgiqhjspd'}},
  {cfg:{...cfg,base:'https://vrypucmyrztxgiqhjspd.supabase.co'}},
  {cfg:{...cfg,publishableKey:'sb_secret_FORBIDDEN'}},
  {cfg:{...cfg,endpoint:'https://other.example/functions/v1/username'}},
  {origin:'https://evil.example'}
 ];
 for(const b of bad){
  const r=h.make(true,b);assert.equal(r.enabled,false);assert.equal(h.events.length,0);
 }
});
test('SDK auth options are isolated, no persistent session or OAuth URL parsing',async()=>{
 const h=harness(),r=h.make();
 assert.equal(r.enabled,true);assert.equal(h.events.length,1);
 const opts=h.opts;
 assert.equal(opts.auth.persistSession,false);
 assert.equal(opts.auth.autoRefreshToken,false);
 assert.equal(opts.auth.detectSessionInUrl,false);
 assert.equal(opts.auth.flowType,'implicit');
 assert.match(opts.auth.storageKey,/^mmh-n10a27-tab-[a-f0-9-]{36}$/);
 assert.equal(opts.auth.storage.getItem('token'),null);
 opts.auth.storage.setItem('token','synthetic-token');
 assert.equal(opts.auth.storage.getItem('token'),'synthetic-token');
 const closed=await r.close();
 assert.equal(closed.ok,true);
 assert.equal(h.store.getItem('token'),null,'no remaining memory storage');
});
test('creation failure releases single-tab gate with no session exposed',()=>{
 const f=harness({creationError:true});
 const a=f.make();assert.equal(a.enabled,false);assert.equal(a.code,'sdk_creation_failed');
 const b=f.make();assert.equal(b.enabled,false);assert.equal(b.code,'sdk_creation_failed');
});
test('only one live QA SDK instance per realm; local close releases gate',async()=>{
 const h=harness(),a=h.make(),b=h.make();
 assert.equal(a.enabled,true);assert.equal(b.enabled,false);
 assert.equal(b.code,'another_test_session_exists');
 const closed=await a.close();assert.equal(closed.ok,true);
 const c=h.make();assert.equal(c.enabled,true);
 await c.close();
});
test('SDK network whitelist rejects signup, OAuth, admin, storage, cross-project and URLs with secrets',async()=>{
 const h=harness(),r=h.make(),g=h.opts.global.fetch;
 const blocked=[
  BASE+'/auth/v1/signup',BASE+'/auth/v1/authorize?provider=google',
  BASE+'/auth/v1/admin/users',BASE+'/storage/v1/object/list',
  BASE+'/rest/v1/mmh_n10a6_username_links?select=*',
  BASE+'/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=50',
  BASE+'/auth/v1/logout?scope=global',
  'https://vrypucmyrztxgiqhjspd.supabase.co/auth/v1/user',
  'https://evil.example/auth/v1/user',
  BASE+'/auth/v1/user?access_token=FAKE',
  'https://ldivswlhtgmznzwhzsoi.supabase.co.evil.example/auth/v1/user'
 ];
 const count=h.events.length;
 for(const url of blocked)await assert.rejects(()=>g(url,{method:'GET'}));
 assert.equal(h.events.length,count,'reject disallowed endpoints before fetch');
 await r.close();
});
test('allowed SDK paths force omit credentials/no redirects/no cache',async()=>{
 const h=harness(),r=h.make();
 const f=h.opts.global.fetch;
 for(const [url,method] of [
  [BASE+'/auth/v1/token?grant_type=password','POST'],
  [BASE+'/auth/v1/token?grant_type=refresh_token','POST'],
  [BASE+'/auth/v1/user','GET'],
  [BASE+'/auth/v1/logout?scope=local','POST'],
  [BASE+'/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2','GET']
 ])await f(url,{method,credentials:'include',redirect:'follow'});
 const entries=h.events.filter(e=>e.type==='fetch');
 assert.equal(entries.length,5);
 for(const e of entries){assert.equal(e.credentials,'omit');assert.equal(e.redirect,'error')}
 await r.close();
});
test('restricted Edge transport refuses other projects and additional auth actions',async()=>{
 const h=harness(),r=h.make(),f=r.transport;
 let n=h.events.length;
 await assert.rejects(()=>f('https://vrypucmyrztxgiqhjspd.supabase.co/functions/v1/mmh-n10a6-username',
  {method:'POST',mode:'cors',credentials:'omit',body:'{"action":"login"}'}));
 await assert.rejects(()=>f(EDGE,{method:'POST',mode:'cors',credentials:'omit',body:'{"action":"signup"}'}));
 await assert.rejects(()=>f(EDGE,{method:'GET',mode:'cors',credentials:'omit',body:'{"action":"preflight"}'}));
 await assert.rejects(()=>f(EDGE,{method:'POST',mode:'cors',credentials:'include',body:'{"action":"preflight"}'}));
 assert.equal(h.events.length,n);
 const resp=await f(EDGE,{method:'POST',mode:'cors',credentials:'omit',body:'{"action":"preflight"}'});
 assert.equal(resp.status,200);await r.close();
});
test('facade blocks signOut scope global and all non-Owner data tables',async()=>{
 const h=harness(),r=h.make();
 assert.throws(()=>r.client.auth.signOut({scope:'global'}));
 assert.throws(()=>r.client.from('transactions'));
 assert.throws(()=>r.client.from('mmh_n10a6_username_links'));
 assert.equal(h.events.filter(x=>x.type==='sdk_logout').length,0);
 await r.close();
});
test('cleanup error is explicit and never claims successful sign-out',async()=>{
 const h=harness({logoutError:true}),r=h.make();
 const result=await r.close();assert.equal(result.ok,false);
 assert.equal(result.code,'session_cleanup_unconfirmed');
 assert.equal(h.events.some(e=>e.type==='sdk_dispose'),true);
});
test('sticky session after local logout is UNCONFIRMED even when SDK returns no error',async()=>{
 const h=harness({sessionSticks:true}),r=h.make();
 await r.client.auth.signInWithPassword(USER);
 const result=await r.close();assert.equal(result.ok,false);
 assert.equal(result.code,'session_cleanup_unconfirmed');
});
test('synthetic three-module integration: email UID/RLS → bind → local logout → username UID/RLS → logout',async()=>{
 const h=harness(),bridge=h.make();
 const a=moduleFrom(ADAPT,'const STAGING_ADAPTER_ENABLED=false',true);
 const c=moduleFrom(CTRL,'const ALLOW_REAL_OPERATIONS=false',true);
 const api=a.makeStagingAdapter({cfg,client:bridge.client,transport:bridge.transport});
 assert.equal(api.enabled,true);
 const takes=[];
 const captcha={async take(action){
  takes.push(action);
  return action==='mmh_n10a6_bind'?'fake-bind-token-1234567890123456':'fake-login-token-1234567890123456';
 }};
 const out=await c.runControlledAcceptance({cfg,api,captcha,credentials:USER,options:{mode:'bind_then_login'}});
 assert.equal(out.ok,true);assert.equal(out.code,'staging_username_acceptance_pass');
 assert.deepEqual(takes,['mmh_n10a6_bind','mmh_n10a6_login']);
 const edgeCalls=h.events.filter(e=>e.type==='fetch'&&e.url===EDGE);
 assert.deepEqual(edgeCalls.map(e=>JSON.parse(e.body).action),
  ['preflight','preflight','bind','preflight','login']);
 assert.equal(h.events.filter(e=>e.type==='sdk_logout').length,2);
 assert.equal(h.active,false);
 const closed=await bridge.close();assert.equal(closed.ok,true);
 assert.ok(!JSON.stringify(out).includes(USER.password));
 assert.ok(!JSON.stringify(out).includes(UID));
});
test('integration stops if Staging window closes mid-sequence; never binds',async()=>{
 const h=harness({failSecondPreflight:true}),bridge=h.make();
 const a=moduleFrom(ADAPT,'const STAGING_ADAPTER_ENABLED=false',true);
 const c=moduleFrom(CTRL,'const ALLOW_REAL_OPERATIONS=false',true);
 const api=a.makeStagingAdapter({cfg,client:bridge.client,transport:bridge.transport});
 const out=await c.runControlledAcceptance({cfg,api,captcha:{take:async()=> 'fake-bind-token-1234567890123456'},
  credentials:USER});
 assert.equal(out.ok,false);assert.equal(out.code,'server_window_closed');
 assert.equal(h.events.filter(e=>e.type==='fetch'&&e.url===EDGE&&JSON.parse(e.body).action==='bind').length,0);
 assert.equal(h.active,false);await bridge.close();
});

test('N10-A7.27 closed session refuses all further facade and Edge operations',async()=>{
 const h=harness(),r=h.make();
 assert.equal((await r.close()).ok,true);
 assert.throws(()=>r.client.auth.signInWithPassword(USER),/qa_session_closed/);
 assert.throws(()=>r.client.auth.getUser(),/qa_session_closed/);
 assert.throws(()=>r.client.auth.getSession(),/qa_session_closed/);
 assert.throws(()=>r.client.auth.setSession({access_token:'FAKE',refresh_token:'FAKE'}),/qa_session_closed/);
 assert.throws(()=>r.client.from('mmh_n10a6_auth_owner_probe'),/qa_session_closed/);
 assert.throws(()=>r.transport(EDGE,{method:'POST',mode:'cors',credentials:'omit',
  body:'{"action":"login"}'}),/qa_session_closed/);
});
test('N10-A7.27 prevents concurrent close from falsely claiming completion',async()=>{
 const h=harness(),r=h.make();
 const first=r.close(),second=await r.close();
 assert.equal(second.ok,false);assert.equal(second.code,'close_in_progress');
 const completed=await first;assert.equal(completed.ok,true);
 assert.equal((await r.close()).code,'already_closed');
});
