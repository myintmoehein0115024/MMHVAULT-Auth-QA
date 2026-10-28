'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const SOURCE=fs.readFileSync(path.join(__dirname,'../edge/N10-A7.16-staging-siteverify-replay-hardened.ts'),'utf8');
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co';
const TOKEN='synthetic-not-real-cloudflare-token-ABC-0987654321';
const OTHER='synthetic-not-real-cloudflare-token-XYZ-1234567890';
const UID='11111111-1111-4111-8111-111111111111';
function mock({upstreamAlwaysSuccess=true,tokenBucketError=false,userAuthorized=true}={}){
 const keyHits=new Map(),calls=[],seenRaw=[],env={
 SUPABASE_URL:BASE,
 SUPABASE_ANON_KEY:'synthetic-public-key-for-N10A716-000000',
 SUPABASE_SERVICE_ROLE_KEY:'synthetic-admin-key-for-N10A716-000000',
 N10A6_TURNSTILE_SECRET:'synthetic-cloudflare-secret-00000',
 N10A6_RATE_HMAC_KEY:'synthetic-HMAC-secret-not-real-00000000000000000000000'
 };
 let handler;
 const mk=(body,status=200)=>new Response(JSON.stringify(body),{status});
 async function fetch(url,opts={}){
  const u=String(url);
  calls.push({url:u,body:String(opts.body||'')});
  if(u.includes('/auth/v1/user')){
   return userAuthorized?mk({id:UID,email:'synthetic@example.invalid',email_confirmed_at:'2026-10-01T00:00:00Z',is_anonymous:false}):mk({error:'unauthorized'},401);
  }
  if(u.includes('mmh_n10a6_auth_owner_probe'))return mk([{user_id:UID}]);
  if(u.includes('/rpc/mmh_n10a6_take_attempt')){
   const data=JSON.parse(opts.body);
   assert.match(data.p_key,/^[0-9a-f]{64}$/);
   assert.ok(!data.p_key.includes(TOKEN));
   if(data.p_limit===6){assert.equal(data.p_window_seconds,3600);return mk(true)}
   if(data.p_limit===1){
    assert.equal(data.p_window_seconds,600);
    if(tokenBucketError)return mk({error:'failure'},500);
    const n=keyHits.get(data.p_key)||0;
    keyHits.set(data.p_key,n+1);
    return mk(n===0);
   }
   throw Error('Unexpected limit '+data.p_limit);
  }
  if(u.includes('turnstile/v0/siteverify')){
    const data=new URLSearchParams(opts.body);
    seenRaw.push(data.get('response'));
    return mk({success:upstreamAlwaysSuccess,hostname:'myintmoehein0115024.github.io',action:'mmh_n10a6_login'});
  }
  throw Error('Unexpected outgoing URL: '+u);
 }
 class FakeDate extends Date{static now(){return Date.parse('2026-10-29T08:00:00Z')}}
 const context={Deno:{env:{get:k=>env[k]},serve:x=>handler=x},Request,Response,Headers,
 URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,crypto:webcrypto,
 fetch,console,Date:FakeDate};
 vm.runInNewContext(SOURCE,context,{filename:'staging-replay-guard.ts',timeout:2000});
 assert.equal(typeof handler,'function');
 const request=(token=TOKEN,expected='mmh_n10a6_login')=>handler(new Request(BASE+'/functions/v1/mmh-n10a15-siteverify-qa',{
 method:'POST',
 headers:{Origin:'https://myintmoehein0115024.github.io',Authorization:'Bearer mock-test-only', 'Content-Type':'application/json'},
 body:JSON.stringify({action:'verify',expected_action:expected,captcha_token:token})
 }));
 return {request,calls,seenRaw,keyHits};
}
async function decode(r){return {status:r.status,...await r.json()}}
test('code and deployment safety invariants: staging-only, JWT owner, expires, no login',()=>{
 assert.match(SOURCE,/const DEADLINE='2026-10-30T17:00:00.000Z'/);
 assert.match(SOURCE,/isExistingQaOwner\(auth\[1\],identity\.id\)/);
 assert.ok(!SOURCE.includes('mmh_n10a6_claim_username'));
 assert.ok(!SOURCE.includes('/auth/v1/token?grant_type=password'));
 assert.ok(SOURCE.indexOf('claimOneTimeToken(captcha_token)')<SOURCE.indexOf('siteverify(captcha_token,expected_action)'));
});
test('first response PASS, second same token denied before Cloudflare even if upstream would PASS twice',async()=>{
 const x=mock();
 const a=await decode(await x.request(TOKEN));
 const b=await decode(await x.request(TOKEN));
 assert.deepEqual([a.status,a.code,b.status,b.code],[200,'siteverify_pass',403,'token_replayed']);
 assert.deepEqual(x.seenRaw,[TOKEN]);
 assert.equal(Array.from(x.keyHits.values())[0],2);
});
test('distinct new tokens can each validate once',async()=>{
 const x=mock();
 const a=await decode(await x.request(TOKEN));
 const b=await decode(await x.request(OTHER));
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.deepEqual(x.seenRaw,[TOKEN,OTHER]);
 assert.equal(x.keyHits.size,2);
});
test('same token concurrency yields exactly one successful 200',async()=>{
 const x=mock();
 const responses=await Promise.all([x.request(TOKEN),x.request(TOKEN)]);
 const codes=await Promise.all(responses.map(decode));
 assert.deepEqual(codes.map(x=>x.status).sort(),[200,403]);
 assert.equal(x.seenRaw.length,1);
});
test('token redemption failing in database fails closed before contacting Cloudflare',async()=>{
 const x=mock({tokenBucketError:true});
 const r=await decode(await x.request(TOKEN));
 assert.equal(r.status,503);
 assert.equal(r.code,'qa_service_unavailable');
 assert.equal(x.seenRaw.length,0);
});
test('Cloudflare upstream rejection consumes token so replay is still rejected',async()=>{
 const x=mock({upstreamAlwaysSuccess:false});
 const a=await decode(await x.request(TOKEN));
 const b=await decode(await x.request(TOKEN));
 assert.equal(a.status,403);assert.equal(a.code,'siteverify_rejected');
 assert.equal(b.status,403);assert.equal(b.code,'token_replayed');
 assert.equal(x.seenRaw.length,1);
});
test('unauthorized token does not consume a token or contact Cloudflare',async()=>{
 const x=mock({userAuthorized:false});
 const a=await decode(await x.request(TOKEN));
 assert.equal(a.status,401);
 assert.equal(x.keyHits.size,0);assert.equal(x.seenRaw.length,0);
});
test('stored keys are deterministic opaque HMACs, never original token',async()=>{
 const x=mock();
 await x.request(TOKEN);
 const body=x.calls.filter(c=>c.url.includes('mmh_n10a6_take_attempt')).map(c=>JSON.parse(c.body));
 assert.equal(body.length,2);
 assert.ok(body.every(r=>r.p_key.length===64&&!r.p_key.includes(TOKEN)));
 assert.equal(body[1].p_limit,1);
});
