'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const SOURCE=fs.readFileSync(path.join(__dirname,'../edge/N10-A7.15-staging-siteverify-qa-only.ts'),'utf8');
const ORIGIN='https://myintmoehein0115024.github.io';
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co';
const UID='11111111-1111-4111-8111-111111111111';
const TOKEN='synthetic-turnstile-token-not-real-123456';
const DEADLINE='2026-10-30T17:00:00.000Z';
function make({wrongOrigin=false,missingSecrets=false,validUser=true,owner=true,siteAction='mmh_n10a6_login',
 siteHostname='myintmoehein0115024.github.io',captcha=true,once=false,quota=true,expired=false}={}){
  const calls=[],seen=new Set();
  const environment={
    SUPABASE_URL:BASE,SUPABASE_ANON_KEY:'fake-anon-key-not-real-123456789123456789',
    SUPABASE_SERVICE_ROLE_KEY:'fake-service-key-not-real-123456789123456789',
    N10A6_TURNSTILE_SECRET:missingSecrets?'':'fake-cloudflare-secret-not-real',
    N10A6_RATE_HMAC_KEY:'fake-rate-key-only-for-mock-tests-1234567890123'
  };
  async function fetch(url,options={}){
    const s=String(url);calls.push(s);
    const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
    if(s.endsWith('/auth/v1/user')){
      return validUser?json({id:UID,email:'fake.qa@example.invalid',email_confirmed_at:'2026-10-01T00:00:00Z',is_anonymous:false}):json({message:'unauthorized'},401);
    }
    if(s.includes('mmh_n10a6_auth_owner_probe'))
      return json(owner?[{user_id:UID}]:[]);
    if(s.endsWith('/rpc/mmh_n10a6_take_attempt'))return json(quota);
    if(s.includes('turnstile/v0/siteverify')){
      const t=new URLSearchParams(options.body).get('response');
      const valid=captcha&&(!once||!seen.has(t));
      seen.add(t);
      return json({success:valid,hostname:siteHostname,action:siteAction});
    }
    throw Error('unexpected mock fetch path '+s);
  }
  let handle;
  class FakeDate extends Date{static now(){return expired?Date.parse('2026-11-01T00:00:00Z'):Date.parse('2026-10-29T08:00:00Z')}}
  const context={
    Deno:{env:{get:key=>environment[key]},serve:fn=>{handle=fn}},
    Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortSignal,crypto:webcrypto,fetch,
    Date:FakeDate,console
  };
  vm.runInNewContext(SOURCE,context,{filename:'n10a15-siteverify.js',timeout:2000});
  assert.equal(typeof handle,'function');
  const send=(payload,opts={})=>handle(new Request(BASE+'/functions/v1/mmh-n10a15-siteverify-qa',{
    method:opts.method||'POST',
    headers:{
      Origin:wrongOrigin?'https://untrusted.example':ORIGIN,
      'Content-Type':'application/json',
      ...(opts.unauthenticated?{}:{Authorization:'Bearer mock-jwt-only-not-real'}),
      ...(opts.headers||{})
    },
    body:JSON.stringify(payload)
  }));
  return {calls,send};
}
const payload=(overrides={})=>({action:'verify',expected_action:'mmh_n10a6_login',captcha_token:TOKEN,...overrides});
async function code(response){return {status:response.status,body:await response.json()}}
test('QA source hard-expired deadline, no login, no binding, no secrets',()=>{
 assert.match(SOURCE,/const DEADLINE='2026-10-30T17:00:00\.000Z'/);
 assert.ok(SOURCE.includes('isExistingQaOwner'));
 assert.ok(SOURCE.includes('p_limit:6'));
 assert.ok(!SOURCE.includes('CODE_GATE_OPEN = true'));
 assert.ok(!SOURCE.includes('/auth/v1/token?grant_type=password'));
 assert.ok(!SOURCE.includes('mmh_n10a6_claim_username'));
});
test('authenticated existing QA owner passes real-like mock Siteverify',async()=>{
 const f=make();
 const r=await code(await f.send(payload()));
 assert.equal(r.status,200);assert.equal(r.body.code,'siteverify_pass');
 assert.equal(f.calls.length,4);
 assert.ok(f.calls[3].includes('siteverify'));
 assert.ok(!JSON.stringify(r.body).includes(TOKEN));
});
test('replayed single-use token rejected after first acceptance',async()=>{
 const f=make({once:true});
 const a=await code(await f.send(payload()));
 const b=await code(await f.send(payload()));
 assert.equal(a.status,200);
 assert.equal(b.status,403);
 assert.equal(b.body.code,'siteverify_rejected');
});
test('Cloudflare action mismatch rejected and no token returned',async()=>{
 const f=make({siteAction:'mmh_n10a6_bind'});
 const r=await code(await f.send(payload()));
 assert.equal(r.status,403);assert.equal(r.body.code,'siteverify_rejected');
});
test('Cloudflare wrong hostname rejected',async()=>{
 const f=make({siteHostname:'evil.example'});
 const r=await code(await f.send(payload()));
 assert.equal(r.status,403);
});
test('invalid captcha response rejected',async()=>{
 const f=make({captcha:false});
 assert.equal((await code(await f.send(payload()))).status,403);
});
test('anonymous request rejected before any backend call',async()=>{
 const f=make();
 const r=await code(await f.send(payload(),{unauthenticated:true}));
 assert.equal(r.status,401);assert.equal(f.calls.length,0);
});
test('unknown JWT rejected before RLS or Siteverify',async()=>{
 const f=make({validUser:false});
 const r=await code(await f.send(payload()));
 assert.equal(r.status,401);assert.equal(f.calls.length,1);
});
test('non-QA user fails RLS owner probe',async()=>{
 const f=make({owner:false});
 const r=await code(await f.send(payload()));
 assert.equal(r.status,403);assert.equal(f.calls.length,2);
});
test('independent limiter exhaustion rejects before Siteverify',async()=>{
 const f=make({quota:false});
 const r=await code(await f.send(payload()));
 assert.equal(r.status,429);assert.equal(f.calls.length,3);
});
test('foreign Origin denied before all backend calls',async()=>{
 const f=make({wrongOrigin:true});
 const r=await code(await f.send(payload()));
 assert.equal(r.status,403);assert.equal(f.calls.length,0);
});
test('missing secret causes closed failure before any network',async()=>{
 const f=make({missingSecrets:true});
 const r=await code(await f.send(payload()));
 assert.equal(r.status,503);assert.equal(f.calls.length,0);
});
test('expiration prevents any request forever after cutoff',async()=>{
 const f=make({expired:true});
 const r=await code(await f.send(payload()));
 assert.equal(r.status,410);assert.equal(f.calls.length,0);
});
test('unsupported test action rejected before privileged network',async()=>{
 const f=make();
 const r=await code(await f.send(payload({expected_action:'mmh_n10a6_create_account'})));
 assert.equal(r.status,400);assert.equal(f.calls.length,0);
});
test('bad token length rejected before any backend access',async()=>{
 const f=make();
 const r=await code(await f.send(payload({captcha_token:'x'})));
 assert.equal(r.status,400);assert.equal(f.calls.length,0);
});
test('body byte limit rejects oversized input with zero backend access',async()=>{
 const f=make();
 const r=await code(await f.send(payload({pad:'x'.repeat(5000)})));
 assert.equal(r.status,413);assert.equal(f.calls.length,0);
});
