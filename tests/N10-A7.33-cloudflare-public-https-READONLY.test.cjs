'use strict';
/* N10-A7.33 — real public Cloudflare Pages READ-ONLY proof.
 * No actual Staging Auth requests, credential inputs, POST or CAPTCHA.
 * Separate from local HTTPS N10-A7.32 CI. Run only on exact QA domain.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const https=require('node:https'),path=require('node:path'),fs=require('node:fs');
const {createRequire}=require('node:module');
const pkgRequire=createRequire(path.resolve('qa/n10-a728-real-sdk/package.json'));
const {chromium}=pkgRequire('playwright-core');
const DOMAIN='mmhvault-auth-qa-locked.pages.dev',ORIGIN='https://'+DOMAIN;
const disallowed=['mmhvault.com','vrypucmyrztxgiqhjspd','ldivswlhtgmznzwhzsoi.supabase.co','challenges.cloudflare.com'];
const HEADERS=['content-security-policy','x-frame-options','x-content-type-options','referrer-policy',
 'cache-control','strict-transport-security','cross-origin-opener-policy','permissions-policy','x-robots-tag'];
let browser,context;
function fetchHttp(pathname='/',method='HEAD'){
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:DOMAIN,protocol:'https:',port:443,path:pathname,
   method,timeout:12000,headers:{'User-Agent':'MMHVAULT-N10A733-READONLY-QA',
    'Accept':'text/html','Cache-Control':'no-cache'}},res=>{
    const h={};for(const name of HEADERS)if(typeof res.headers[name]==='string')h[name]=res.headers[name];
    res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:h,redirect:res.headers.location||''}));
   });
  req.on('timeout',()=>req.destroy(Error('qa_head_timeout')));req.on('error',reject);req.end();
 });
}
function mustBeHardened({status,headers}){
 assert.equal(status,200,'QA Pages should serve HTTP 200');
 assert.match(headers['content-security-policy']||'',/frame-ancestors 'none'/);
 assert.match(headers['content-security-policy']||'',/connect-src 'none'/);
 assert.match(headers['content-security-policy']||'',/script-src 'self'/);
 assert.match(headers['content-security-policy']||'',/frame-src 'none'/);
 assert.match(headers['content-security-policy']||'',/worker-src 'none'/);
 assert.equal(headers['x-frame-options'],'DENY');
 assert.equal(headers['x-content-type-options'],'nosniff');
 assert.equal(headers['referrer-policy'],'no-referrer');
 assert.match(headers['cache-control']||'',/^no-store/);
 assert.equal(headers['cross-origin-opener-policy'],'same-origin');
 assert.match(headers['strict-transport-security']||'',/max-age=31536000/);
 assert.equal(headers['permissions-policy'],'camera=(), microphone=(), geolocation=(), payment=()');
 assert.equal(headers['x-robots-tag'],'noindex, nofollow, noarchive');
 return true;
}
test.before(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
});
test.after(async()=>{await context?.close();await browser?.close()});
test('real Pages domain root HEAD has actual CSP and security headers',async()=>{
 const r=await fetchHttp('/');
 assert.equal(mustBeHardened(r),true);
 assert.equal(r.redirect,'');
});
for(const p of ['/assets/locked-preview.js','/assets/locked-preview.css','/robots.txt']){
 test('public static '+p+' has hardened headers and 200 status',async()=>{
  const r=await fetchHttp(p);
  assert.equal(mustBeHardened(r),true);
 });
}
test('public static QA response does not redirect to production domain',async()=>{
 const r=await fetchHttp('/');
 assert.equal(r.redirect,'');
 assert.ok(!JSON.stringify(r.headers).includes('mmhvault.com'));
 assert.ok(!JSON.stringify(r.headers).includes('supabase.co'));
});
async function open(width=390){
 const page=await context.newPage();await page.setViewportSize({width,height:844});
 const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',req=>{
  if(!req.url().startsWith(ORIGIN+'/'))external.push(req.url());
 });
 const response=await page.goto(ORIGIN+'/',{waitUntil:'load',timeout:20000});
 assert.equal(response?.status(),200,'public Pages site must load');
 return {page,errors,external};
}
test('real public QA site is default-locked with zero real authentication requests',async()=>{
 const a=await open();
 try{
  const state=await a.page.evaluate(()=>({
   identityDisabled:document.getElementById('locked-identity')?.disabled,
   passwordDisabled:document.getElementById('locked-password')?.disabled,
   runDisabled:document.getElementById('real-run')?.disabled,
   actualResults:['email','bind','login','uid','rls','logout'].map(x=>
    document.getElementById('result-'+x)?.textContent),
   storage:localStorage.length+sessionStorage.length,cookie:document.cookie
  }));
  assert.equal(state.identityDisabled,true);assert.equal(state.passwordDisabled,true);
  assert.equal(state.runDisabled,true);
  assert.deepEqual(state.actualResults,Array(6).fill('NOT RUN'));
  assert.equal(state.storage,0);assert.equal(state.cookie,'');
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
 }finally{await a.page.close()}
});
test('real public QA locale tabs and failure simulation remain offline only',async()=>{
 const a=await open();
 try{
  await a.page.locator('#en').click();
  assert.equal(await a.page.locator('h1').textContent(),'Secure hosting review');
  await a.page.locator('#mode-bind').click();
  assert.equal(await a.page.locator('#flow-heading').textContent(),'Verify existing account binding');
  await a.page.locator('#simulate').click();
  assert.match(await a.page.locator('#sim-result').textContent(),/Offline mock/);
  assert.equal(await a.page.locator('#result-uid').textContent(),'NOT RUN');
  await a.page.locator('#zh').click();
  assert.equal(await a.page.locator('h1').textContent(),'安全托管验收');
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
 }finally{await a.page.close()}
});
test('real deployed HTTP CSP blocks inline injected JS',async()=>{
 const a=await open();
 try{
  const allowed=await a.page.evaluate(()=>{
   const script=document.createElement('script');
   script.textContent='window.__MMH_PUBLIC_INLINE_INJECTION=true';
   document.body.append(script);
   return window.__MMH_PUBLIC_INLINE_INJECTION===true;
  });
  assert.equal(allowed,false);
  assert.deepEqual(a.external,[]);
 }finally{await a.page.close()}
});
test('real deployed HTTP CSP blocks Supabase requests',async()=>{
 const a=await open();
 try{
  const value=await a.page.evaluate(async()=>{
   try{await fetch('https://ldivswlhtgmznzwhzsoi.supabase.co/auth/v1/user');return 'BAD'}
   catch{return 'CSP_BLOCKED'}
  });
  assert.equal(value,'CSP_BLOCKED');
  assert.deepEqual(a.external,[]);
 }finally{await a.page.close()}
});
for(const width of [320,375,390,428,768,1024,1440]){
 test('real public mobile/desktop viewport '+width+'px no overflow or open login',async()=>{
  const a=await open(width);
  try{
   const d=await a.page.evaluate(()=>({
    win:innerWidth,scroll:document.documentElement.scrollWidth,
    locked:document.getElementById('real-run')?.disabled,
    heading:document.querySelector('h1')?.getBoundingClientRect().width
   }));
   assert.ok(d.scroll<=d.win+1,'horizontal overflow '+JSON.stringify(d));
   assert.equal(d.locked,true);assert.ok(d.heading>90);
   assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
  }finally{await a.page.close()}
 });
}
test('Cloudflare public QA origin is not a staging authorization source',()=>{
 const file=fs.readFileSync('integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs','utf8');
 assert.match(file,/const STAGING_SDK_BOOTSTRAP_ENABLED=false/);
 assert.ok(!file.includes(DOMAIN));
 for(const d of disallowed)assert.ok(!ORIGIN.includes(d));
});
