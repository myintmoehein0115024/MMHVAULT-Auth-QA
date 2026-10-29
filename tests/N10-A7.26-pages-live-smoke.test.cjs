'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const SITE='https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/n10a726-staging-acceptance-LOCKED.html';
const ORIGIN='https://myintmoehein0115024.github.io';
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BINARY||'/usr/bin/google-chrome',args:['--no-sandbox']})});
test.after(async()=>{await browser?.close()});
for(const width of [375,390,768,1440]){
 test('deployed QA Pages zero-auth smoke '+width+'px',async()=>{
  const p=await browser.newPage({viewport:{width,height:820},locale:'zh-CN'});
  const external=[],errors=[];
  p.on('request',r=>{if(!r.url().startsWith(ORIGIN+'/MMHVAULT-Auth-QA/'))external.push(r.url())});
  p.on('pageerror',e=>errors.push(e.message));
  try{
   let ready=false;
   for(let n=0;n<18;n++){
     try{
       const r=await p.goto(SITE,{waitUntil:'load',timeout:12000});
       if(r?.status()===200 && (await p.locator('#lock-label').textContent()).includes('硬锁关闭')
         && (await p.locator('#real-run').isDisabled())){ready=true;break}
     }catch{}
     await p.waitForTimeout(3000);
   }
   assert.ok(ready,'QA GitHub Pages has not propagated with all assets');
   const d=await p.evaluate(()=>({horizontal:document.documentElement.scrollWidth-document.documentElement.clientWidth,storage:localStorage.length+sessionStorage.length}));
   assert.ok(d.horizontal<=1,'overflow '+d.horizontal);assert.equal(d.storage,0);
   assert.equal(await p.locator('#window-status').textContent(),'尚未查询 / 未验证');
   assert.equal(await p.locator('#result-uid').textContent(),'NOT RUN');
   assert.equal(await p.locator('#locked-password').isDisabled(),true);
   assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  }finally{await p.close()}
 });
}
