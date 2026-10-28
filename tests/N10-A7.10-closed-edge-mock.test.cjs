'use strict';
/**
 * N10-A7.10 offline staging Edge regression, real deployed source but fake environment.
 * This harness never accesses the network, never uses real password/JWT/secret,
 * never changes the cloud gate, and never writes to Supabase.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const SOURCE = fs.readFileSync(path.join(__dirname,'../edge/N10-A7.10-closed-staging-index.js'),'utf8');
const ORIGIN='https://myintmoehein0115024.github.io';
const STAGE='https://ldivswlhtgmznzwhzsoi.supabase.co';
const UID='12345678-1234-4234-9234-123456789abc';
const MOCK_USER={id:UID,email:'mock.user@example.invalid',email_confirmed_at:'2026-10-01T00:00:00Z',is_anonymous:false};
const validCaptcha='valid-turnstile-token-with-more-than-20-characters';
const samplePass='synthetic-is-not-a-real-user-password';

function fixture({open=false,captchaSuccess=true,captchaHttp=200,limiter=true,lookup=true,
  passwordSuccess=true,ownerAccess=true,claim=true,captchaAction='auto'}={}){
  let src=SOURCE,registered=null;
  assert.match(src,/const CODE_GATE_OPEN = false/);
  assert.match(src,/1970-01-01T00:00:00\.000Z/);
  if(open){
    // This transform exists IN THE TEST VM only. Source and cloud are kept closed.
    const start=new Date(Date.now()-60*1000).toISOString();
    const end=new Date(Date.now()+8*60*1000).toISOString();
    src=src.replace('const CODE_GATE_OPEN = false','const CODE_GATE_OPEN = true')
      .replace("const WINDOW_START_UTC = '1970-01-01T00:00:00.000Z'","const WINDOW_START_UTC = '"+start+"'")
      .replace("const WINDOW_END_UTC = '1970-01-01T00:00:00.000Z'","const WINDOW_END_UTC = '"+end+"'");
  }
  const calls=[];
  const fetch=async(url,options={})=>{
    const dest=String(url);
    calls.push({url:dest,method:options.method||'GET',body:String(options.body||'')});
    if(dest.startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')){
      return new Response(JSON.stringify({
        success:captchaSuccess,
        hostname:'myintmoehein0115024.github.io',
        action:captchaAction==='auto'?'mmh_n10a6_login':captchaAction
      }),{status:captchaHttp});
    }
    if(dest.includes('/rest/v1/rpc/mmh_n10a6_take_attempt'))
      return new Response(JSON.stringify(limiter),{status:200});
    if(dest.includes('/rest/v1/mmh_n10a6_username_links'))
      return new Response(JSON.stringify(lookup?[{user_id:UID}]:[]),{status:200});
    if(dest.includes('/auth/v1/admin/users/'))
      return new Response(JSON.stringify(MOCK_USER),{status:200});
    if(dest.includes('/auth/v1/token?grant_type=password')){
      if(!passwordSuccess)return new Response('{"message":"invalid credentials"}',{status:400});
      return new Response(JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600}),{status:200});
    }
    if(dest.includes('/auth/v1/user'))
      return new Response(JSON.stringify(MOCK_USER),{status:200});
    if(dest.includes('/rest/v1/mmh_n10a6_auth_owner_probe'))
      return new Response(JSON.stringify(ownerAccess?[{user_id:UID}]:[]),{status:200});
    if(dest.includes('/rest/v1/rpc/mmh_n10a6_claim_username'))
      return new Response(JSON.stringify(claim),{status:200});
    if(dest.includes('/auth/v1/logout'))
      return new Response(null,{status:204});
    throw Error('UNEXPECTED_NETWORK_PATH '+dest);
  };
  const vars={
    SUPABASE_URL:STAGE,
    SUPABASE_ANON_KEY:'synthetic-public-key-0123456789012345',
    SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key-0123456789012345',
    N10A6_TURNSTILE_SECRET:'synthetic-turnstile-secret-0000',
    N10A6_RATE_HMAC_KEY:'synthetic-hmac-salt-only-test-length-over-32',
    N10A6_STAGING_ENABLED:'true'
  };
  const runtime={
    Deno:{env:{get:k=>vars[k]},serve:fn=>{registered=fn;}},
    fetch,Request,Response,Headers,URL,URLSearchParams,AbortSignal,TextEncoder,
    crypto:webcrypto,console,
  };
  vm.runInNewContext(src,runtime,{filename:'closed-staging-source.js',timeout:2000});
  assert.equal(typeof registered,'function');
  const post=(data,headers={})=>registered(new Request(STAGE+'/functions/v1/mmh-n10a6-username',{
    method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json',...headers},
    body:JSON.stringify(data)
  }));
  return {calls,post};
}
async function body(resp){return {status:resp.status,data:await resp.json()};}

test('cloud source is immutably closed with expired timestamps and per-username quota only',()=>{
  assert.ok(SOURCE.includes('const CODE_GATE_OPEN = false'));
  assert.ok(SOURCE.includes("const WINDOW_START_UTC = '1970-01-01T00:00:00.000Z'"));
  assert.ok(SOURCE.includes("const WINDOW_END_UTC = '1970-01-01T00:00:00.000Z'"));
  assert.ok(!SOURCE.includes("quota('global:"));
  assert.ok(SOURCE.indexOf("if(!await captcha(")<SOURCE.indexOf("if(!await quota("));
  assert.ok(SOURCE.includes("j?.hostname === HOSTNAME && j?.action === action"));
});

test('real code with closed gate refuses login + bind before ALL downstream calls',async()=>{
  const f=fixture();
  for(const action of ['login','bind']){
    const r=await body(await f.post({action,username:'qa_alpha',password:samplePass}));
    assert.equal(r.status,503); assert.equal(r.data.code,'n10a6_disabled');
  }
  const pre=await body(await f.post({action:'preflight'}));
  assert.equal(pre.status,200);assert.equal(pre.data.enabled,false);
  assert.equal(pre.data.registration_enabled,false);
  assert.equal(f.calls.length,0);
});

test('invalid captcha rejects with zero rate-limit or privileged DB traffic',async()=>{
  const f=fixture({open:true,captchaSuccess:false});
  const r=await body(await f.post({action:'login',username:'qa_alpha',password:samplePass,captcha_token:validCaptcha}));
  assert.equal(r.status,403);assert.equal(r.data.code,'verification_required');
  assert.equal(f.calls.length,1);
  assert.ok(f.calls[0].url.includes('turnstile/v0/siteverify'));
});

test('missing captcha rejects with zero network requests, including quota',async()=>{
  const f=fixture({open:true});
  const r=await body(await f.post({action:'login',username:'qa_alpha',password:samplePass}));
  assert.equal(r.status,403);assert.equal(f.calls.length,0);
});

test('Siteverify error fails closed without rate-limit operations',async()=>{
  const f=fixture({open:true,captchaHttp:500});
  const r=await body(await f.post({action:'login',username:'qa_alpha',password:samplePass,captcha_token:validCaptcha}));
  assert.equal(r.status,503);assert.equal(r.data.code,'auth_service_unavailable');
  assert.equal(f.calls.length,1);
});

test('valid captcha reaches independent username bucket, never global bucket',async()=>{
  const f=fixture({open:true,lookup:false});
  const r=await body(await f.post({action:'login',username:'qa_alpha',password:samplePass,captcha_token:validCaptcha}));
  assert.equal(r.status,401);
  assert.equal(f.calls.length,3);
  assert.ok(f.calls[0].url.includes('siteverify'));
  assert.ok(f.calls[1].url.includes('take_attempt'));
  assert.ok(!f.calls[1].body.includes('global'));
  assert.ok(f.calls[2].url.includes('username_links'));
});

test('independent quota exhaustion rejects after captcha without password exchange',async()=>{
  const f=fixture({open:true,limiter:false});
  const r=await body(await f.post({action:'login',username:'qa_alpha',password:samplePass,captcha_token:validCaptcha}));
  assert.equal(r.status,429);assert.equal(r.data.code,'too_many_attempts');
  assert.equal(f.calls.length,2);
  assert.ok(!f.calls.some(c=>c.url.includes('/auth/v1/token')));
});

test('synthetic password login returns same UID proof token only after owner-probe',async()=>{
  const f=fixture({open:true});
  const r=await body(await f.post({action:'login',username:'qa_alpha',password:samplePass,captcha_token:validCaptcha}));
  assert.equal(r.status,200);assert.equal(r.data.code,'login_success');
  assert.equal(r.data.access_token,'synthetic-access');
  assert.ok(f.calls.some(c=>c.url.includes('/rest/v1/mmh_n10a6_auth_owner_probe')));
  assert.ok(f.calls.findIndex(c=>c.url.includes('siteverify'))<f.calls.findIndex(c=>c.url.includes('take_attempt')));
});

test('synthetic wrong password never emits a session',async()=>{
  const f=fixture({open:true,passwordSuccess:false});
  const r=await body(await f.post({action:'login',username:'qa_alpha',password:'wrong synthetic value',captcha_token:validCaptcha}));
  assert.equal(r.status,401);
  assert.ok(!('access_token' in r.data));assert.ok(!('refresh_token' in r.data));
});

test('synthetic RLS owner probe mismatch fails closed and attempts logout',async()=>{
  const f=fixture({open:true,ownerAccess:false});
  const r=await body(await f.post({action:'login',username:'qa_alpha',password:samplePass,captcha_token:validCaptcha}));
  assert.equal(r.status,503);
  assert.equal(r.data.code,'identity_check_unavailable');
  assert.ok(f.calls.some(c=>c.url.includes('/auth/v1/logout')));
});
