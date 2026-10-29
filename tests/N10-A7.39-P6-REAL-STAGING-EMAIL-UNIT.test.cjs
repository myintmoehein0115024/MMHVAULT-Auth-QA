'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root='qa/n10a737-preview-dist';
const source='review/n10a739-live-staging-qa';
const QA='https://mmhvault-auth-g10g11-locked.pages.dev',STAGE='https://ldivswlhtgmznzwhzsoi.supabase.co';
const uid='e61d7c7c-3625-47f2-810c-9c8c5b2b8d7e';
const fakeUser={id:uid,email_confirmed_at:'2026-10-20T00:00:00Z',is_anonymous:false};
test.before(()=>cp.execFileSync(process.execPath,['review/N10-A7.39-P6-build-staging-auth-ACCESS-ONLY.cjs'],{timeout:15000}));
test('root auth remains fully locked, not even CSS changed',()=>{
 for(const f of ['index.html','assets/auth-qa.js','assets/auth-qa.css']){
  assert.deepEqual(fs.readFileSync(path.join(root,f)),fs.readFileSync(path.join('review/n10a737-credential-qa-LOCKED',f)));
 }
 const js=fs.readFileSync(path.join(root,'assets/auth-qa.js'),'utf8');
 assert.match(js,/REAL_AUTH_ENABLED=false/);
});
test('new QA form only allows exact Staging APIs; no production, refresh persistence, registration, admin calls',()=>{
 const js=fs.readFileSync(path.join(root,'assets/staging-auth.js'),'utf8');
 assert.match(js,/const ORIGIN='https:\/\/mmhvault-auth-g10g11-locked\.pages\.dev'/);
 assert.match(js,/const BASE='https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co'/);
 assert.match(js,/const TURNSTILE_SITEKEY='0x4AAAAAAFq1yWQ26zasvyxh'/);
 assert.match(js,/pathAllowed\(path\)/);
 assert.match(js,/function signOutLocal\(token\)/);
 assert.match(js,/credentials:'omit'/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|persistSession|refresh_token[^\n]*localStorage|\/auth\/v1\/signup|service_role|sb_secret_|vrypucmyrztxgiqhjspd/);
});
test('CSP exact Staging Auth route, root still connect-src none and no duplicate leak',()=>{
 const c=fs.readFileSync(path.join(root,'_headers'),'utf8');
 assert.match(c,/\/\*\n  Content-Security-Policy:.*connect-src 'none'/);
 for(const route of ['/staging-auth','/staging-auth.html'])
  assert.ok(c.includes(route+'\n  ! Content-Security-Policy\n  Content-Security-Policy: '));
 assert.match(c,/script-src 'self' https:\/\/challenges\.cloudflare\.com/);
 assert.match(c,/connect-src https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co https:\/\/challenges\.cloudflare\.com/);
 assert.match(c,/form-action 'none'/);
 assert.match(c,/frame-ancestors 'none'/);
});
function fakeApp({origin=QA,credentialsOK=true,probeOK=true,logoutOK=true,preflightEnabled=false}={}){
 const calls=[],handlers={},inputs={email:'qa@example.test',password:'FAKE_PASSWORD_FOR_UNIT_TEST',
  username:'testuser', 'username-password':'FAKE_PASSWORD_FOR_UNIT_TEST'};
 const elements={};
 function el(id){if(!elements[id]){
  elements[id]={value:inputs[id]||'',textContent:'',disabled:false,dataset:{},className:'',
   hidden:false,addEventListener:(type,fn)=>{handlers[id+':'+type]=fn},
   classList:{toggle:()=>{}},};
 }return elements[id]}
 let fetchNext=async(url,options)=>{
  const path=String(url).slice(STAGE.length);
  calls.push({path,method:options.method,credentials:options.credentials,body:options.body});
  function json(v,ok=true){return {ok,json:async()=>v}}
  if(path==='/auth/v1/token?grant_type=password')
   return json(credentialsOK?{access_token:'A'.repeat(60),refresh_token:'R'.repeat(60)}:{code:'invalid_credentials'},credentialsOK);
  if(path==='/auth/v1/user')return json(fakeUser);
  if(path==='/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2')return json(probeOK?[{user_id:uid}]:[]);
  if(path==='/auth/v1/logout?scope=local')return json(null,logoutOK);
  if(path==='/functions/v1/mmh-n10a6-username')return json({code:'preflight_ok',enabled:preflightEnabled,registration_enabled:false,scope:'isolated_staging_only'});
  throw Error('unapproved_fetch_path:'+path);
 };
 const mockDocument={getElementById:el,createElement:()=>({}),head:{appendChild:()=>{throw Error('widget_forbidden')}}};
 const globals={location:{origin},window:{isSecureContext:true,addEventListener:()=>{}},
  document:mockDocument,fetch:fetchNext,AbortController,Promise,
  setTimeout:()=>2,clearTimeout:()=>{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/staging-auth.js'),'utf8'),globals,{timeout:3000});
 async function submit(form){const fn=handlers[form+':submit'];assert.equal(typeof fn,'function');fn({preventDefault(){}});
  for(let i=0;i<25;i++)await new Promise(resolve=>setImmediate(resolve));
 }
 return{calls,elements,handlers,submit};
}
test('no credential or network activity on page load',()=>{
 const s=fakeApp();assert.equal(s.calls.length,0);assert.equal(s.elements['email-submit'].disabled,false);
});
test('real Staging email login mock fetch proves remote UID owner and local logout',async()=>{
 const s=fakeApp();await s.submit('email-form');
 assert.deepEqual(s.calls.map(x=>x.path),[
 '/auth/v1/token?grant_type=password','/auth/v1/user',
 '/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2',
 '/auth/v1/logout?scope=local']);
 assert.ok(s.calls.every(x=>x.credentials==='omit'));
 assert.equal(s.elements['email-check'].textContent,'PASS');
 assert.equal(s.elements['result'].dataset.state,'pass');
 assert.equal(s.elements['password'].value,'');
});
test('failed email password never passes and never triggers owner probe',async()=>{
 const s=fakeApp({credentialsOK:false});await s.submit('email-form');
 assert.equal(s.calls.length,1);
 assert.equal(s.elements['result'].dataset.state,'blocked');
 assert.equal(s.elements['password'].value,'');
});
test('RLS mismatch fails and still attempts local sign-out',async()=>{
 const s=fakeApp({probeOK:false});await s.submit('email-form');
 assert.equal(s.calls.at(-1).path,'/auth/v1/logout?scope=local');
 assert.equal(s.elements['result'].dataset.state,'blocked');
 assert.notEqual(s.elements['email-check'].textContent,'PASS');
});
test('local sign-out failure prevents false PASS',async()=>{
 const s=fakeApp({logoutOK:false});await s.submit('email-form');
 assert.equal(s.elements['result'].dataset.state,'blocked');
 assert.notEqual(s.elements['email-check'].textContent,'PASS');
});
test('username when server closed sends preflight only, never password or Turnstile',async()=>{
 const s=fakeApp();await s.submit('username-form');
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].path,'/functions/v1/mmh-n10a6-username');
 assert.equal(s.calls[0].body,'{"action":"preflight"}');
 assert.equal(s.elements['username-password'].value,'');
 assert.equal(s.elements['result'].dataset.state,'blocked');
});
test('wrong browser hostname cannot access Staging',()=>{
 const s=fakeApp({origin:'https://mmhvault.com'});assert.equal(s.calls.length,0);
 assert.equal(s.elements['email-submit'].disabled,true);
});
test('G10/G11 unrelated features are still explicitly NOT RUN',()=>{
 const html=fs.readFileSync(path.join(root,'staging-auth.html'),'utf8');
 assert.match(html,/<button type="button" id="tab-google" disabled>/);
 assert.match(html,/Google OAuth<\/span><strong>NOT RUN<\/strong>/);
 assert.match(html,/注册 \/ 密码重置<\/span><strong>NOT RUN<\/strong>/);
 assert.doesNotMatch(html,/<input[^>]+type="hidden"[^>]+value="[^"]*password"/);
});
