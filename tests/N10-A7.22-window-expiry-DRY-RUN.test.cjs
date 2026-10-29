'use strict';
/**
 * N10-A7.22 — SAFETY DRY RUN ONLY, fake credentials and clock.
 * Reads real Staging v11 source in VM. No deployed Supabase modifications.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const SOURCE=fs.readFileSync(path.join(__dirname,'../edge/N10-A7.17-closed-main-captcha-replay-v11.js'),'utf8');
const PROJECT='ldivswlhtgmznzwhzsoi';
const BASE='https://'+PROJECT+'.supabase.co';
const ORIGIN='https://myintmoehein0115024.github.io';
const T=Date.parse('2026-11-10T10:00:00.000Z');
const iso=ms=>new Date(ms).toISOString();
const e={SUPABASE_URL:BASE,SUPABASE_ANON_KEY:'synthetic-public-123456789012345678900',
 SUPABASE_SERVICE_ROLE_KEY:'synthetic-private-1234567890123456789000',
 N10A6_TURNSTILE_SECRET:'synthetic-cloudflare-secret-just-for-tests',
 N10A6_RATE_HMAC_KEY:'synthetic-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
 N10A6_STAGING_ENABLED:'true'};
function rig({open=false,from=T-60000,to=T+14*60000,clock=T,env={}}={}){
 let source=SOURCE,handler=null,now=clock,calls=0;
 if(open)source=source.replace('const CODE_GATE_OPEN = false','const CODE_GATE_OPEN = true');
 source=source.replace("const WINDOW_START_UTC = '1970-01-01T00:00:00.000Z'","const WINDOW_START_UTC = '"+iso(from)+"'");
 source=source.replace("const WINDOW_END_UTC = '1970-01-01T00:00:00.000Z'","const WINDOW_END_UTC = '"+iso(to)+"'");
 const values={...e,...env};
 class FakeDate extends Date{static now(){return now}}
 vm.runInNewContext(source,{
  Deno:{env:{get:k=>values[k]},serve:h=>handler=h},
  Request,Response,Headers,TextEncoder,TextDecoder,URL,URLSearchParams,AbortSignal,
  Date:FakeDate,crypto:require('node:crypto').webcrypto,
  fetch:async()=>{calls++;throw Error('Synthetic window test must not call network')},
  console
 },{filename:'N10-A7.22-mock-edge-only.js',timeout:1500});
 assert.equal(typeof handler,'function');
 async function post(body,origin=ORIGIN){
   const res=await handler(new Request(BASE+'/functions/v1/mmh-n10a6-username',{
    method:'POST',
    headers:{'Content-Type':'application/json',Origin:origin},
    body:JSON.stringify(body)
   }));
   return {status:res.status,...await res.json()};
 }
 return {preflight:()=>post({action:'preflight'}),login:()=>post({action:'login',username:'qa_dummy',password:'fake-only'}),
 bind:()=>post({action:'bind',username:'qa_dummy',password:'fake-only'}),
 post,setClock:value=>{now=value},getCalls:()=>calls};
}
test('deployed source has hardcoded false code gate and 1970 expiry',()=>{
 assert.ok(SOURCE.includes('const CODE_GATE_OPEN = false'));
 assert.equal((SOURCE.match(/1970-01-01T00:00:00.000Z/g)||[]).length,2);
 assert.ok(SOURCE.includes('const MAX_WINDOW_MS = 15 * 60 * 1000'));
 assert.ok(SOURCE.includes("env('N10A6_STAGING_ENABLED') === 'true'"));
});
test('without changing gate, valid time window + secret true stays disabled',async()=>{
 const r=rig({open:false});
 assert.equal((await r.preflight()).enabled,false);
 assert.equal((await r.login()).status,503);
 assert.equal((await r.bind()).status,503);
 assert.equal(r.getCalls(),0);
});
test('gate alone not enough: invalid time is always closed',async()=>{
 const r=rig({open:true,from:0,to:0});
 assert.equal((await r.preflight()).enabled,false);
 assert.equal((await r.login()).code,'n10a6_disabled');
});
test('environment kill switch false overrides valid gate/window',async()=>{
 const r=rig({open:true,env:{N10A6_STAGING_ENABLED:'false'}});
 assert.equal((await r.preflight()).enabled,false);
 assert.equal((await r.login()).status,503);
 assert.equal(r.getCalls(),0);
});
test('missing kill switch forces closure',async()=>{
 const r=rig({open:true,env:{N10A6_STAGING_ENABLED:''}});
 assert.equal((await r.preflight()).enabled,false);
});
test('wrong Supabase project URL refuses service even if gates enabled',async()=>{
 const r=rig({open:true,env:{SUPABASE_URL:'https://vrypucmyrztxgiqhjspd.supabase.co'}});
 const p=await r.preflight();
 assert.equal(p.enabled,false);assert.equal(p.prerequisites_present,false);
});
test('missing Cloudflare Secret forces closure',async()=>{
 const r=rig({open:true,env:{N10A6_TURNSTILE_SECRET:''}});
 assert.equal((await r.preflight()).enabled,false);
 assert.equal((await r.bind()).status,503);
});
test('missing HMAC secret forces closure',async()=>{
 const r=rig({open:true,env:{N10A6_RATE_HMAC_KEY:''}});
 assert.equal((await r.preflight()).enabled,false);
});
test('timestamp before start is disabled',async()=>{
 const r=rig({open:true,clock:T-60001});
 assert.equal((await r.preflight()).enabled,false);
});
test('exact start timestamp enabled only in isolated VM',async()=>{
 const r=rig({open:true,clock:T-60000});
 const p=await r.preflight();
 assert.equal(p.status,200);assert.equal(p.enabled,true);
 assert.equal(p.scope,'isolated_staging_only');assert.equal(p.registration_enabled,false);
});
test('valid 14m59s window can be enabled only in isolated VM',async()=>{
 const r=rig({open:true,from:T-60000,to:T+14*60000-1000});
 assert.equal((await r.preflight()).enabled,true);
});
test('window longer than 15m always rejected',async()=>{
 const r=rig({open:true,from:T-60001,to:T+14*60000});
 assert.equal((await r.preflight()).enabled,false);
});
test('end <= start is disabled',async()=>{
 const r=rig({open:true,from:T,to:T});
 assert.equal((await r.preflight()).enabled,false);
});
test('exact end time closes instantly without deploy, timer or network',async()=>{
 const r=rig({open:true});
 assert.equal((await r.preflight()).enabled,true);
 r.setClock(T+14*60000);
 assert.equal((await r.preflight()).enabled,false);
 assert.equal((await r.login()).status,503);
 assert.equal((await r.bind()).status,503);
 assert.equal(r.getCalls(),0);
});
test('preflight never activates registration even during hypothetical test window',async()=>{
 const r=rig({open:true});
 assert.equal((await r.preflight()).registration_enabled,false);
});
test('malformed login input rejected before external calls',async()=>{
 const r=rig({open:true});
 const response=await r.post({action:'login',username:'bad!',password:'fake-only'});
 assert.equal(response.status,401);assert.equal(response.code,'invalid_credentials');
 assert.equal(r.getCalls(),0);
});
test('wrong browser Origin denied even with simulated open gate',async()=>{
 const r=rig({open:true});
 const response=await r.post({action:'preflight'},'https://malicious.example.invalid');
 assert.equal(response.status,403);assert.equal(response.code,'origin_not_allowed');
 assert.equal(r.getCalls(),0);
});
