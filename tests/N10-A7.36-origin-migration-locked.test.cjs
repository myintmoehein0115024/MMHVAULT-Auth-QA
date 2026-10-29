'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const B=require('../review/N10-A7.36-build-browser-candidates-LOCKED.cjs');
const EDGE_PATH='review/N10-A7.36-staging-edge-pages-origin-CLOSED-REVIEW-ONLY.ts';
const EDGE=fs.readFileSync(EDGE_PATH,'utf8');
const N='https://mmhvault-auth-qa-locked.pages.dev',O='https://myintmoehein0115024.github.io';
const full=s=>s.startsWith('https://')?s:'https://'+s;
let output;
function runEdge(){
 let handler=null,calls=0;
 const context={Deno:{env:{get:()=>''},serve:f=>{handler=f}},TextEncoder,
  TextDecoder,Response,Request,Headers,URL,URLSearchParams,crypto:webcrypto,
  AbortSignal,Date,fetch:async()=>{calls++;throw Error('unexpected_network')},
  console:{log:()=>{throw Error('no_logging')}}};
 vm.runInNewContext(EDGE,context,{timeout:1500,filename:'N10-A7.36-CANDIDATE-NEVER-DEPLOY.ts'});
 assert.equal(typeof handler,'function');
 return {handler,calls:()=>calls};
}
function req(origin,method='OPTIONS',body=undefined,additional={}){
 return new Request('https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username',{
  method,headers:{...(origin?{'Origin':origin}:{}),...additional},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
test.before(()=>{output=B.build()});
test('builder emits only review files and explicitly refuses different target output path',()=>{
 assert.equal(output.ok,true);assert.equal(output.locked,true);
 assert.deepEqual([...output.modules].sort(),['adapter.cjs','browser.cjs','controller.cjs','sdk.cjs','turnstile.cjs']);
 assert.throws(()=>B.build({output:'/tmp/real-site'}),/unapproved_output_directory/);
 const listing=fs.readdirSync(B.ROOT).sort();
 assert.deepEqual(listing,['adapter.cjs','browser.cjs','controller.cjs','manifest.json','sdk.cjs','turnstile.cjs']);
});
test('manifest retains 1970 hardlock, unknown sitekey and Cloudflare not applied',()=>{
 const m=require('../review/N10-A7.36-candidate-browser/manifest.json');
 assert.equal(m.cloudMutationAllowed,false);assert.equal(m.realAuthAllowed,false);
 assert.equal(m.sitekeyHostnameAttested,false);assert.equal(m.stagingEdgeVersion,11);
 assert.equal(m.stagingWindowStart,'1970-01-01T00:00:00.000Z');
 assert.equal(m.stagingWindowEnd,'1970-01-01T00:00:00.000Z');
 assert.equal(m.targetOrigin,N);assert.equal(m.modules.length,5);
});
test('Edge candidate hardlock and expired UTC window exact',()=>{
 assert.match(EDGE,/const CODE_GATE_OPEN = false;/);
 assert.match(EDGE,/const WINDOW_START_UTC = '1970-01-01T00:00:00.000Z'/);
 assert.match(EDGE,/const WINDOW_END_UTC = '1970-01-01T00:00:00.000Z'/);
 assert.match(EDGE,/env\('N10A6_STAGING_ENABLED'\) === 'true'/);
 assert.match(EDGE,/const ORIGIN = 'https:\/\/mmhvault-auth-qa-locked\.pages\.dev'/);
 assert.match(EDGE,/const HOSTNAME = 'mmhvault-auth-qa-locked\.pages\.dev'/);
 assert.doesNotMatch(EDGE,/const ORIGIN = 'https:\/\/myintmoehein0115024\.github\.io'/);
 assert.doesNotMatch(EDGE,/const HOSTNAME = 'myintmoehein0115024\.github\.io'/);
 assert.doesNotMatch(EDGE,/vrypucmyrztxgiqhjspd/);
});
test('candidate Edge explicitly denies old GitHub origin preflight',async()=>{
 const e=runEdge(),r=await e.handler(req(O));
 assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
 assert.equal((await r.json()).code,'origin_not_allowed');assert.equal(e.calls(),0);
});
test('candidate Edge allows only new QA Origin preflight with fixed ACAO, even when disabled',async()=>{
 const e=runEdge(),r=await e.handler(req(N));
 assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),N);
 assert.equal(r.headers.get('vary'),'Origin');assert.equal(e.calls(),0);
 assert.equal(r.headers.get('access-control-allow-credentials'),null);
});
for(const origin of [
 'https://mmhvault.com','https://www.mmhvault.com',
 'https://evil.example',O,'http://mmhvault-auth-qa-locked.pages.dev',
 'https://mmhvault-auth-qa-locked.pages.dev.evil.example'
]){
 test('Edge OPTIONS and POST reject untrusted '+origin,async()=>{
  const e=runEdge();
  for(const method of ['OPTIONS','POST']){
   const r=await e.handler(req(origin,method,method==='POST'?{action:'preflight'}:undefined,
    method==='POST'?{'content-type':'application/json'}:{}));
   assert.equal(r.status,403);
   assert.equal(r.headers.get('access-control-allow-origin'),null);
   assert.equal((await r.json()).code,'origin_not_allowed');
  }
  assert.equal(e.calls(),0);
 });
}
test('browser-facing Edge preflight is always disabled due to CODE_GATE_OPEN=false',async()=>{
 const e=runEdge(),r=await e.handler(req(N,'POST',{action:'preflight'},{'content-type':'application/json'}));
 const body=await r.json();
 assert.equal(r.status,200);assert.equal(body.code,'preflight_ok');
 assert.equal(body.enabled,false);assert.equal(body.registration_enabled,false);
 assert.equal(body.scope,'isolated_staging_only');assert.equal(e.calls(),0);
 assert.equal(r.headers.get('cache-control'),'no-store, private, max-age=0');
});
for(const action of ['login','bind']){
 test('Edge candidate refuses real '+action+' before CAPTCHA/database I/O',async()=>{
  const e=runEdge(),r=await e.handler(req(N,'POST',
   {action,username:'qa_only',password:'not-a-real-password',captcha_token:'not-a-real-token'},
   {'content-type':'application/json'}));
  assert.equal(r.status,503);assert.equal((await r.json()).code,'n10a6_disabled');
  assert.equal(e.calls(),0);
 });
}
test('Edge disallows missing Origin, even if sent directly by server caller',async()=>{
 const e=runEdge(),r=await e.handler(req(undefined));
 assert.equal(r.status,403);assert.equal(e.calls(),0);
});
test('client candidates keep five original immutable code-level gates false',()=>{
 const want=[
 ['controller.cjs','const ALLOW_REAL_OPERATIONS=false;'],
 ['adapter.cjs','const STAGING_ADAPTER_ENABLED=false;'],
 ['sdk.cjs','const STAGING_SDK_BOOTSTRAP_ENABLED=false;'],
 ['turnstile.cjs','const ALLOW_TURNSTILE_ACTIONS=false;'],
 ['browser.cjs','const ALLOW_BROWSER_ACCEPTANCE=false;']
 ];
 for(const [file,gate] of want){
  const s=fs.readFileSync(path.join(B.ROOT,file),'utf8');
  assert.ok(s.includes(gate),file);
  assert.ok(s.includes(N),file);
  assert.ok(!s.includes('const ORIGIN=\''+O+'\''),file);
  assert.ok(!s.includes('vrypucmyrztxgiqhjspd'),file);
 }
});
test('SDK and Controller context validate only new QA URL (with code gates still false)',()=>{
 const sdk=require(path.join(B.ROOT,'sdk.cjs'));
 const ctl=require(path.join(B.ROOT,'controller.cjs'));
 const cfg={project:'ldivswlhtgmznzwhzsoi',
  base:'https://ldivswlhtgmznzwhzsoi.supabase.co',
  endpoint:'https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username',
  origin:N,publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz123'};
 assert.equal(sdk.validContext(cfg,N),true);
 assert.equal(sdk.validContext({...cfg,origin:O},O),false);
 assert.equal(ctl.guardConfig(cfg),true);
 assert.equal(ctl.guardConfig({...cfg,origin:O}),false);
 const b=sdk.createIsolatedStagingSdk({cfg,origin:N,createClient(){throw Error('should_not_init')}});
 assert.equal(b.enabled,false);assert.equal(b.code,'staging_sdk_bootstrap_locked');
});
test('adapter, Turnstile and browser fail before creating any live client or widget',()=>{
 const cfg={project:'ldivswlhtgmznzwhzsoi',
  base:'https://ldivswlhtgmznzwhzsoi.supabase.co',
  endpoint:'https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username',
  origin:N,publishableKey:'sb_publishable_abcdefghijklmnopqrstuvwxyz123'};
 const a=require(path.join(B.ROOT,'adapter.cjs'));
 const t=require(path.join(B.ROOT,'turnstile.cjs'));
 const b=require(path.join(B.ROOT,'browser.cjs'));
 assert.equal(a.isValidContext(cfg),true);
 assert.equal(a.isValidContext({...cfg,origin:O}),false);
 assert.equal(a.makeStagingAdapter({cfg,client:{get auth(){throw Error('sdk accessed')}},transport(){throw Error('transport')}}).code,'review_locked');
 assert.equal(t.ORIGIN,N);
 assert.equal(t.createActionProvider({origin:N}).code,'turnstile_review_locked');
 assert.equal(b.contextAllowed(cfg,N),true);
 assert.equal(b.contextAllowed({...cfg,origin:O},O),false);
 assert.equal(b.createReviewBrowserAcceptance({cfg,origin:N}).code,'browser_acceptance_hard_locked');
});
test('action names and exact Turnstile-hostname boundary preserved',()=>{
 const t=require(path.join(B.ROOT,'turnstile.cjs'));
 assert.deepEqual([...t.ACTIONS],['mmh_n10a6_login','mmh_n10a6_bind']);
 const s=fs.readFileSync(path.join(B.ROOT,'turnstile.cjs'),'utf8');
 assert.ok(s.includes("const ORIGIN='"+N+"';"));
 assert.match(EDGE,/j\?\.hostname === HOSTNAME && j\?\.action === action/);
});
test('current Pages public version stays LOCKED; do not include the review candidates in live build',()=>{
 const build=fs.readFileSync('hosting/N10-A7.32-build-quarantined-preview.cjs','utf8');
 const html=fs.readFileSync('hosting/n10a732-preview/index.html','utf8');
 const head=fs.readFileSync('hosting/n10a732-preview/_headers','utf8');
 assert.doesNotMatch(build,/N10-A7\.36-candidate-browser/);
 assert.match(html,/id="real-run"[^>]*disabled/);
 assert.match(html,/id="locked-password"[^>]*disabled/);
 assert.match(head,/connect-src 'none'/);
 assert.match(head,/frame-ancestors 'none'/);
});
