'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const SRC=fs.readFileSync(path.join(__dirname,'../integration/N10-A7.18-username-handoff-PREVIEW-ONLY.cjs'),'utf8');
const REF='ldivswlhtgmznzwhzsoi',BASE='https://'+REF+'.supabase.co',ENDPOINT=BASE+'/functions/v1/mmh-n10a6-username';
const USER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const captcha='synthetic-only-token-not-from-cloudflare';
const login={username:'qa_alpha',password:'synthetic-password-not-real',captchaToken:captcha};
function impl(active){
  const src=active?SRC.replace('const MMH_USERNAME_HANDOFF_LIVE=false','const MMH_USERNAME_HANDOFF_LIVE=true'):SRC;
  const sandbox={module:{exports:{}},URL};
  vm.runInNewContext(src,sandbox,{filename:'preview-only.js',timeout:1800});
  return sandbox.module.exports.usernameHandoffPreview;
}
function fixture({enabled=true,wrongRemote=false,wrongLocal=false,invalidSession=false,networkFailure=false,omitTokens=false}={}){
 const calls=[],clients=[];
 const client={auth:{
   async setSession({access_token,refresh_token}){calls.push('setSession');return invalidSession?{error:new Error('invalid')}:{data:{user:{id:USER}}}},
   async getUser(){calls.push('getUser');return {data:{user:{id:wrongRemote?OTHER:USER}}}},
   async getSession(){calls.push('getSession');return {data:{session:{user:{id:wrongLocal?OTHER:USER}}}}},
   async signOut(options){calls.push({signout:options})}
 }};
 const transport=async(_url,options)=>{
   calls.push({request:JSON.parse(options.body),credentials:options.credentials});
   if(networkFailure)throw Error('network');
   const body=JSON.parse(options.body);
   if(body.action==='preflight')return {status:200,async json(){return {enabled,registration_enabled:false}}};
   if(body.action==='login')return {status:200,async json(){return omitTokens?{code:'login_success'}:{
     code:'login_success',access_token:'fake-test-access-token-00000000',refresh_token:'fake-test-refresh-token-00000000'}}};
   throw Error('unexpected call');
 };
 return {client,transport,calls};
}
function params(f,overrides={}){
 return {client:f.client,supabaseUrl:BASE,endpoint:ENDPOINT,expectedProjectRef:REF,...login,transport:f.transport,...overrides};
}
test('QA source is inert by default: never touches network or Supabase',async()=>{
 assert.ok(SRC.includes('const MMH_USERNAME_HANDOFF_LIVE=false'));
 const f=fixture();
 const x=await impl(false)(params(f));
 assert.equal(x.code,'preview_disabled');assert.equal(f.calls.length,0);
});
test('correct mocked login checks preflight, setSession, remote UID and local UID (no navigation)',async()=>{
 const f=fixture();
 const x=await impl(true)(params(f));
 assert.equal(x.ok,true);assert.equal(x.uid,USER);
 assert.deepEqual(f.calls.filter(x=>typeof x==='string'),['setSession','getUser','getSession']);
 assert.equal(f.calls.filter(x=>x?.request).length,2);
 assert.ok(!f.calls.some(x=>x.signout));
});
test('production client pointed at Staging edge is rejected before network',async()=>{
 const f=fixture();
 const x=await impl(true)(params(f,{supabaseUrl:'https://vrypucmyrztxgiqhjspd.supabase.co',expectedProjectRef:'vrypucmyrztxgiqhjspd'}));
 assert.equal(x.code,'endpoint_mismatch');assert.equal(f.calls.length,0);
});
test('staging project URL and explicitly expected ref must match',async()=>{
 const f=fixture();
 const x=await impl(true)(params(f,{expectedProjectRef:'vrypucmyrztxgiqhjspd'}));
 assert.equal(x.code,'project_mismatch');assert.equal(f.calls.length,0);
});
test('closed backend stops before sending passwords',async()=>{
 const f=fixture({enabled:false});
 const x=await impl(true)(params(f));
 assert.equal(x.code,'backend_disabled');
 assert.equal(f.calls.filter(x=>x?.request).length,1);
 assert.equal(f.calls[0].request.action,'preflight');
});
test('remote UID mismatch rejects and signs out only local newly-installed session',async()=>{
 const f=fixture({wrongRemote:true});
 const x=await impl(true)(params(f));
 assert.equal(x.code,'uid_verification_failed');
 assert.equal(f.calls.filter(x=>x?.signout).length,1);
 assert.equal(f.calls.find(x=>x?.signout).signout.scope,'local');
});
test('local cached UID mismatch rejects even with good server UID',async()=>{
 const f=fixture({wrongLocal:true});
 const x=await impl(true)(params(f));
 assert.equal(x.code,'uid_verification_failed');
 assert.equal(f.calls.filter(x=>x?.signout).length,1);
});
test('failed setSession does not leave a new auth session',async()=>{
 const f=fixture({invalidSession:true});
 const x=await impl(true)(params(f));
 assert.equal(x.code,'invalid_session');
 assert.equal(f.calls.filter(x=>x?.signout).length,1);
});
test('network failure fails closed without calling session setter',async()=>{
 const f=fixture({networkFailure:true});
 const x=await impl(true)(params(f));
 assert.equal(x.code,'authentication_unavailable');
 assert.equal(f.calls.includes('setSession'),false);
});
test('malformed backend session fails closed without storing anything',async()=>{
 const f=fixture({omitTokens:true});
 const x=await impl(true)(params(f));
 assert.equal(x.code,'malformed_session');
 assert.equal(f.calls.includes('setSession'),false);
});
test('username input validation rejects unsupported chars and absent CAPTCHA',async()=>{
 for(const bad of [{username:'AA'},{username:'qa@alpha'},{captchaToken:'short'}]){
  const f=fixture();
  const x=await impl(true)(params(f,bad));
  assert.equal(x.code,'invalid_input');assert.equal(f.calls.length,0);
 }
});
test('preview never redirects, creates an auth user, or logs tokens',()=>{
 assert.equal(SRC.includes('location.replace'),false);
 assert.equal(SRC.includes('signUp('),false);
 assert.equal(SRC.includes('console.log'),false);
 assert.equal(SRC.includes('SERVICE_ROLE_KEY'),false);
});
