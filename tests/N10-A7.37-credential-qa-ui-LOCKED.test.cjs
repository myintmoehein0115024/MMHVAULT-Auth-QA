'use strict';
/* N10-A7.37 credential UI QA - real local HTTPS + Chromium, no real auth.
 * Actual Cloudflare Pages is not deployed or modified by this suite.
 */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const https=require('node:https'),{execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const P=require('node:path').resolve('qa/n10-a728-real-sdk/package.json');
const {chromium}=createRequire(P)('playwright-core');
const ROOT=path.resolve('qa/n10a737-preview-dist');
const allowed=['index.html','robots.txt','assets/auth-qa.css','assets/auth-qa.js'];
let dir='',server=null,origin='',browser=null,context=null;
function getConfig(){
 const text=fs.readFileSync(path.join(ROOT,'_headers'),'utf8'),h={};
 assert.match(text,/^\/\*$/m);
 for(const line of text.split(/\r?\n/)){
  if(!/^  [A-Za-z][A-Za-z0-9-]*:/.test(line))continue;
  const pos=line.indexOf(':'),name=line.slice(2,pos);
  assert.equal(Object.hasOwn(h,name),false);
  h[name]=line.slice(pos+1).trim();
 }
 return h;
}
const policy=getConfig();
function serve(req,res){
 const u=new URL(req.url,'https://127.0.0.1');
 let rel=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(!allowed.includes(rel))rel=null;
 const file=rel&&path.join(ROOT,rel),valid=file&&fs.existsSync(file);
 const status=valid?200:404,bytes=valid?fs.readFileSync(file):Buffer.from('NOT FOUND');
 const type=rel?.endsWith('.js')?'text/javascript; charset=utf-8':
  rel?.endsWith('.css')?'text/css; charset=utf-8':
  rel?.endsWith('.txt')?'text/plain; charset=utf-8':'text/html; charset=utf-8';
 res.writeHead(status,{...policy,'Content-Type':type,'Content-Length':bytes.length});
 res.end(req.method==='HEAD'?undefined:bytes);
}
function head(rel='/'){
 return new Promise((resolve,reject)=>{
  const req=https.request(origin+rel,{method:'HEAD',rejectUnauthorized:false,timeout:5000},res=>{
   res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:res.headers}));
  });
  req.on('error',reject);req.end();
 });
}
test.before(async()=>{
 assert.ok(fs.existsSync(path.join(ROOT,'index.html')),'Build first');
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'mmh-a737-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
  '-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),
  '-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],
  {stdio:'ignore',timeout:10000});
 server=https.createServer({key:fs.readFileSync(path.join(dir,'key.pem')),
  cert:fs.readFileSync(path.join(dir,'cert.pem'))},serve);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='https://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block',acceptDownloads:false});
});
test.after(async()=>{
 await context?.close();await browser?.close();
 if(server?.listening)await new Promise(resolve=>server.close(resolve));
 if(dir)fs.rmSync(dir,{recursive:true,force:true});
});
async function pageFor(width=390){
 const p=await context.newPage(),external=[],errors=[];
 await p.setViewportSize({width,height:844});
 p.on('request',r=>{if(!r.url().startsWith(origin+'/'))external.push(r.url())});
 p.on('pageerror',e=>errors.push(e.message));
 const resp=await p.goto(origin+'/',{waitUntil:'load',timeout:15000});
 assert.equal(resp.status(),200);
 return {p,external,errors};
}
const inputIds=['login-identity','login-password','register-username','register-email',
 'register-password','register-confirm','recovery-email'];
const submitIds=['login-submit','register-submit','recovery-submit'];
test('real local TLS HEAD delivers response-level CSP, HSTS, no-cache, no-index',async()=>{
 const res=await head('/');
 assert.equal(res.status,200);
 assert.match(res.headers['content-security-policy']||'',/connect-src 'none'/);
 assert.match(res.headers['content-security-policy']||'',/frame-ancestors 'none'/);
 assert.match(res.headers['content-security-policy']||'',/form-action 'none'/);
 assert.equal(res.headers['x-frame-options'],'DENY');
 assert.equal(res.headers['x-content-type-options'],'nosniff');
 assert.equal(res.headers['cache-control'],'no-store, private, max-age=0');
 assert.equal(res.headers['referrer-policy'],'no-referrer');
 assert.equal(res.headers['x-robots-tag'],'noindex, nofollow, noarchive');
 assert.equal(res.headers['cross-origin-opener-policy'],'same-origin');
 assert.equal(res.headers['strict-transport-security'],'max-age=31536000');
});
test('CSS and JS are served with same strict HTTP security policy',async()=>{
 for(const file of ['/assets/auth-qa.js','/assets/auth-qa.css']){
  const res=await head(file);
  assert.equal(res.status,200);
  assert.equal(res.headers['content-security-policy'],policy['Content-Security-Policy']);
  assert.match(res.headers['cache-control'],/^no-store/);
 }
});
test('no hidden login endpoints or OAuth callbacks served by preview',async()=>{
 for(const file of ['/auth/callback','/functions/v1/mmh-n10a6-username','/.env']){
  const res=await head(file);
  assert.equal(res.status,404);
  assert.equal(res.headers['x-frame-options'],'DENY');
 }
});
test('initial page shows login/username but disables ALL 7 credentials and 3 submit actions',async()=>{
 const a=await pageFor();
 try{
  assert.equal(await a.p.locator('#view-login').getAttribute('aria-selected'),'true');
  assert.equal(await a.p.locator('#method-username').getAttribute('aria-selected'),'true');
  assert.equal(await a.p.locator('#login-content').isVisible(),true);
  for(const id of [...inputIds,...submitIds]){
   const el=a.p.locator('#'+id);assert.equal(await el.isDisabled(),true,id);
  }
  const s=await a.p.evaluate(()=>({local:localStorage.length,
   session:sessionStorage.length,cookie:document.cookie}));
  assert.deepEqual(s,{local:0,session:0,cookie:''});
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
 }finally{await a.p.close()}
});
test('username and email login switch labels and never unlock forms',async()=>{
 const a=await pageFor();
 try{
  await a.p.locator('#method-email').click();
  assert.equal(await a.p.locator('#login-identity-label').textContent(),'邮箱地址');
  assert.equal(await a.p.locator('#login-identity').getAttribute('type'),'email');
  assert.equal(await a.p.locator('#login-identity').isDisabled(),true);
  await a.p.locator('#method-username').click();
  assert.equal(await a.p.locator('#login-identity-label').textContent(),'用户名');
  assert.equal(await a.p.locator('#login-identity').getAttribute('maxlength'),'20');
  assert.equal(await a.p.locator('#login-submit').isDisabled(),true);
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
 }finally{await a.p.close()}
});
test('Google login is visual only and never navigates to OAuth',async()=>{
 const a=await pageFor();
 try{
  await a.p.locator('#method-google').click();
  assert.equal(await a.p.locator('#google-fields').isVisible(),true);
  assert.equal(await a.p.locator('#login-fields').isVisible(),false);
  assert.match(await a.p.locator('#login-submit').textContent(),/Google/);
  assert.equal(await a.p.locator('#login-submit').isDisabled(),true);
  assert.equal(a.p.url(),origin+'/');
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
 }finally{await a.p.close()}
});
test('register tab renders username/email/password/confirm, with no active registration',async()=>{
 const a=await pageFor();
 try{
  await a.p.locator('#view-register').click();
  assert.equal(await a.p.locator('#register-content').isVisible(),true);
  assert.equal(await a.p.locator('#login-content').isVisible(),false);
  assert.equal(await a.p.locator('#view-register').getAttribute('aria-selected'),'true');
  for(const id of ['register-username','register-email','register-password','register-confirm','register-submit']){
   assert.equal(await a.p.locator('#'+id).isDisabled(),true,id);
  }
  assert.equal(await a.p.locator('#register-username').getAttribute('maxlength'),'20');
  assert.equal(await a.p.locator('#register-password').getAttribute('minlength'),'6');
  assert.equal(await a.p.locator('#register-password').getAttribute('maxlength'),'20');
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
 }finally{await a.p.close()}
});
test('reset tab never sends mail and cannot unlock password reset',async()=>{
 const a=await pageFor();
 try{
  await a.p.locator('#view-recovery').click();
  assert.equal(await a.p.locator('#recovery-content').isVisible(),true);
  assert.equal(await a.p.locator('#register-content').isVisible(),false);
  assert.equal(await a.p.locator('#recovery-email').isDisabled(),true);
  assert.equal(await a.p.locator('#recovery-submit').isDisabled(),true);
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
 }finally{await a.p.close()}
});
test('Chinese / English translation remains consistent across all 3 views',async()=>{
 const a=await pageFor();
 try{
  await a.p.locator('#lang-en').click();
  assert.equal(await a.p.locator('h1').textContent(),'Welcome to MMHVAULT');
  await a.p.locator('#view-register').click();
  assert.equal(await a.p.locator('#register-content .subheading').textContent(),'New account registration preview');
  await a.p.locator('#view-recovery').click();
  assert.equal(await a.p.locator('#recovery-content .subheading').textContent(),'Reset password using email');
  await a.p.locator('#view-login').click();
  await a.p.locator('#method-email').click();
  assert.equal(await a.p.locator('#login-identity-label').textContent(),'Email address');
  await a.p.locator('#lang-zh').click();
  assert.equal(await a.p.locator('h1').textContent(),'欢迎来到 MMHVAULT');
  assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
 }finally{await a.p.close()}
});
for(const scenario of ['duplicate','weak_password','uid','rls','captcha','reset']){
 test('offline '+scenario+' scenario never changes REAL NOT RUN checklist',async()=>{
  const a=await pageFor();
  try{
   await a.p.locator('#mock-case').selectOption(scenario);
   await a.p.locator('#mock-run').click();
   assert.match(await a.p.locator('#mock-result').textContent(),/模拟/);
   assert.equal(await a.p.locator('#mock-result').getAttribute('role'),'status');
   const values=await a.p.locator('.checklist strong').allTextContents();
   assert.deepEqual(values,Array(5).fill('NOT RUN'));
   assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
  }finally{await a.p.close()}
 });
}
test('real CSP prevents inline script injection and remote SDK fetch',async()=>{
 const a=await pageFor();
 try{
  const x=await a.p.evaluate(async()=>{
   const s=document.createElement('script');
   s.textContent="window.__MMH_AUTH_QA_PWNED = true";
   document.body.appendChild(s);
   let network='UNKNOWN';
   try{await fetch('https://ldivswlhtgmznzwhzsoi.supabase.co/auth/v1/token');network='BAD'}
   catch{network='CSP_BLOCKED'}
   return {ran:window.__MMH_AUTH_QA_PWNED===true,network};
  });
  assert.deepEqual(x,{ran:false,network:'CSP_BLOCKED'});
  assert.deepEqual(a.external,[]);
 }finally{await a.p.close()}
});
test('simulated credential value can never persist across view change / pageshow',async()=>{
 const a=await pageFor();
 try{
  await a.p.evaluate(()=>{
   document.getElementById('login-identity').value='NOT_REAL';
   document.getElementById('login-password').value='SYNTHETIC';
  });
  await a.p.locator('#view-register').click();
  await a.p.locator('#view-login').click();
  assert.equal(await a.p.locator('#login-identity').inputValue(),'');
  assert.equal(await a.p.locator('#login-password').inputValue(),'');
  assert.equal(await a.p.locator('#login-submit').isDisabled(),true);
  assert.deepEqual(a.external,[]);
 }finally{await a.p.close()}
});
for(const width of [320,350,375,390,428,620,768,1024,1440]){
 test('responsive UI at '+width+'px no overflow and all forms remain disabled',async()=>{
  const a=await pageFor(width);
  try{
   const v=await a.p.evaluate(()=>({
    viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    disabled:document.getElementById('login-submit').disabled,
    formWidth:document.querySelector('.auth-panel').getBoundingClientRect().width
   }));
   assert.ok(v.scrollWidth<=v.viewport+1,'overflow: '+JSON.stringify(v));
   assert.equal(v.disabled,true);assert.ok(v.formWidth>200);
   assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);
  }finally{await a.p.close()}
 });
}
test('cloud live Pages build remains isolated and never imports A7.37 review UI',()=>{
 const build=fs.readFileSync('hosting/N10-A7.32-build-quarantined-preview.cjs','utf8');
 assert.ok(!build.includes('n10a737'));
 assert.ok(build.includes('hosting/n10a732-preview'));
 assert.ok(!fs.existsSync('hosting/n10a732-preview/qa-login.html'));
});
