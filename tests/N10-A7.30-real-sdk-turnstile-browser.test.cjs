'use strict';
/*
 N10-A7.30: real pinned Supabase SDK with real reviewed controller/adapter/bridge/
 Turnstile provider/runner in Chromium. All HTTP / widgets are synthetic.
 An unlocked in-memory CI bundle is NEVER written to disk or committed.
*/
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const pkgRequire=createRequire(path.resolve('qa/n10-a728-real-sdk/package.json'));
const {chromium}=pkgRequire('playwright-core'),esbuild=pkgRequire('esbuild');
const ORIGIN='https://myintmoehein0115024.github.io';
const ID='ldivswlhtgmznzwhzsoi',BASE='https://'+ID+'.supabase.co';
const EDGE=BASE+'/functions/v1/mmh-n10a6-username';
const PAGE=ORIGIN+'/MMHVAULT-Auth-QA/n10a730-browser-SYNTHETIC';
const BUNDLE=ORIGIN+'/MMHVAULT-Auth-QA/n10a730-in-memory-test-only.js';
const PAGE_JS=ORIGIN+'/MMHVAULT-Auth-QA/n10a726/staging-locked.js';
const PAGE_CSS=ORIGIN+'/MMHVAULT-Auth-QA/n10a726/staging-locked.css';
const UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const email='synthetic.a730@example.invalid',password='synthetic-only-not-a-real-password';
const jwt=(uid)=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
 Buffer.from(JSON.stringify({sub:uid,aud:'authenticated',role:'authenticated',
  exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)-60})).toString('base64url'),
 Buffer.from('fake-a730-signature').toString('base64url')].join('.');
const access=jwt(UID),refresh='fake-refresh-a730-12345678901234567890';
const user={id:UID,email,email_confirmed_at:'2026-10-29T00:00:00.000Z',
 app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',role:'authenticated',created_at:'2026-10-29T00:00:00.000Z'};
const sources=[
 ['ctrl','integration/N10-A7.23-real-username-acceptance-LOCKED.cjs','const ALLOW_REAL_OPERATIONS=false'],
 ['adapter','integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs','const STAGING_ADAPTER_ENABLED=false'],
 ['sdk','integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs','const STAGING_SDK_BOOTSTRAP_ENABLED=false'],
 ['captcha','integration/N10-A7.29-turnstile-actions-LOCKED.cjs','const ALLOW_TURNSTILE_ACTIONS=false'],
 ['runner','integration/N10-A7.30-browser-acceptance-LOCKED.cjs','const ALLOW_BROWSER_ACCEPTANCE=false']
];
const states=new WeakMap(),observed=[];
let bundle='',browser,context;
function state(page){
 if(!states.has(page))states.set(page,{scenario:'pass',phase:'none',preflights:0,
  edgeActions:[],sqlQueries:0,signoutCount:0,authTokenCount:0});
 return states.get(page);
}
function respond(route,obj,status=200){
 return route.fulfill({status,contentType:'application/json',headers:{
 'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info',
 'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Cache-Control':'no-store'},
 body:JSON.stringify(obj)});
}
function intercept(route){
 const req=route.request(),url=req.url(),u=new URL(url);
 let page=null;try{page=req.frame().page()}catch{}
 const st=page?state(page):{scenario:'pass',phase:'none',preflights:0,edgeActions:[]};
 observed.push({url,method:req.method()});
 if(url===PAGE){
  let html=fs.readFileSync('n10a726-staging-acceptance-LOCKED.html','utf8');
  html=html.replace('</body>','<script defer src="'+BUNDLE+'"></script></body>');
  return route.fulfill({status:200,contentType:'text/html',body:html});
 }
 if(url===PAGE_JS)return route.fulfill({status:200,contentType:'text/javascript',
  body:fs.readFileSync('n10a726/staging-locked.js','utf8')});
 if(url===PAGE_CSS)return route.fulfill({status:200,contentType:'text/css',
  body:fs.readFileSync('n10a726/staging-locked.css','utf8')});
 if(url===BUNDLE)return route.fulfill({status:200,contentType:'text/javascript',body:bundle});
 if(u.origin!==BASE)throw Error('FORBIDDEN_TEST_NETWORK '+u.origin);
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{
  'Access-Control-Allow-Origin':ORIGIN,
  'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST, GET, OPTIONS'}});
 if(u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password'){
  st.authTokenCount=(st.authTokenCount||0)+1;
  if(st.scenario==='email401')return respond(route,{error:'invalid_grant',error_description:'Invalid credentials',msg:'Invalid credentials'},400);
  st.phase='email';return respond(route,{access_token:access,refresh_token:refresh,token_type:'bearer',
   expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
 }
 if(u.pathname==='/auth/v1/user'&&req.method()==='GET'){
  if(st.phase==='none')return respond(route,{msg:'No user'},401);
  return respond(route,{user:{...user,id:st.scenario==='uid_mismatch'&&st.phase==='username'?OTHER:UID}});
 }
 if(u.pathname==='/auth/v1/logout'&&req.method()==='POST'){
  st.signoutCount=(st.signoutCount||0)+1;
  if(st.scenario==='logout_fail')return respond(route,{code:'synthetic_logout_error',msg:'Logout unavailable'},503);
  st.phase='none';return respond(route,{});
 }
 if(u.pathname==='/rest/v1/mmh_n10a6_auth_owner_probe'&&req.method()==='GET'){
  st.sqlQueries=(st.sqlQueries||0)+1;
  if(st.scenario==='rls_denied')return respond(route,{code:'42501',message:'RLS denied'},403);
  return respond(route,[{user_id:st.scenario==='rls_other'?OTHER:UID}]);
 }
 if(u.pathname==='/functions/v1/mmh-n10a6-username'&&req.method()==='POST'){
  const data=JSON.parse(req.postData()||'{}');st.edgeActions.push(data.action);
  if(data.action==='preflight'){
   st.preflights++;
   if(st.scenario==='preflight503')return respond(route,{code:'window_closed'},503);
   return respond(route,{code:'preflight_ok',scope:'isolated_staging_only',
    enabled:st.scenario!=='closed'&&!(st.scenario==='closed_second'&&st.preflights>=2),
    registration_enabled:st.scenario==='registration_open'&&st.preflights>=2});
  }
  if(data.action==='bind'){
   if(st.scenario==='bind409')return respond(route,{code:'username_unavailable'},409);
   if(st.scenario==='bind429')return respond(route,{code:'too_many_attempts'},429);
   return respond(route,{code:'bind_success'});
  }
  if(data.action==='login'){
   if(st.scenario==='login429')return respond(route,{code:'too_many_attempts'},429);
   if(st.scenario==='login401')return respond(route,{code:'invalid_credentials'},401);
   st.phase='username';return respond(route,{code:'login_success',access_token:access,refresh_token:refresh});
  }
 }
 throw Error('UNMOCKED_STAGING_REQUEST '+u.pathname);
}
function browserHarness(){
 const cfg={
  project:'ldivswlhtgmznzwhzsoi',
  base:'https://ldivswlhtgmznzwhzsoi.supabase.co',
  endpoint:'https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username',
  origin:'https://myintmoehein0115024.github.io',
  publishableKey:'sb_publishable_SYNTHETIC_BROWSER_123456789012'
 };
 const creds={email:'synthetic.a730@example.invalid',password:'synthetic-only-not-a-real-password',username:'qa_alpha'};
 const widgets=[],events=[];
 const turnstile={
  render(container,opts){const id=widgets.length;widgets.push({container,opts});events.push('render:'+opts.action);return id},
  execute(id){
   const opts=widgets[id].opts;events.push('execute:'+opts.action);
   const scenario=window.__qaScenario||'pass';
   Promise.resolve().then(()=>{
    if(scenario==='captcha_failed')opts['error-callback']();
    else if(scenario==='captcha_expired')opts['expired-callback']();
    else opts.callback('fake-a730-'+opts.action+'-12345678901234567890');
   });
  },
  remove(id){events.push('remove:'+widgets[id]?.opts?.action)}
 };
 window.__A730={
  version:'N10-A7.30-synthetic-only',
  getEvents:()=>events.slice(),
  async run(mode='bind_then_login',options={}){
   const origin=options.origin||location.origin;
   const deadlineUTC=options.deadlineUTC||'2099-01-01T00:00:00.000Z';
   const makeSdk=()=>sdk.createIsolatedStagingSdk({cfg,origin,createClient,
    fetcher:fetch.bind(globalThis),randomUUID:crypto.randomUUID.bind(crypto)});
   const makeAdapter=bridge=>adapter.makeStagingAdapter({cfg,client:bridge.client,transport:bridge.transport});
   const makeCaptcha=()=>captcha.createActionProvider({origin,sitekey:'FAKE_PUBLIC_CLOUDFLARE_SITEKEY_01234567890',
    turnstile,makeContainer:()=>{
     const el=document.createElement('div');el.style.display='none';document.body.appendChild(el);return el;
    },timeoutMs:1000});
   const review=runner.createReviewBrowserAcceptance({cfg,origin,deadlineUTC,
    createSdk:makeSdk,createAdapter:makeAdapter,createCaptcha:makeCaptcha,
    runController:ctrl.runControlledAcceptance});
   if(!review.enabled)return {ok:false,code:review.code,steps:[]};
   const result=await review.run({mode,credentials:creds});
   if(options.repeat)return {result,again:await review.run({mode,credentials:creds})};
   return result;
  }
 };
}
async function buildBundle(){
 const chunks=["const {createClient}=require('@supabase/supabase-js');"];
 for(const [name,file,marker] of sources){
  const text=fs.readFileSync(file,'utf8');
  assert.equal(text.split(marker).length,2,'hard lock absent in committed source '+file);
  chunks.push('const '+name+'=(function(){const module={exports:{}};\n'+
   text.replace(marker,marker.replace('false','true'))+'\nreturn module.exports;})();');
 }
 chunks.push('('+browserHarness.toString()+')();');
 const out=await esbuild.build({stdin:{
  contents:chunks.join('\n'),resolveDir:path.resolve('qa/n10-a728-real-sdk'),
  sourcefile:'n10a730-isolated-unpublished-browser.js'},
  bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'});
 return out.outputFiles[0].text;
}
test.before(async()=>{
 bundle=await buildBundle();
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
 await context.route('**/*',intercept);
});
test.after(async()=>{await context?.close();await browser?.close()});
async function tab(scenario='pass',width=390){
 const page=await context.newPage(),st=state(page);st.scenario=scenario;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:844});
 const resp=await page.goto(PAGE,{waitUntil:'load',timeout:30000});
 assert.equal(resp.status(),200);
 await page.waitForFunction(()=>!!window.__A730,{timeout:9000});
 await page.evaluate(s=>{window.__qaScenario=s},scenario);
 return {page,st,errors};
}
const run=(t,mode='bind_then_login',options={})=>t.page.evaluate(
 ({mode,options})=>window.__A730.run(mode,options),{mode,options});
test('committed locked public shell loads, disabled credential controls, zero account traffic',async()=>{
 observed.length=0;const t=await tab();
 try{
  const info=await t.page.evaluate(()=>({
   locked:document.getElementById('locked-password').disabled,
   submit:document.getElementById('real-run').disabled,
   results:['email','bind','login','uid','rls','logout'].map(k=>document.getElementById('result-'+k).textContent),
   local:localStorage.length,session:sessionStorage.length,cookie:document.cookie
  }));
  assert.equal(info.locked,true);assert.equal(info.submit,true);
  assert.deepEqual(info.results,Array(6).fill('NOT RUN'));
  assert.equal(info.local,0);assert.equal(info.session,0);assert.equal(info.cookie,'');
  assert.equal(t.st.edgeActions.length,0);assert.deepEqual(t.errors,[]);
 }finally{await t.page.close()}
});
test('actual SDK+controller+adapter+Turnstile fake completes G11 full same-UID/RLS/exit flow',async()=>{
 const t=await tab();
 try{
  const r=await run(t);
  assert.equal(r.ok,true,'fail '+r.code);assert.equal(r.code,'staging_username_acceptance_pass');
  assert.deepEqual(t.st.edgeActions,['preflight','preflight','bind','preflight','login']);
  assert.ok(t.st.sqlQueries>=3);assert.equal(t.st.phase,'none');assert.ok(t.st.signoutCount>=2);
  const events=await t.page.evaluate(()=>window.__A730.getEvents());
  assert.deepEqual(events.filter(e=>e.startsWith('render:')),
   ['render:mmh_n10a6_bind','render:mmh_n10a6_login']);
  assert.equal(events.filter(e=>e.startsWith('remove:')).length,2);
  assert.equal(JSON.stringify(r).includes(UID),false);
  assert.equal(JSON.stringify(r).includes(password),false);
  const s=await t.page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,cookie:document.cookie}));
  assert.equal(s.local,0);assert.equal(s.session,0);assert.equal(s.cookie,'');
  assert.deepEqual(t.errors,[]);
 }finally{await t.page.close()}
});
test('actual SDK+G10 existing alias never submits bind; login-only Turnstile action',async()=>{
 const t=await tab();
 try{
  const r=await run(t,'login_existing_alias');
  assert.equal(r.ok,true,r.code);
  assert.deepEqual(t.st.edgeActions,['preflight','preflight','login']);
  const e=await t.page.evaluate(()=>window.__A730.getEvents());
  assert.deepEqual(e.filter(x=>x.startsWith('render:')),['render:mmh_n10a6_login']);
  assert.equal(t.st.phase,'none');
 }finally{await t.page.close()}
});
for(const [scenario,mode,expected,forbid] of [
 ['closed','bind_then_login','server_window_closed','bind'],
 ['preflight503','bind_then_login','server_window_closed','bind'],
 ['email401','bind_then_login','email_login_failed','bind'],
 ['closed_second','bind_then_login','server_window_closed','bind'],
 ['registration_open','bind_then_login','server_window_closed','bind'],
 ['bind409','bind_then_login','bind_not_accepted','login'],
 ['bind429','bind_then_login','rate_limited_stop','login'],
 ['login401','login_existing_alias','username_login_failed','bind'],
 ['login429','login_existing_alias','rate_limited_stop','bind'],
 ['uid_mismatch','bind_then_login','uid_mismatch','unexpected_action'],
 ['rls_denied','bind_then_login','test_unavailable','bind'],
 ['rls_other','bind_then_login','rls_owner_mismatch','bind'],
 ['captcha_failed','bind_then_login','test_unavailable','bind'],
 ['captcha_expired','bind_then_login','test_unavailable','bind']
]){
 test('complete integration fails closed on '+scenario,async()=>{
  const t=await tab(scenario);
  try{
   const r=await run(t,mode);
   assert.equal(r.ok,false,'must fail '+scenario);
   assert.equal(r.code,expected,'code '+scenario);
   assert.equal(t.st.edgeActions.includes(forbid),false,'forbidden action '+forbid);
   assert.equal(JSON.stringify(r).includes(password),false);
   assert.equal(JSON.stringify(r).includes(UID),false);
   const s=await t.page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}));
   assert.equal(s.local,0);assert.equal(s.session,0);
   assert.deepEqual(t.errors,[]);
  }finally{await t.page.close()}
 });
}
test('SDK signout failure never yields PASS, cleanup unconfirmed triggers block',async()=>{
 const t=await tab('logout_fail');
 try{
  const r=await run(t,'login_existing_alias');
  assert.equal(r.ok,false);
  assert.ok(['session_cleanup_unconfirmed','local_logout_failed'].includes(r.code),r.code);
  assert.equal(t.st.edgeActions.includes('login'),false);
 }finally{await t.page.close()}
});
test('production domain and www cannot be accepted by Staging review runner',async()=>{
 const t=await tab();
 try{
  for(const origin of ['https://mmhvault.com','https://www.mmhvault.com']){
   const r=await run(t,'bind_then_login',{origin});
   assert.equal(r.ok,false);assert.equal(r.code,'browser_review_context_rejected');
  }
  assert.equal(t.st.edgeActions.length,0);
 }finally{await t.page.close()}
});
test('runner enforces one use: second run sends no extra auth',async()=>{
 const t=await tab();
 try{
  const res=await run(t,'login_existing_alias',{repeat:true});
  assert.equal(res.result.ok,true,res.result.code);
  assert.equal(res.again.code,'browser_run_already_used');
  assert.equal(t.st.edgeActions.filter(x=>x==='login').length,1);
 }finally{await t.page.close()}
});
test('expired local deadline does not create SDK or send login',async()=>{
 const t=await tab();
 try{
  const r=await run(t,'bind_then_login',{deadlineUTC:'2020-01-01T00:00:00.000Z'});
  assert.equal(r.code,'browser_deadline_not_future');
  assert.equal(t.st.edgeActions.length,0);
 }finally{await t.page.close()}
});
for(const width of [320,375,390,428,768,1024,1440]){
 test('mobile and desktop locked shell has no horizontal overflow at '+width+'px',async()=>{
  const t=await tab('pass',width);
  try{
   const dims=await t.page.evaluate(()=>({
    scroll:document.documentElement.scrollWidth,viewport:window.innerWidth,
    disabled:document.getElementById('real-run').disabled,
    title:document.querySelector('h1').getBoundingClientRect().width,
    button:document.getElementById('real-run').getBoundingClientRect().width
   }));
   assert.ok(dims.scroll<=dims.viewport+1,JSON.stringify(dims));
   assert.equal(dims.disabled,true);assert.ok(dims.title>100);assert.ok(dims.button>90);
   assert.equal(t.st.edgeActions.length,0);
  }finally{await t.page.close()}
 });
}
