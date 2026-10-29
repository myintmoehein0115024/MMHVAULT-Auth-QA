'use strict';
// N10-A7.17 real closed main Edge source, isolated in Node VM. No real requests.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,createHmac}=require('node:crypto');
const SOURCE=fs.readFileSync(path.join(__dirname,'../edge/N10-A7.17-closed-main-captcha-replay-v11.js'),'utf8');
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co';
const ORIGIN='https://myintmoehein0115024.github.io';
const UID='11111111-1111-4111-8111-111111111111';
const TOKEN='synthetic-token-only-for-staging-mock-11111111111';
const OTHER='synthetic-token-only-for-staging-mock-22222222222';
const SALT='synthetic-N10A717-HMAC-SALT-NOT-REAL-000001122334455';
const mockUser={id:UID,email:'fake.user@example.invalid',email_confirmed_at:'2026-10-01T00:00:00Z',is_anonymous:false};
function fixture({active=false,captcha=true,captchaAction='auto',captchaHostname='myintmoehein0115024.github.io',dbError=false,badPassword=false,seedKeys=[]}={}){
 let source=SOURCE,handler=null;
 assert.match(source,/const CODE_GATE_OPEN = false/);
 assert.match(source,/1970-01-01T00:00:00\.000Z/);
 if(active){
   // Code switch is patched ONLY in isolated Node VM memory.
   const start=new Date(Date.now()-60000).toISOString();
   const end=new Date(Date.now()+7*60*1000).toISOString();
   source=source.replace('const CODE_GATE_OPEN = false','const CODE_GATE_OPEN = true')
   .replace("const WINDOW_START_UTC = '1970-01-01T00:00:00.000Z'","const WINDOW_START_UTC = '"+start+"'")
   .replace("const WINDOW_END_UTC = '1970-01-01T00:00:00.000Z'","const WINDOW_END_UTC = '"+end+"'");
 }
 const bucketHits=new Map(seedKeys.map(x=>[x,1])),requests=[],captchaCalls=[];
 const env={
   SUPABASE_URL:BASE,
   SUPABASE_ANON_KEY:'fake-anon-key-not-real-0123456789012345678',
   SUPABASE_SERVICE_ROLE_KEY:'fake-admin-key-not-real-0123456789012345678',
   N10A6_TURNSTILE_SECRET:'fake-cloudflare-secret-not-real',
   N10A6_RATE_HMAC_KEY:SALT,
   N10A6_STAGING_ENABLED:'true'
 };
 async function fetch(url,options={}){
   const u=String(url),requestBody=String(options.body||'');
   requests.push({url:u,body:requestBody});
   const res=(v,status=200)=>new Response(JSON.stringify(v),{status});
   if(u.includes('challenges.cloudflare.com/turnstile/v0/siteverify')){
     const params=new URLSearchParams(options.body);
     const t=params.get('response');captchaCalls.push(t);
     return res({success:captcha,hostname:captchaHostname,action:captchaAction==='auto'?'mmh_n10a6_login':captchaAction});
   }
   if(u.includes('/rest/v1/rpc/mmh_n10a6_take_attempt')){
     if(dbError)return res({message:'database down'},500);
     const data=JSON.parse(requestBody);
     assert.match(data.p_key,/^[0-9a-f]{64}$/);
     assert.ok(!data.p_key.includes(TOKEN));
     const n=bucketHits.get(data.p_key)||0;
     if(n>=data.p_limit)return res(false);
     bucketHits.set(data.p_key,n+1);
     return res(true);
   }
   if(u.includes('/rest/v1/mmh_n10a6_username_links'))return res([{user_id:UID}]);
   if(u.includes('/auth/v1/admin/users/'))return res(mockUser);
   if(u.includes('/auth/v1/token?grant_type=password'))
     return badPassword?res({message:'invalid credentials'},400):res({access_token:'synthetic-access-only',refresh_token:'synthetic-refresh-only',expires_in:3600});
   if(u.endsWith('/auth/v1/user'))return res(mockUser);
   if(u.includes('/rest/v1/mmh_n10a6_auth_owner_probe'))return res([{user_id:UID}]);
   if(u.includes('/rest/v1/rpc/mmh_n10a6_claim_username'))return res(true);
   if(u.includes('/auth/v1/logout'))return new Response(null,{status:204});
   throw Error('Unmocked request '+u);
 }
 vm.runInNewContext(source,{
   Deno:{env:{get:k=>env[k]},serve:h=>{handler=h}},
   Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,crypto:webcrypto,fetch,console
 },{filename:'closed-staging-v11.js',timeout:1500});
 assert.equal(typeof handler,'function');
 function post({action='login',username='qa_alpha',password='not-a-real-password',captcha_token=TOKEN}={},headers={}){
   return handler(new Request(BASE+'/functions/v1/mmh-n10a6-username',{method:'POST',
     headers:{Origin:ORIGIN,'Content-Type':'application/json',...headers},
     body:JSON.stringify({action,username,password,captcha_token})
   }));
 }
 return {post,bucketHits,requests,captchaCalls};
}
async function result(r){return {status:r.status,...await r.json()}}
const oneTimeKey=token=>createHmac('sha256',SALT).update('n10a15-token-single-use:'+token).digest('hex');

test('deployed main source hard-closed, two expired timestamps, shared QA replay HMAC namespace',()=>{
 assert.match(SOURCE,/const CODE_GATE_OPEN = false/);
 assert.equal((SOURCE.match(/'1970-01-01T00:00:00\.000Z'/g)||[]).length,2);
 assert.match(SOURCE,/n10a15-token-single-use:/);
 assert.match(SOURCE,/p_limit:1,p_window_seconds:600/);
 assert.ok(SOURCE.indexOf('if(!await captcha(')<SOURCE.indexOf('if(!await claimSingleUseCaptcha('));
 assert.ok(SOURCE.indexOf('if(!await claimSingleUseCaptcha(')<SOURCE.indexOf("if(!await quota(data.action+':username:'"));
 assert.ok(!SOURCE.includes("quota('global:"));
});
test('real closed main denies login and bind with ZERO network calls',async()=>{
 const f=fixture();
 for(const action of ['login','bind']){
   const r=await result(await f.post({action}));
   assert.equal(r.status,503);assert.equal(r.code,'n10a6_disabled');
 }
 assert.equal(f.requests.length,0);
});
test('synthetic valid first login PASS then same token rejected BEFORE username lookup/password exchange',async()=>{
 const f=fixture({active:true});
 const a=await result(await f.post());
 const before=f.requests.filter(x=>x.url.includes('/auth/v1/token')).length;
 const b=await result(await f.post());
 const after=f.requests.filter(x=>x.url.includes('/auth/v1/token')).length;
 assert.equal(a.status,200);assert.equal(a.code,'login_success');
 assert.equal(b.status,403);assert.equal(b.code,'verification_required');
 assert.equal(before,1);assert.equal(after,1);
 assert.equal(f.bucketHits.get(oneTimeKey(TOKEN)),1);
});
test('concurrent synthetic requests can issue only ONE password session',async()=>{
 const f=fixture({active:true});
 const results=await Promise.all([f.post(),f.post()]);
 const states=await Promise.all(results.map(result));
 assert.deepEqual(states.map(x=>x.status).sort(),[200,403]);
 assert.equal(f.requests.filter(x=>x.url.includes('/auth/v1/token')).length,1);
});
test('cross-route replay: token redeemed by N10-A7.16 QA is rejected by main v11',async()=>{
 const f=fixture({active:true,seedKeys:[oneTimeKey(TOKEN)]});
 const response=await result(await f.post());
 assert.equal(response.status,403);
 assert.equal(f.requests.filter(x=>x.url.includes('/auth/v1/token')).length,0);
});
test('fresh independent token accepted despite previously used first token',async()=>{
 const f=fixture({active:true});
 assert.equal((await result(await f.post())).status,200);
 assert.equal((await result(await f.post({captcha_token:OTHER}))).status,200);
 assert.equal(f.bucketHits.get(oneTimeKey(TOKEN)),1);
 assert.equal(f.bucketHits.get(oneTimeKey(OTHER)),1);
});
test('CAPTCHA failure never creates DB bucket or tries password grant',async()=>{
 const f=fixture({active:true,captcha:false});
 const r=await result(await f.post());
 assert.equal(r.status,403);assert.equal(r.code,'verification_required');
 assert.equal(f.bucketHits.size,0);
 assert.equal(f.requests.length,1);
});
test('CAPTCHA action mismatch never touches DB',async()=>{
 const f=fixture({active:true,captchaAction:'mmh_n10a6_bind'});
 const r=await result(await f.post());
 assert.equal(r.status,403);assert.equal(f.bucketHits.size,0);
});
test('CAPTCHA hostname mismatch never touches DB',async()=>{
 const f=fixture({active:true,captchaHostname:'invalid.example'});
 const r=await result(await f.post());
 assert.equal(r.status,403);assert.equal(f.bucketHits.size,0);
});
test('single-use RPC outage fails closed without login session',async()=>{
 const f=fixture({active:true,dbError:true});
 const r=await result(await f.post());
 assert.equal(r.status,503);assert.equal(r.code,'auth_service_unavailable');
 assert.equal(f.requests.filter(x=>x.url.includes('/auth/v1/token')).length,0);
});
test('bind action with matching CAPTCHA uses same cross-route bucket and returns success',async()=>{
 const f=fixture({active:true,captchaAction:'mmh_n10a6_bind'});
 const r=await result(await f.post({action:'bind'}, {Authorization:'Bearer synthetic-access-only'}));
 assert.equal(r.status,200);assert.equal(r.code,'bind_success');
 assert.equal(f.bucketHits.get(oneTimeKey(TOKEN)),1);
});
test('wrong password returns no session despite CAPTCHA accepted',async()=>{
 const f=fixture({active:true,badPassword:true});
 const r=await result(await f.post());
 assert.equal(r.status,401);assert.equal(r.code,'invalid_credentials');
 assert.ok(!r.access_token);assert.ok(!r.refresh_token);
});
