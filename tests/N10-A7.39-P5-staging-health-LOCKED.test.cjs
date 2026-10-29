'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const DIST='qa/n10a737-preview-dist',SRC='review/n10a739p5-connectivity-LOCKED';
const expected='https://mmhvault-auth-g10g11-locked.pages.dev';
const endpoint='https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username';
const locked={code:'preflight_ok',scope:'isolated_staging_only',enabled:false,registration_enabled:false};
let script='';
test.before(()=>{const build=require('node:child_process');build.execFileSync(process.execPath,['review/N10-A7.39-P5-build-locked-staging-health.cjs'],{timeout:12000});script=fs.readFileSync(path.join(DIST,'assets/staging-health.js'),'utf8');});
function run({origin=expected,secure=true,response=locked,httpOK=true,fail=false}={}){
 let onClick;const calls=[];
 const button={disabled:false,addEventListener:(evt,fn)=>{assert.equal(evt,'click');onClick=fn}};
 const status={dataset:{state:'not-run'},className:'status neutral',textContent:'尚未运行'};
 const globals={location:{origin},window:{isSecureContext:secure},
  document:{getElementById:(id)=>id==='check'?button:status},
  AbortController:class{constructor(){this.signal={}}abort(){}},
  setTimeout:(cb,time)=>{assert.equal(time,9000);return 1},clearTimeout:()=>{},Promise,
  fetch:async(url,options)=>{calls.push({url,options});if(fail)throw Error('fake_error');return {ok:httpOK,json:async()=>response}},
  console:{log:()=>{throw Error('no logging')}}
 };
 vm.runInNewContext(script,globals,{timeout:1800});
 return{button,status,calls,click:async()=>{if(!onClick)throw Error('click_locked');await onClick()}};
}
test('source and build contain no actual credential inputs or secrets',()=>{
 const html=fs.readFileSync(path.join(DIST,'staging-health.html'),'utf8');
 assert.doesNotMatch(html,/<input\b|type="password"|<form\b/);
 assert.doesNotMatch(script,/signInWithPassword|signUp\(|resetPassword|localStorage|sessionStorage|turnstile\.render|sb_secret_|service_role|vrypucmyrztxgiqhjspd/);
 assert.match(script,/const REAL_AUTH_ENABLED = false;/);
 assert.match(script,/const STAGING_WRITES_ALLOWED = false;/);
 assert.match(script,/const TURNSTILE_ACTIONS_ENABLED = false;/);
});
test('old locked homepage and JS and CSS are byte-identical to reviewed source',()=>{
 for(const item of ['index.html','assets/auth-qa.js','assets/auth-qa.css']){
  assert.deepEqual(fs.readFileSync(path.join(DIST,item)),
   fs.readFileSync(path.join('review/n10a737-credential-qa-LOCKED',item)),item);
 }
});
test('old homepage CSP remains default-deny; new path has exact scoped override',()=>{
 const csp=fs.readFileSync(path.join(DIST,'_headers'),'utf8');
 assert.match(csp,/\/\*\n  Content-Security-Policy:.*connect-src 'none'/);
 assert.match(csp,/\/staging-health\n  ! Content-Security-Policy\n  Content-Security-Policy:.*connect-src https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co/);
 assert.match(csp,/\/staging-health\.html\n  ! Content-Security-Policy\n  Content-Security-Policy:.*connect-src https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co/);
 assert.equal((csp.match(/connect-src https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co/g)||[]).length,2);
 assert.equal((csp.match(/connect-src 'none'/g)||[]).length,1);
 assert.equal((csp.match(/! Content-Security-Policy/g)||[]).length,2);
 assert.match(csp,/form-action 'none'/);
});
test('all assets local and only pages in exact build whitelist',()=>{
 const files=fs.readdirSync(DIST,{recursive:true}).filter(x=>typeof x==='string'&&!String(x).endsWith('/')).sort();
 assert.deepEqual(files,['_headers','assets','assets/auth-qa.css','assets/auth-qa.js','assets/staging-health.css','assets/staging-health.js','index.html','robots.txt','staging-health.html'].sort());
 const html=fs.readFileSync(path.join(DIST,'staging-health.html'),'utf8');
 assert.match(html,/src="\/assets\/staging-health.js"/);
 assert.match(html,/href="\/assets\/staging-health.css"/);
 assert.match(html,/href="\/"/);
});
test('no network call on load',()=>{const s=run();assert.equal(s.calls.length,0);assert.equal(s.status.dataset.state,'not-run')});
for(const origin of ['https://mmhvault.com','https://myintmoehein0115024.github.io','https://8b29d612.mmhvault-auth-g10g11-locked.pages.dev','http://mmhvault-auth-g10g11-locked.pages.dev']){
 test('origin not allowed '+origin,async()=>{const x=run({origin});assert.equal(x.button.disabled,true);assert.equal(x.calls.length,0);assert.equal(x.status.dataset.state,'blocked')});
}
test('non secure context is blocked',()=>{const s=run({secure:false});assert.equal(s.button.disabled,true);assert.equal(s.calls.length,0)});
for(const [label,data,ok,fail,want] of [
 ['fully closed',locked,true,false,'closed'],
 ['auth gate open',{...locked,enabled:true},true,false,'blocked'],
 ['registration gate open',{...locked,registration_enabled:true},true,false,'blocked'],
 ['foreign scope',{...locked,scope:'production'},true,false,'blocked'],
 ['wrong code',{...locked,code:'ready'},true,false,'blocked'],
 ['missing values',{},true,false,'blocked'],
 ['HTTP error',locked,false,false,'blocked'],
 ['network error',locked,true,true,'blocked']
]){
 test('click synthetic '+label,async()=>{const x=run({response:data,httpOK:ok,fail});assert.equal(x.calls.length,0);await x.click();
  assert.equal(x.status.dataset.state,want);assert.equal(x.calls.length,1);
  const {url,options}=x.calls[0];assert.equal(url,endpoint);
  assert.equal(options.method,'POST');assert.equal(options.mode,'cors');
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');assert.equal(options.referrerPolicy,'no-referrer');
  assert.equal(options.headers['Content-Type'],'application/json');
  assert.equal(options.body,'{"action":"preflight"}');
  assert.equal(x.button.disabled,false);
 });
}
test('CSS has responsive mobile widths and no horizontal scroll',()=>{
 const css=fs.readFileSync(path.join(DIST,'assets/staging-health.css'),'utf8');
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css,/overflow-x:hidden/);
});
