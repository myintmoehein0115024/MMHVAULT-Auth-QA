'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const URL='https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/n10a720-triple-login-preview.html';
let browser;
const evidence=[];
async function openPage(width=390,height=844){
 const p=await browser.newPage({viewport:{width,height},locale:'zh-CN'});
 const network=[],errors=[];
 p.on('request',r=>{if(r.url()!==URL)network.push(r.url())});
 p.on('pageerror',e=>errors.push(e.message));
 const response=await p.goto(URL,{waitUntil:'domcontentloaded',timeout:26000});
 assert.equal(response.status(),200,'GitHub Pages HTML HTTP 200');
 await p.locator('#demo-form').waitFor();
 return {p,network,errors};
}
test.before(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 // GH Pages propagation: avoid a false negative immediately after commit.
 let ready=false;
 const p=await browser.newPage();
 try{
  for(let n=0;n<16;n++){
    try{
      const response=await p.goto(URL,{waitUntil:'domcontentloaded',timeout:14000});
      const content=await p.content();
      if(response.status()===200 && content.includes('N10-A7.20') && content.includes("connect-src 'none'") && content.includes('const dict=')){ready=true;break}
    }catch{}
    await p.waitForTimeout(3000);
  }
 }finally{await p.close()}
 assert.ok(ready,'live QA preview not yet deployed');
});
test.after(async()=>{await browser?.close()});
test('initial Chinese username tab and clear DEMO markers',async()=>{
 const {p,network,errors}=await openPage();
 try{
  assert.equal(await p.locator('html').getAttribute('lang'),'zh-CN');
  assert.equal(await p.locator('#tab-username').getAttribute('aria-selected'),'true');
  assert.equal(await p.locator('#identityLabel').textContent(),'用户名');
  assert.ok((await p.locator('.chip').textContent()).includes('DEMO'));
  assert.ok((await p.locator('.fineprint').textContent()).includes('不接入 Supabase'));
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
test('username sample succeeds in simulation and has no token/session',async()=>{
 const {p,network,errors}=await openPage();
 try{
  await p.locator('#identity').fill('demo_user');
  await p.locator('#password').fill('not-a-real-password-123');
  await p.locator('#submit').click();
  const status=await p.locator('#status').textContent();
  assert.ok(status.includes('模拟成功'));
  assert.ok(status.includes('没有建立任何 Supabase 会话'));
  assert.equal(await p.locator('#password').inputValue(),'');
  assert.equal(await p.evaluate(()=>localStorage.length+sessionStorage.length),0);
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
 }finally{await p.close()}
});
test('username limits reject malformed or uppercase demos without back end',async()=>{
 const {p,network}=await openPage();
 try{
  for(const value of ['AA','DemoUser','ab!cd']){
    await p.locator('#identity').fill(value);await p.locator('#submit').click();
    assert.ok((await p.locator('#status').textContent()).includes('用户名示例'));
  }
  assert.deepEqual(network,[]);
 }finally{await p.close()}
});
test('email tab switches label/type and renders demo error',async()=>{
 const {p,network}=await openPage();
 try{
  await p.locator('#tab-email').click();
  assert.equal(await p.locator('#identity').getAttribute('type'),'email');
  assert.equal(await p.locator('#identityLabel').textContent(),'邮箱地址');
  assert.equal(await p.locator('#tab-email').getAttribute('aria-selected'),'true');
  await p.locator('#identity').fill('demo@example.invalid');
  await p.locator('#scenario').selectOption('invalid');
  await p.locator('#submit').click();
  assert.ok((await p.locator('#status').textContent()).includes('账号或密码不正确'));
  assert.deepEqual(network,[]);
 }finally{await p.close()}
});
test('Google button opens mock only, Escape closes with focus restored',async()=>{
 const {p,network}=await openPage();
 try{
  await p.locator('#google').click();
  assert.ok((await p.locator('#dialogTitle').textContent()).includes('Google'));
  assert.ok((await p.locator('#dialogText').textContent()).includes('不会跳转 Google'));
  await p.keyboard.press('Escape');
  assert.ok(await p.locator('#dialog').evaluate(e=>e.classList.contains('hidden')));
  assert.equal(await p.evaluate(()=>document.activeElement.id),'google');
  assert.deepEqual(network,[]);
 }finally{await p.close()}
});
test('password reset modal is explanatory only and not a live recovery',async()=>{
 const {p,network}=await openPage();
 try{
  await p.locator('#forgot').click();
  assert.ok((await p.locator('#dialogTitle').textContent()).includes('密码恢复'));
  assert.ok((await p.locator('#dialogText').textContent()).includes('不会发送邮件'));
  await p.locator('#dialogOK').click();
  assert.ok(await p.locator('#dialog').evaluate(e=>e.classList.contains('hidden')));
  assert.deepEqual(network,[]);
 }finally{await p.close()}
});
test('English translation updates labels, notices, example result',async()=>{
 const {p,network}=await openPage();
 try{
  await p.locator('#en').click();
  assert.equal(await p.locator('html').getAttribute('lang'),'en');
  assert.equal(await p.locator('#identityLabel').textContent(),'Username');
  assert.ok((await p.locator('.fineprint').textContent()).includes('No Supabase'));
  await p.locator('#identity').fill('demo_user');await p.locator('#scenario').selectOption('session');
  await p.locator('#submit').click();
  assert.ok((await p.locator('#status').textContent()).includes('remote UID and local UID disagree'));
  await p.locator('#zh').click();
  assert.equal(await p.locator('#identityLabel').textContent(),'用户名');
  assert.deepEqual(network,[]);
 }finally{await p.close()}
});
test('password visibility toggles and hides again',async()=>{
 const {p}=await openPage();
 try{
  assert.equal(await p.locator('#password').getAttribute('type'),'password');
  await p.locator('#reveal').click();
  assert.equal(await p.locator('#password').getAttribute('type'),'text');
  await p.locator('#reveal').click();
  assert.equal(await p.locator('#password').getAttribute('type'),'password');
 }finally{await p.close()}
});
test('CAPTCHA scenario simulates failure without any Cloudflare requests',async()=>{
 const {p,network}=await openPage();
 try{
  await p.locator('#identity').fill('demo_user');
  await p.locator('#scenario').selectOption('captcha');
  await p.locator('#submit').click();
  assert.ok((await p.locator('#status').textContent()).includes('验证码未通过'));
  assert.deepEqual(network,[]);
 }finally{await p.close()}
});
for(const width of [375,390,768,1024,1440]){
 test('responsive no horizontal overflow at '+width+'px',async()=>{
  const {p,network,errors}=await openPage(width,850);
  try{
   const data=await p.evaluate(()=>({
     overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     inputWidth:document.getElementById('identity').getBoundingClientRect().width,
     cardWidth:document.querySelector('.login-card').getBoundingClientRect().width,
     stored:localStorage.length+sessionStorage.length,
     originCalls:performance.getEntriesByType('resource').length
   }));
   assert.ok(data.overflow<=1,'horizontal overflow '+data.overflow);
   assert.ok(data.cardWidth>250&&data.inputWidth>150);
   assert.equal(data.stored,0);assert.equal(data.originCalls,0);
   assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
   evidence.push({width,overflow:data.overflow});
  }finally{await p.close()}
 });
}
test('CSP explicitly disallows external connect/form submissions',async()=>{
 const {p}=await openPage();
 try{
  const attr=await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.ok(attr.includes("connect-src 'none'"));
  assert.ok(attr.includes("form-action 'none'"));
  assert.ok(attr.includes("frame-src 'none'"));
  assert.ok(attr.includes("object-src 'none'"));
 }finally{await p.close()}
});
test('result and modal never contain credential text',async()=>{
 const {p}=await openPage();
 try{
  const token='fake_demo_password_XyZ_1234567';
  await p.locator('#identity').fill('demo_user');
  await p.locator('#password').fill(token);
  await p.locator('#submit').click();
  const pageText=await p.locator('#status').textContent();
  assert.ok(!pageText.includes(token));
  await p.locator('#google').click();
  assert.ok(!(await p.locator('#dialogText').textContent()).includes(token));
  assert.equal(await p.locator('#password').inputValue(),'');
 }finally{await p.close()}
});
// N10-A7.20.1: phone access-first UX must put auth card above the fold.
// 601px+ must retain the full desktop/tablet hero without visual regression.
for (const width of [320,375,393,430,600]) {
 test('mobile-first hide promo and show login card at '+width+'px',async()=>{
  const {p,network,errors}=await openPage(width,852);
  try{
   const v=await p.evaluate(()=>{
    const card=document.querySelector('.login-card');
    const promo=document.querySelector('.hero');
    const chip=document.querySelector('.chip');
    const sub=document.querySelector('.brand-sub');
    const tabs=document.querySelector('.tabbar');
    const head=document.querySelector('header');
    return {
      promo:getComputedStyle(promo).display,
      chip:getComputedStyle(chip).display,
      sub:getComputedStyle(sub).display,
      top:Math.round(card.getBoundingClientRect().top),
      tabBottom:Math.round(tabs.getBoundingClientRect().bottom),
      headBottom:Math.round(head.getBoundingClientRect().bottom),
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      tabWidth:tabs.getBoundingClientRect().width,
      cardWidth:card.getBoundingClientRect().width
    };
   });
   assert.equal(v.promo,'none','Marketing still visible above form');
   assert.equal(v.chip,'none','Long QA chip still visible on phone');
   assert.equal(v.sub,'none','Long brand subtitle still visible on phone');
   assert.ok(v.top<132,'Login card must start near header, got '+v.top);
   assert.ok(v.tabBottom<360,'Login methods must be available quickly, got '+v.tabBottom);
   assert.ok(v.headBottom<80,'Header takes too much height: '+v.headBottom);
   assert.ok(v.overflow<=1,'Horizontal overflow: '+v.overflow);
   assert.ok(v.tabWidth>245 && v.cardWidth>275);
   assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
   console.log('N10A7201_MOBILE',width,JSON.stringify(v));
  }finally{await p.close()}
 });
}
for (const width of [768,1024,1440]) {
 test('tablet-desktop retains decorative hero at '+width+'px',async()=>{
  const {p,network,errors}=await openPage(width,900);
  try{
   assert.notEqual(await p.locator('.hero').evaluate(e=>getComputedStyle(e).display),'none');
   assert.ok(await p.locator('.hero h1').isVisible());
   assert.ok(await p.locator('.hero-stats').isVisible());
   assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
  }finally{await p.close()}
 });
}
test('review output for mobile coverage',()=>{
 console.log('N10A720_UI_VIEWPORTS '+JSON.stringify(evidence));
});
