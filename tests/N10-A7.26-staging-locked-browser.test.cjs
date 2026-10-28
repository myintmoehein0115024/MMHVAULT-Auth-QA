'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const ROOT=path.resolve(__dirname,'..'),PAGE='/n10a726-staging-acceptance-LOCKED.html';
const EDGE='https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username';
const FILES=new Set([PAGE,'/n10a726/staging-locked.js','/n10a726/staging-locked.css']);
let server,browser,base;
const requests=[];
async function pageAt(width=390,height=844){
 const p=await browser.newPage({viewport:{width,height},locale:'zh-CN'});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 p.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postData()||''}));
 const response=await p.goto(base+PAGE,{waitUntil:'load'});
 assert.equal(response.status(),200);
 return {p,errors};
}
test.before(async()=>{
 server=http.createServer((req,res)=>{
   const u=new URL(req.url,'http://localhost');
   if(!FILES.has(u.pathname)){res.writeHead(404);return res.end('Not found')}
   const ext=path.extname(u.pathname);
   res.writeHead(200,{'Content-Type':ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store'});
   res.end(fs.readFileSync(path.join(ROOT,u.pathname)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BINARY||'/usr/bin/google-chrome',args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve))});
test('static project pin and deploy hard gates remain locked',()=>{
 const js=fs.readFileSync(path.join(ROOT,'n10a726/staging-locked.js'),'utf8');
 const html=fs.readFileSync(path.join(ROOT,PAGE),'utf8');
 assert.match(js,/const LIVE_AUTH_ENABLED = false;/);
 assert.match(js,/ldivswlhtgmznzwhzsoi/);
 assert.ok(!js.includes('vrypucmyrztxgiqhjspd'));
 assert.ok(!js.includes('signInWithPassword('));
 assert.ok(!js.includes('setSession('));
 assert.ok(!js.includes('localStorage.setItem'));
 assert.ok(!js.includes('sessionStorage.setItem'));
 assert.match(html,/form-action 'none'/);
 assert.match(html,/script-src 'self'/);
 assert.match(html,/connect-src https:\/\/ldivswlhtgmznzwhzsoi.supabase.co/);
 assert.ok(!html.includes('unsafe-inline'));
 assert.ok(!html.includes('service_role'));
 assert.ok(!html.includes('type="submit"'));
});
test('zero authentication requests, no SDK storage, locked inputs on page load',async()=>{
 requests.length=0;const {p,errors}=await pageAt();
 try{
   assert.equal(await p.locator('#locked-password').isDisabled(),true);
   assert.equal(await p.locator('#locked-identity').isDisabled(),true);
   assert.equal(await p.locator('#real-run').isDisabled(),true);
   assert.equal(await p.locator('#window-status').textContent(),'尚未查询 / 未验证');
   assert.equal(await p.locator('#result-uid').textContent(),'NOT RUN');
   assert.ok(requests.every(x=>x.url.startsWith(base)),'unexpected network calls: '+JSON.stringify(requests));
   assert.equal(await p.evaluate(()=>localStorage.length+sessionStorage.length),0);
   assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
test('mode switch has no network and never permits credentials',async()=>{
 requests.length=0;const {p,errors}=await pageAt();
 try{
  await p.locator('#mode-bind').click();
  assert.equal(await p.locator('#mode-bind').getAttribute('aria-selected'),'true');
  assert.match(await p.locator('#flow-description').textContent(),/唯一用户名绑定/);
  await p.locator('#mode-login').click();
  assert.match(await p.locator('#flow-description').textContent(),/用户名登录/);
  assert.equal(await p.locator('#real-run').isDisabled(),true);
  assert.ok(requests.every(r=>r.url.startsWith(base)));
  assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
test('English and Chinese translations preserve lock, no clipped identity text',async()=>{
 requests.length=0;const {p,errors}=await pageAt();
 try{
  await p.locator('#en').click();
  assert.equal(await p.locator('html').getAttribute('lang'),'en');
  assert.match(await p.locator('#lock-label').textContent(),/HARD LOCKED/);
  await p.locator('#mode-bind').click();
  assert.match(await p.locator('#flow-description').textContent(),/binding/);
  await p.locator('#zh').click();
  assert.equal(await p.locator('html').getAttribute('lang'),'zh-CN');
  assert.match(await p.locator('#flow-description').textContent(),/绑定/);
  assert.equal(await p.locator('#real-run').isDisabled(),true);
  assert.ok(requests.every(r=>r.url.startsWith(base)));
  assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
for(const value of ['closed','invalid','conflict','rate','uid','rls','logout']){
 test('offline scenario '+value+' never alters real results',async()=>{
  requests.length=0;const {p,errors}=await pageAt();
  try{
   await p.locator('#scenario').selectOption(value);await p.locator('#simulate').click();
   assert.match(await p.locator('#sim-result').textContent(),/离线模拟/);
   assert.notEqual(await p.locator('#sim-result').textContent(),'');
   for(const id of ['email','bind','login','uid','rls','logout'])assert.equal(await p.locator('#result-'+id).textContent(),'NOT RUN');
   assert.equal(await p.evaluate(()=>localStorage.length+sessionStorage.length),0);
   assert.ok(requests.every(r=>r.url.startsWith(base)));
   assert.deepEqual(errors,[]);
  }finally{await p.close()}
 });
}
test('manual preflight only sends {action:preflight}; CLOSED confirmed',async()=>{
 requests.length=0;const {p,errors}=await pageAt();
 try{
  await p.route(EDGE,route=>{
    assert.equal(route.request().method(),'POST');
    assert.deepEqual(JSON.parse(route.request().postData()),{action:'preflight'});
    assert.ok(!route.request().headers().authorization);
    assert.ok(!route.request().headers().apikey);
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({code:'preflight_ok',enabled:false,scope:'isolated_staging_only',registration_enabled:false})});
  });
  await p.locator('#preflight').click();
  await p.waitForFunction(()=>document.querySelector('#window-status').textContent.includes('关闭'));
  assert.match(await p.locator('#window-note').textContent(),/没有身份凭据/);
  assert.ok(requests.filter(x=>x.url===EDGE).length===1);
  assert.equal(await p.locator('#real-run').isDisabled(),true);
  assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
test('remote OPEN does not unlock browser or claim G10/G11',async()=>{
 const {p,errors}=await pageAt();
 try{
  await p.route(EDGE,r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({code:'preflight_ok',enabled:true,scope:'isolated_staging_only',registration_enabled:false})}));
  await p.locator('#preflight').click();
  await p.waitForFunction(()=>document.querySelector('#window-dot').classList.contains('open'));
  assert.equal(await p.locator('#real-run').isDisabled(),true);
  assert.equal(await p.locator('#result-uid').textContent(),'NOT RUN');
  assert.equal(await p.locator('#result-rls').textContent(),'NOT RUN');
  assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
for(const response of [
  {name:'registration unexpectedly enabled',value:{code:'preflight_ok',enabled:true,scope:'isolated_staging_only',registration_enabled:true}},
  {name:'wrong scope',value:{code:'preflight_ok',enabled:true,scope:'production',registration_enabled:false}},
  {name:'unexpected payload',value:{code:'login_success',enabled:true,scope:'isolated_staging_only',registration_enabled:false}},
  {name:'error http',status:503,value:{code:'n10a6_disabled'}}
]){
 test('fail closed: '+response.name,async()=>{
  const {p,errors}=await pageAt();
  try{
   await p.route(EDGE,r=>r.fulfill({status:response.status||200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response.value)}));
   await p.locator('#preflight').click();
   await p.waitForFunction(()=>document.querySelector('#window-dot').classList.contains('closed'));
   assert.equal(await p.locator('#real-run').isDisabled(),true);
   assert.deepEqual(errors,[]);
  }finally{await p.close()}
 });
}
for(const width of [320,375,390,428,768,1024,1440]){
 test('responsive overflow and desktop/mobile button visibility '+width,async()=>{
  const {p,errors}=await pageAt(width);
  try{
   const d=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,width:document.querySelector('.glass').getBoundingClientRect().width}));
   assert.ok(d.overflow<=1,'horizontal overflow '+JSON.stringify(d));
   assert.ok(d.width>250);
   assert.equal(await p.locator('#preflight').isVisible(),true);
   assert.equal(await p.locator('#real-run').isDisabled(),true);
   assert.deepEqual(errors,[]);
  }finally{await p.close()}
 });
}
