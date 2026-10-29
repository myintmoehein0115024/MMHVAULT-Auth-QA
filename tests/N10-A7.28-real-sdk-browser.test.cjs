'use strict';
/*
 * N10-A7.28 Chromium + real @supabase/supabase-js. Entirely synthetic HTTP,
 * including browser HTML and SDK calls; never touches actual GitHub Pages or Supabase.
 * Builds VM-only unlocked N10-A7.27 source to ephemeral in-memory JS bundle.
 * No unlocked bundle is committed/deployed.
 */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const pkgRequire=createRequire(path.resolve('qa/n10-a728-real-sdk/package.json'));
const esbuild=pkgRequire('esbuild'),{chromium}=pkgRequire('playwright-core');
const ROOT=path.resolve('qa/n10-a728-real-sdk');
const SOURCE=fs.readFileSync('integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs','utf8');
const ORIGIN='https://myintmoehein0115024.github.io';
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co';
const EDGE=BASE+'/functions/v1/mmh-n10a6-username';
const PAGE=ORIGIN+'/MMHVAULT-Auth-QA/n10a728-ephemeral-SYNTHETIC';
const JS=ORIGIN+'/MMHVAULT-Auth-QA/n10a728-synthetic-bundle.js';
const UID='11111111-1111-4111-8111-111111111111';
const email='synthetic-browser@example.invalid',password='not-a-real-password';
const base64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const access=[base64({alg:'HS256',typ:'JWT'}),base64({sub:UID,role:'authenticated',
 aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)-60}),
 Buffer.from('synthetic-only').toString('base64url')].join('.');
const refresh='synthetic-refresh-token-for-browser-tests-123456';
let browser,bundle,context;
const requests=[];
function syntheticResponse(route,body,status=200){
 return route.fulfill({status,contentType:'application/json',
  headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info',
   'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Cache-Control':'no-store'},
  body:JSON.stringify(body)});
}
async function routing(route){
 const r=route.request(),u=new URL(r.url());
 requests.push({url:r.url(),method:r.method(),hasBody:!!r.postData()});
 if(r.url()===PAGE)return route.fulfill({status:200,contentType:'text/html',body:
  '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; connect-src '+BASE+'; base-uri \'none\'; object-src \'none\'; form-action \'none\'"></head><body><script src="/MMHVAULT-Auth-QA/n10a728-synthetic-bundle.js"></script></body></html>'});
 if(r.url()===JS)return route.fulfill({status:200,contentType:'text/javascript',body:bundle});
 if(u.origin===BASE){
  if(r.method()==='OPTIONS')return route.fulfill({status:204,
   headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Max-Age':'120'}});
  if(u.pathname==='/auth/v1/token' && u.searchParams.get('grant_type')==='password')
   return syntheticResponse(route,{access_token:access,refresh_token:refresh,token_type:'bearer',
    expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{
     id:UID,email,email_confirmed_at:'2026-10-29T00:00:00.000Z',
     app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',role:'authenticated',
     created_at:'2026-10-29T00:00:00.000Z'}});
  if(u.pathname==='/auth/v1/user' && r.method()==='GET')
   return syntheticResponse(route,{user:{id:UID,email,email_confirmed_at:'2026-10-29T00:00:00.000Z',
    app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',role:'authenticated',
    created_at:'2026-10-29T00:00:00.000Z'}});
  if(u.pathname==='/auth/v1/logout' && r.method()==='POST')
   return syntheticResponse(route,{});
  if(u.pathname==='/rest/v1/mmh_n10a6_auth_owner_probe' && r.method()==='GET')
   return syntheticResponse(route,[{user_id:UID}]);
 }
 throw Error('UNMOCKED_NETWORK_REQUEST: '+u.origin+u.pathname);
}
async function syntheticTab(){
 const p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const r=await p.goto(PAGE,{waitUntil:'load',timeout:25000});
 assert.equal(r.status(),200);
 await p.waitForFunction(()=>!!window.__qa728);
 return {p,errors};
}
test.before(async()=>{
 assert.ok(SOURCE.includes('const STAGING_SDK_BOOTSTRAP_ENABLED=false'));
 const unlocked=SOURCE.replace('const STAGING_SDK_BOOTSTRAP_ENABLED=false',
  'const STAGING_SDK_BOOTSTRAP_ENABLED=true');
 const source=[
  "const {createClient}=require('@supabase/supabase-js');",
  'const mod={exports:{}};',
  '(function(module){',unlocked,'})(mod);',
  'const bridge=mod.exports;',
  "const cfg={project:'ldivswlhtgmznzwhzsoi',base:'"+BASE+"',endpoint:'"+EDGE+
    "',origin:'"+ORIGIN+"',publishableKey:'sb_publishable_SYNTHETIC_BROWSER_TEST_123456789'};",
  'window.__qa728={',
  ' start(origin=location.origin){return bridge.createIsolatedStagingSdk({cfg,origin,createClient,fetcher:fetch.bind(globalThis),randomUUID:crypto.randomUUID.bind(crypto)})},',
  ' clientVersion:"2.118.0"',
  '};'
 ].join('\n');
 const out=await esbuild.build({stdin:{contents:source,resolveDir:ROOT,sourcefile:'browser-synthetic-only.js'},
  bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'});
 bundle=out.outputFiles[0].text;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
 await context.route('**/*',routing);
});
test.after(async()=>{await context?.close();await browser?.close()});
test('browser initial render loads bundled actual SDK without authenticating or persisting',async()=>{
 requests.length=0;
 const {p,errors}=await syntheticTab();
 try{
  const x=await p.evaluate(()=>({
   version:window.__qa728.clientVersion,
   sessionKeys:sessionStorage.length,localKeys:localStorage.length,cookie:document.cookie
  }));
  assert.equal(x.version,'2.118.0');assert.equal(x.sessionKeys,0);assert.equal(x.localKeys,0);
  assert.equal(x.cookie,'');
  assert.equal(requests.filter(x=>x.url.startsWith(BASE)).length,0);
  assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
test('real browser SDK synthetic email authentication is single-tab only and leaves no storage',async()=>{
 requests.length=0;
 const {p:a,errors:errA}=await syntheticTab();
 const {p:b,errors:errB}=await syntheticTab();
 try{
  const one=await a.evaluate(async(input)=>{
   window.b=window.__qa728.start();
   if(!window.b.enabled)return {error:'bridge_failed',code:window.b.code};
   const r=await window.b.client.auth.signInWithPassword(input);
   const s=await window.b.client.auth.getSession();
   const u=await window.b.client.auth.getUser();
   const probe=await window.b.client.from('mmh_n10a6_auth_owner_probe').select('user_id').limit(2);
   return {loginError:r.error?.message||null,uid:u.data?.user?.id,
    sessionUid:s.data?.session?.user?.id,owner:probe.data?.[0]?.user_id,
    storage:localStorage.length+sessionStorage.length,cookie:document.cookie};
  },{email,password});
  assert.equal(one.error,undefined,JSON.stringify(one));
  assert.equal(one.loginError,null);
  assert.equal(one.uid,UID);assert.equal(one.sessionUid,UID);assert.equal(one.owner,UID);
  assert.equal(one.storage,0);assert.equal(one.cookie,'');
  const two=await b.evaluate(async()=>{
   window.b=window.__qa728.start();
   const s=await window.b.client.auth.getSession();
   return {enabled:window.b.enabled,session:s.data?.session||null,storage:localStorage.length+sessionStorage.length,cookie:document.cookie};
  });
  assert.equal(two.enabled,true);assert.equal(two.session,null);
  assert.equal(two.storage,0);assert.equal(two.cookie,'');
  const closeOne=await a.evaluate(async()=>window.b.close());
  assert.equal(closeOne.ok,true,'first tab cleanup: '+closeOne.code);
  assert.equal((await b.evaluate(async()=>window.b.close())).ok,true);
  assert.deepEqual(errA,[]);assert.deepEqual(errB,[]);
 }finally{await a.close();await b.close()}
});
test('SDK does not process injected OAuth tokens from page URL',async()=>{
 const {p,errors}=await syntheticTab();
 try{
  const result=await p.evaluate(async()=>{
   history.replaceState({},'',location.pathname+'#access_token=synthetic&refresh_token=synthetic');
   const b=window.__qa728.start();
   const s=await b.client.auth.getSession();
   const close=await b.close();
   return {enabled:b.enabled,session:s.data?.session||null,closed:close.ok,
    storage:localStorage.length+sessionStorage.length};
  });
  assert.equal(result.enabled,true);assert.equal(result.session,null);
  assert.equal(result.closed,true);assert.equal(result.storage,0);
  assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
test('browser SDK synthetic setSession validates UID and cleans after logout',async()=>{
 const {p,errors}=await syntheticTab();
 try{
  const result=await p.evaluate(async({access,refresh})=>{
   const b=window.__qa728.start();
   const r=await b.client.auth.setSession({access_token:access,refresh_token:refresh});
   const u=await b.client.auth.getUser();
   const close=await b.close();
   return {enabled:b.enabled,error:r.error?.message||null,uid:u.data?.user?.id,
    close:close.code,storage:localStorage.length+sessionStorage.length};
  },{access,refresh});
  assert.equal(result.enabled,true);
  assert.equal(result.error,null);assert.equal(result.uid,UID);
  assert.equal(result.close,'local_session_cleared');assert.equal(result.storage,0);
  assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
test('domain migration cannot bypass fixed Staging-only origin lock',async()=>{
 const {p,errors}=await syntheticTab();
 try{
  const result=await p.evaluate(()=>{
   const x=window.__qa728.start('https://mmhvault.com');
   const y=window.__qa728.start('https://www.mmhvault.com');
   return {one:x.code,two:y.code,keys:localStorage.length+sessionStorage.length};
  });
  assert.equal(result.one,'wrong_project_or_dependencies');
  assert.equal(result.two,'wrong_project_or_dependencies');assert.equal(result.keys,0);
  assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
