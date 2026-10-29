'use strict';
/* N10-A7.39-P8 hermetic Google PKCE browser tests: zero real OAuth/network. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const {webcrypto}=require('node:crypto');
const DIST='qa/n10a737-preview-dist';
const ORIGIN='https://mmhvault-auth-g10g11-locked.pages.dev';
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co';
const SLOT='mmhv-p8-staging-google-pkce-v1';
const USER='123e4567-e89b-42d3-a456-426614174000';
test.before(()=>cp.execFileSync(process.execPath,['review/N10-A7.39-P8-build-private-google-oauth.cjs'],{timeout:16000}));
function mock({url=ORIGIN+'/staging-google.html',google=true,signupDisabled=true,authUserEmail='haochen05024@gmail.com',probeValid=true,logoutOk=true,stored=null,now=Date.now(),tokenOk=true}={}){
 const calls=[],handlers={},values={},store=new Map(stored?[[SLOT,JSON.stringify(stored)]]:[]);
 const dom=new Map();
 const byId=id=>{
  if(!dom.has(id))dom.set(id,{disabled:false,textContent:'NOT RUN',className:'',dataset:{},addEventListener:(t,fn)=>{handlers[id+':'+t]=fn}});
  return dom.get(id);
 };
 const u=new URL(url);const location={origin:u.origin,pathname:u.pathname,href:u.href,assign:x=>{values.redirect=x;}};
 const history={replaceState:(a,b,c)=>{values.cleaned=c;location.href=c}};
 const sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const fetch=async(url,opt)=>{
  const path=String(url).slice(BASE.length);calls.push({path,method:opt.method,body:opt.body});
  function result(j,ok=true){return{ok,json:async()=>j}}
  if(path==='/auth/v1/settings')return result({external:{google},disable_signup:signupDisabled});
  if(path==='/auth/v1/token?grant_type=pkce')return result(tokenOk?{access_token:'a'.repeat(72)}:{error:'invalid_grant'},tokenOk);
  if(path==='/auth/v1/user')return result({id:USER,email:authUserEmail,email_confirmed_at:'2026-10-27T12:00:00Z',is_anonymous:false,app_metadata:{providers:['google']}});
  if(path==='/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2')return result(probeValid?[{user_id:USER}]:[]);
  if(path==='/auth/v1/logout?scope=local')return result(null,logoutOk);
  throw Error('unapproved_network:'+path);
 };
 const globals={window:{isSecureContext:true,location},location,history,sessionStorage,document:{getElementById:byId},
   fetch,crypto:webcrypto,TextEncoder,btoa,URL,Uint8Array,Date:class extends Date{static now(){return now}},
   console:{log:()=>{throw Error('secret_log_forbidden')}},Promise};
 vm.runInNewContext(fs.readFileSync(DIST+'/assets/staging-google.js','utf8'),globals,{timeout:2500});
 async function settle(){for(let i=0;i<30;i++)await new Promise(done=>setImmediate(done))}
 return{calls,values,store,byId,handlers,settle};
}
test('Google page preserves all prior landing/auth/health bytes',()=>{
 for(const [src,dest] of [
  ['review/n10a737-credential-qa-LOCKED/index.html','index.html'],
  ['review/n10a737-credential-qa-LOCKED/assets/auth-qa.js','assets/auth-qa.js'],
  ['review/n10a739-live-staging-qa/staging-auth.html','staging-auth.html'],
  ['review/n10a739-live-staging-qa/assets/staging-auth.js','assets/staging-auth.js']
 ])assert.deepEqual(fs.readFileSync(DIST+'/'+dest),fs.readFileSync(src));
});
test('CSP Google only allows Staging auth, root denies all connections',()=>{
 const text=fs.readFileSync(DIST+'/_headers','utf8');
 assert.match(text,/\/\*\n  Content-Security-Policy:.*connect-src 'none'/);
 assert.match(text,/\/staging-google\.html\n  ! Content-Security-Policy\n  Content-Security-Policy:.*connect-src https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co/);
 assert.match(text,/frame-ancestors 'none'/);
 assert.match(text,/form-action 'none'/);
 assert.equal((text.match(/\/staging-google\.html\n/g)||[]).length,1);
});
test('no real tokens or signup endpoints in bundle',()=>{
 const js=fs.readFileSync(DIST+'/assets/staging-google.js','utf8');
 assert.match(js,/grant_type=pkce/);
 assert.match(js,/code_challenge_method','s256'/);
 assert.doesNotMatch(js,/localStorage|\/auth\/v1\/signup|service_role|sb_secret_|vrypucmyrztxgiqhjspd/);
 assert.match(js,/history\.replaceState\(null,'',CALLBACK\)/);
 assert.match(js,/sessionStorage\.removeItem\(PKCE_SLOT\)/);
});
test('initial public readiness enables Google only with signups disabled',async()=>{
 const m=mock();await m.settle();assert.equal(m.byId('google-login').disabled,false);
 assert.equal(m.byId('provider').textContent,'ENABLED');assert.equal(m.byId('signup').textContent,'DISABLED');
 assert.deepEqual(m.calls.map(x=>x.path),['/auth/v1/settings']);
});
for(const flags of [{google:false},{signupDisabled:false}]){
 test('provider or signup unsafe fails closed '+JSON.stringify(flags),async()=>{
  const m=mock(flags);await m.settle();assert.equal(m.byId('google-login').disabled,true);
  assert.equal(m.byId('oauth-result').dataset.state,'blocked');
  assert.equal(m.values.redirect,undefined);
 });
}
test('other origin disables OAuth without network',async()=>{
 const m=mock({url:'https://mmhvault.com/staging-google.html'});await m.settle();
 assert.equal(m.calls.length,0);assert.equal(m.byId('google-login').disabled,true);
});
test('direct initial click generates PKCE S256 and exact callback, never stores tokens',async()=>{
 const m=mock();await m.settle();m.handlers['google-login:click']();await m.settle();
 const u=new URL(m.values.redirect);
 assert.equal(u.origin,BASE);assert.equal(u.pathname,'/auth/v1/authorize');
 assert.equal(u.searchParams.get('provider'),'google');
 assert.equal(u.searchParams.get('redirect_to'),ORIGIN+'/staging-google');
 assert.equal(u.searchParams.get('code_challenge_method'),'s256');
 assert.match(u.searchParams.get('code_challenge'),/^[a-zA-Z0-9_-]{43}$/);
 const stored=JSON.parse(m.store.get(SLOT));
 assert.match(stored.verifier,/^[a-zA-Z0-9_-]{43}$/);
 assert.ok(!m.store.has('access_token'));assert.ok(!m.store.has('refresh_token'));
});
test('Google callback with linked existing identity checks UID/RLS and signs out',async()=>{
 const m=mock({url:ORIGIN+'/staging-google.html?code=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456',stored:{verifier:'A'.repeat(43),started:Date.now()}});await m.settle();
 assert.equal(m.values.cleaned,ORIGIN+'/staging-google');
 assert.equal(m.store.has(SLOT),false);
 assert.deepEqual(m.calls.map(x=>x.path),[
  '/auth/v1/token?grant_type=pkce','/auth/v1/user',
  '/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2',
  '/auth/v1/logout?scope=local'
 ]);
 assert.equal(m.byId('oauth-result').dataset.state,'pass');
 assert.equal(m.byId('google-status').textContent,'PASS');
 assert.equal(m.byId('owner-status').textContent,'PASS');
});
for(const bad of [
 {label:'wrong Google email',opts:{authUserEmail:'other@example.com'}},
 {label:'RLS failure',opts:{probeValid:false}},
 {label:'logout failed',opts:{logoutOk:false}},
 {label:'PKCE exchange failed',opts:{tokenOk:false}}
]){
 test(bad.label+' cannot mark PASS',async()=>{
  const m=mock({...bad.opts,url:ORIGIN+'/staging-google.html?code=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456',stored:{verifier:'A'.repeat(43),started:Date.now()}});
  await m.settle();
  assert.equal(m.byId('oauth-result').dataset.state,'blocked');
  assert.notEqual(m.byId('google-status').textContent,'PASS');
  assert.equal(m.store.has(SLOT),false);
 });
}
test('expired verifier rejects code without network',async()=>{
 const m=mock({url:ORIGIN+'/staging-google.html?code=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456',stored:{verifier:'A'.repeat(43),started:Date.now()-600000}});await m.settle();
 assert.equal(m.calls.length,0);assert.equal(m.byId('oauth-result').dataset.state,'blocked');
 assert.equal(m.store.has(SLOT),false);
});
test('injected OAuth code without verifier is rejected before network',async()=>{
 const m=mock({url:ORIGIN+'/staging-google.html?code=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456'});await m.settle();
 assert.equal(m.calls.length,0);assert.equal(m.byId('oauth-result').dataset.state,'blocked');
});
test('failure redirect cleared without network or secret output',async()=>{
 const m=mock({url:ORIGIN+'/staging-google.html?error=access_denied'});await m.settle();
 assert.equal(m.calls.length,0);assert.equal(m.values.cleaned,ORIGIN+'/staging-google.html');
 assert.equal(m.byId('oauth-result').dataset.state,'blocked');
});
