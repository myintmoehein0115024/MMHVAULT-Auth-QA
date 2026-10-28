/**
 * N10-A7.8 isolated browser-flow regression. Synthetic accounts only.
 * The live Staging QA HTML is fetched; Supabase SDK is replaced in memory.
 * No passwords, real JWTs or requests to Supabase / Google.
 */
const { chromium } = require('playwright-core');
const URL='https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/n10a75-real-jwt-owner-qa.html';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
function mockSDK(sameUid,wrongOwner){
  const KEY='n10a78_fake_current_user';
  const email='11111111-1111-4111-8111-111111111111';
  const google=sameUid?email:'22222222-2222-4222-8222-222222222222';
  const who=()=>sessionStorage.getItem(KEY);
  const uid=()=>who()==='email'?email:who()==='google'?google:null;
  const identity=()=>uid()?{id:uid(),app_metadata:{providers:[who()]}}:null;
  const session=()=>uid()?{user:{id:uid()},access_token:'fake-token-only'}:null;
  window.supabase={createClient:()=>({
    auth:{
      getUser:async()=>({data:{user:identity()},error:null}),
      getSession:async()=>({data:{session:session()},error:null}),
      signInWithPassword:async()=>{sessionStorage.setItem(KEY,'email');return {error:null}},
      signInWithOAuth:async()=>{sessionStorage.setItem(KEY,'google');return {error:null}},
      signOut:async()=>{sessionStorage.removeItem(KEY);return {error:null}},
      refreshSession:async()=>({data:{session:session()},error:null})
    },
    from:(table)=>({
      select:()=>({
        limit:async()=>{
          if(table!=='mmh_n10a6_auth_owner_probe')return {data:null,error:{code:'42P01'},status:404};
          if(!uid())return {data:null,error:{code:'42501'},status:401};
          return {data:[{user_id:wrongOwner?'33333333-3333-4333-8333-333333333333':uid()}],error:null,status:200};
        }
      })
    })
  })};
}
async function exercise(browser,name,{sameUid=false,wrongOwner=false,complete=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[],outbound=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.route('https://ldivswlhtgmznzwhzsoi.supabase.co/**',r=>{outbound.push('unexpected call');return r.abort()});
  await page.route('**/n10a75-real-jwt-owner-qa.html',async route=>{
    const response=await route.fetch();
    if(response.status()!==200)throw Error('Live page did not return HTTP 200');
    let html=await response.text();
    const rx=/<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.57\.4\/dist\/umd\/supabase\.min\.js"[^>]*><\/script>/;
    if(!rx.test(html))throw Error('Expected pinned SDK script absent');
    const fake='('+mockSDK.toString()+')('+JSON.stringify(sameUid)+','+JSON.stringify(wrongOwner)+');';
    html=html.replace(rx,'<script>'+fake+'</script>');
    await route.fulfill({response,contentType:'text/html',body:html});
  });
  try{
    const r=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
    if(r.status()!==200)throw Error('HTTP status mismatch');
    await page.waitForFunction(()=>document.querySelector('#results')?.textContent?.includes('已准备就绪'),null,{timeout:15000});
    if(!await page.locator('#google').isDisabled())throw Error('Google step enabled too early');
    await page.locator('#email').fill('fake-qa@example.invalid');
    await page.locator('#pass').fill('placeholder-is-not-a-real-secret');
    await page.locator('#login button[type="submit"]').click();
    if(wrongOwner){
      await page.waitForFunction(()=>document.querySelector('#results')?.textContent?.includes('RLS 归属校验失败'),null,{timeout:12000});
      const state=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mmh_n10a77_qa_stage')||'{}'));
      if(state.emailPass||state.stage==='done')throw Error('Bad RLS owner incorrectly marked passed');
      console.log('SCENARIO '+name+' PASS: wrong owner rejected');
      return;
    }
    await page.waitForFunction(()=>document.querySelector('#results')?.textContent?.includes('邮箱真实 JWT'),null,{timeout:12000});
    await page.locator('#safe-logout').click();
    await page.waitForFunction(()=>document.querySelector('#results')?.textContent?.includes('匿名状态无法读取'),null,{timeout:12000});
    await page.locator('#google').click();
    await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mmh_n10a77_qa_stage')||'{}').stage==='google_pending',null,{timeout:12000});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{
      const state=JSON.parse(sessionStorage.getItem('mmh_n10a77_qa_stage')||'{}');
      const content=document.querySelector('#results')?.textContent||'';
      return state.stage==='done'||content.includes('初始化失败');
    },null,{timeout:12000});
    const state=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mmh_n10a77_qa_stage')||'{}'));
    if(complete){
      if(state.stage!=='done'||!state.emailPass||!state.logoutPass||!state.googlePass||!state.distinctPass||!state.refreshPass)
        throw Error('Different UID flow did not complete');
      const summary=await page.locator('#results').textContent();
      if(!summary.includes('Result: PASS')||summary.includes(A)||summary.includes(B))
        throw Error('Unexpected summary or raw UID exposed');
      console.log('SCENARIO '+name+' PASS: distinct email and Google UID, RLS, refresh, logout');
    }else{
      if(state.stage==='done'||state.googlePass||state.distinctPass)
        throw Error('Same UID incorrectly accepted');
      const msg=await page.locator('#results').textContent();
      if(!msg.includes('UID'))throw Error('Missing user-friendly repeat UID error');
      console.log('SCENARIO '+name+' PASS: same UID rejected');
    }
  }finally{
    await context.close();
    if(errors.length||outbound.length)
      throw Error('Unexpected browser error or real network call: '+JSON.stringify({errors,outbound}));
  }
}
(async()=>{
  const browser=await chromium.launch({
    executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
    headless:true,args:['--no-sandbox']
  });
  try{
    await exercise(browser,'different-UID-success',{complete:true});
    await exercise(browser,'same-UID-rejection',{sameUid:true});
    await exercise(browser,'invalid-RLS-owner-rejection',{wrongOwner:true});
    console.log('N10A78_SYNTHETIC_BROWSER_FLOW 3/3 PASS');
  }finally{await browser.close()}
})().catch(err=>{console.error('N10A78_TEST_FAILED',err.stack||err);process.exitCode=1});
