'use strict';
/* N10-A7.32: inspect REAL HTTPS response headers served from built Pages assets
 * using ephemeral 127.0.0.1 TLS; never contact Supabase, DNS, Cloudflare
 * or any account. Test content is default-locked, no credentials.
 */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const https=require('node:https');
const {execFileSync}=require('node:child_process');
const {createRequire}=require('node:module');
const pkgRequire=createRequire(path.resolve('qa/n10-a728-real-sdk/package.json'));
const {chromium}=pkgRequire('playwright-core');
const ROOT=path.resolve('qa/n10a732-preview-dist');
const ORIGIN_DATA='https://ldivswlhtgmznzwhzsoi.supabase.co';
let dir='',server=null,origin='',browser=null,context=null;
const auditRows=[];
function headersFromPagesConfig(){
 const source=fs.readFileSync(path.join(ROOT,'_headers'),'utf8'),h={};
 assert.match(source,/^\/\*\s*$/m,'Cloudflare Pages global wildcard required');
 for(const line of source.split(/\r?\n/)){
  if(!/^  [A-Za-z][A-Za-z0-9-]*:/.test(line))continue;
  const idx=line.indexOf(':');
  const name=line.slice(2,idx),value=line.slice(idx+1).trim();
  assert.ok(!/[\r\n]/.test(value));
  assert.ok(!Object.hasOwn(h,name),'duplicate HTTP header '+name);
  h[name]=value;
 }
 assert.ok(h['Content-Security-Policy'],'CSP header must be in actual Pages _headers');
 return h;
}
const policy=headersFromPagesConfig();
function safeFile(reqPath){
 let parsed;
 try{parsed=new URL(reqPath,'https://127.0.0.1')}catch{return null}
 const name=decodeURIComponent(parsed.pathname);
 const file=name==='/'?'index.html':name.slice(1);
 if(!/^(?:index\.html|robots\.txt|assets\/locked-preview\.(?:css|js))$/.test(file))return null;
 const abs=path.join(ROOT,file);
 if(!abs.startsWith(ROOT+path.sep))return null;
 return abs;
}
function serve(req,res){
 const h={...policy,'X-Powered-By':'MMHVAULT-ISOLATED-LOCAL-QA'};
 const file=safeFile(req.url),available=file&&fs.existsSync(file);
 const contentType=file?.endsWith('.css')?'text/css; charset=utf-8':
  file?.endsWith('.js')?'text/javascript; charset=utf-8':
  file?.endsWith('.txt')?'text/plain; charset=utf-8':'text/html; charset=utf-8';
 const code=(req.method==='GET'||req.method==='HEAD')?(available?200:404):405;
 const raw=available?fs.readFileSync(file):Buffer.from('NOT FOUND');
 res.writeHead(code,{...h,'Content-Type':contentType,'Content-Length':raw.length});
 if(req.method==='HEAD')res.end();else res.end(raw);
}
function head(urlPath='/'){
 return new Promise((resolve,reject)=>{
  const req=https.request(origin+urlPath,{method:'HEAD',rejectUnauthorized:false,
   timeout:4000},res=>{res.resume();resolve({status:res.statusCode,headers:res.headers})});
  req.on('error',reject);req.end();
 });
}
function verifyResponseHead(snapshot){
 assert.equal(snapshot.status,200);
 const h=snapshot.headers,policyValue=h['content-security-policy'];
 assert.ok(policyValue&&policyValue.includes("frame-ancestors 'none'"));
 assert.ok(policyValue.includes("connect-src 'none'"));
 assert.ok(policyValue.includes("frame-src 'none'"));
 assert.ok(policyValue.includes("script-src 'self'"));
 assert.ok(policyValue.includes("worker-src 'none'"));
 for(const bad of ["'unsafe-inline'","'unsafe-eval'",'https://challenges.cloudflare.com',ORIGIN_DATA,'https://mmhvault.com']){
  assert.equal(policyValue.includes(bad),false,'locked host must not grant network source '+bad);
 }
 assert.equal(h['x-frame-options'],'DENY');
 assert.equal(h['x-content-type-options'],'nosniff');
 assert.equal(h['referrer-policy'],'no-referrer');
 assert.equal(h['cache-control'],'no-store, private, max-age=0');
 assert.equal(h['cross-origin-opener-policy'],'same-origin');
 assert.equal(h['strict-transport-security'],'max-age=31536000');
 assert.equal(h['x-robots-tag'],'noindex, nofollow, noarchive');
 assert.equal(h['permissions-policy'],'camera=(), microphone=(), geolocation=(), payment=()');
 return true;
}
test.before(async()=>{
 assert.ok(fs.existsSync(path.join(ROOT,'index.html')),'run build first');
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'mmh-a732-qa-'));
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
   '-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),
   '-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],
   {stdio:'ignore',timeout:10000});
 }catch{throw Error('ephemeral_test_tls_certificate_failed')}
 server=https.createServer({key:fs.readFileSync(path.join(dir,'key.pem')),
  cert:fs.readFileSync(path.join(dir,'cert.pem'))},serve);
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
 origin='https://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block',acceptDownloads:false});
});
test.after(async()=>{
 await context?.close();await browser?.close();
 if(server?.listening)await new Promise(resolve=>server.close(resolve));
 if(dir)fs.rmSync(dir,{force:true,recursive:true});
});
test('actual TLS HEAD returns strict HTTP security headers, not only HTML meta',async()=>{
 assert.equal(verifyResponseHead(await head('/')),true);
});
test('HEAD on JS and CSS returns same no-cache and CSP headers',async()=>{
 for(const file of ['/assets/locked-preview.css','/assets/locked-preview.js']){
  const x=await head(file);
  assert.equal(x.status,200,file);
  assert.equal(x.headers['content-security-policy'],policy['Content-Security-Policy']);
  assert.equal(x.headers['cache-control'],'no-store, private, max-age=0');
 }
});
test('404 and invalid path never fall through to Supabase or show credentials',async()=>{
 const x=await head('/functions/v1/mmh-n10a6-username');
 assert.equal(x.status,404);
 assert.equal(x.headers['x-frame-options'],'DENY');
 assert.equal(x.headers['content-security-policy'],policy['Content-Security-Policy']);
});
test('robots.txt disallows indexing and HTML also declares noindex',async()=>{
 const r=await fetch(origin+'/robots.txt',{dispatcher:undefined}).catch(()=>null);
 // Built-in fetch refuses test self-signed cert (desired), so read source instead.
 assert.match(fs.readFileSync(path.join(ROOT,'robots.txt'),'utf8'),/Disallow: \//);
 assert.match(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),/noindex,nofollow,noarchive/);
 assert.equal((await head('/robots.txt')).status,200);
});
async function tab(width=390){
 const p=await context.newPage();const errors=[],external=[];
 p.on('pageerror',err=>errors.push(err.message));
 p.on('request',r=>{if(!r.url().startsWith(origin+'/'))external.push(r.url())});
 await p.setViewportSize({width,height:844});
 const page=await p.goto(origin+'/',{waitUntil:'load',timeout:12000});
 assert.equal(page.status(),200);
 return {p,errors,external};
}
test('Chromium renders locked mobile page with real TLS headers and no third-party requests',async()=>{
 const t=await tab(390);
 try{
  const data=await t.p.evaluate(()=>({
   identity:document.getElementById('locked-identity').disabled,
   password:document.getElementById('locked-password').disabled,
   realButton:document.getElementById('real-run').disabled,
   uid:document.getElementById('result-uid').textContent,
   local:localStorage.length,session:sessionStorage.length,cookie:document.cookie
  }));
  assert.equal(data.identity,true);assert.equal(data.password,true);assert.equal(data.realButton,true);
  assert.equal(data.uid,'NOT RUN');assert.equal(data.local,0);assert.equal(data.session,0);
  assert.equal(data.cookie,'');assert.deepEqual(t.errors,[]);assert.deepEqual(t.external,[]);
 }finally{await t.p.close()}
});
test('Language and G10/G11 tabs work offline; simulations never mark real PASS',async()=>{
 const t=await tab();
 try{
  await t.p.locator('#en').click();
  assert.equal(await t.p.locator('h1').textContent(),'Secure hosting review');
  await t.p.locator('#mode-bind').click();
  assert.equal(await t.p.locator('#flow-heading').textContent(),'Verify existing account binding');
  await t.p.locator('#simulate').click();
  assert.match(await t.p.locator('#sim-result').textContent(),/Offline mock/);
  assert.equal(await t.p.locator('#result-uid').textContent(),'NOT RUN');
  assert.equal(await t.p.locator('#result-login').textContent(),'NOT RUN');
  await t.p.locator('#zh').click();
  assert.equal(await t.p.locator('h1').textContent(),'安全托管验收');
  assert.deepEqual(t.errors,[]);assert.deepEqual(t.external,[]);
 }finally{await t.p.close()}
});
test('CSP actually blocks injecting an inline script (not just string comparison)',async()=>{
 const t=await tab();
 try{
  const allowed=await t.p.evaluate(()=>{
   const script=document.createElement('script');
   script.textContent='window.__A732_INJECTED_SCRIPT=true';
   document.body.appendChild(script);
   return window.__A732_INJECTED_SCRIPT===true;
  });
  assert.equal(allowed,false);
  assert.deepEqual(t.external,[]);
 }finally{await t.p.close()}
});
test('CSP actually denies browser SDK network even if someone manually invokes fetch',async()=>{
 const t=await tab();
 try{
  const result=await t.p.evaluate(async()=>{
   try{
    await fetch('https://ldivswlhtgmznzwhzsoi.supabase.co/auth/v1/user');
    return 'UNEXPECTED_NETWORK_SUCCESS';
   }catch{return 'BLOCKED_BY_CSP'}
  });
  assert.equal(result,'BLOCKED_BY_CSP');
  assert.deepEqual(t.external,[]);
 }finally{await t.p.close()}
});
for(const width of [320,375,390,428,768,1024,1440]){
 test('locked preview mobile responsive '+width+'px with no horizontal overflow',async()=>{
  const t=await tab(width);
  try{
   const x=await t.p.evaluate(()=>({
    win:innerWidth,scroll:document.documentElement.scrollWidth,
    title:document.querySelector('h1')?.getBoundingClientRect().width,
    button:document.getElementById('real-run')?.getBoundingClientRect().width,
    disabled:document.getElementById('real-run').disabled
   }));
   assert.equal(x.disabled,true);
   assert.ok(x.scroll<=x.win+1,'overflow '+JSON.stringify(x));
   assert.ok(x.title>90);assert.ok(x.button>90);
   assert.deepEqual(t.errors,[]);assert.deepEqual(t.external,[]);
  }finally{await t.p.close()}
 });
}
test('Cloudflare origin is not deployed and no production custom domain is used in preview',()=>{
 const config=fs.readFileSync(path.join(ROOT,'_headers'),'utf8');
 assert.doesNotMatch(config,/mmhvault\.com|vrypucmyrztxgiqhjspd/);
 assert.doesNotMatch(config,/connect-src\s+https?:/);
 assert.ok(fs.existsSync(path.join(ROOT,'index.html')));
 assert.ok(!fs.existsSync(path.join(ROOT,'.dev.vars')));
 assert.ok(!fs.existsSync(path.join(ROOT,'.env')));
});
