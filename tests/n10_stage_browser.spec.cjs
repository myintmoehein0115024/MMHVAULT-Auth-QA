const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ENTRY = 'https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/n10-mfa-stage.html';
const PROJECT = 'ldivswlhtgmznzwhzsoi';
const UID = '11111111-1111-4111-8111-111111111111';
const HTML = fs.readFileSync(path.join(__dirname,'../n10-mfa-stage.html'),'utf8');
const token = (aal,uid=UID) => {
  const data = x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  return data({alg:'HS256',typ:'JWT'})+'.'+data({sub:uid,iss:'https://'+PROJECT+'.supabase.co/auth/v1',exp:Math.floor(Date.now()/1000)+3600,aal})+'.synthetic-ui-only';
};
async function mockedPage(page,{failLogin=false,wrongVerifiedSubject=false}={}) {
  let factorVerified = false, enrolled = false;
  await page.route(ENTRY,route=>route.fulfill({status:200,contentType:'text/html',body:HTML}));
  await page.route('**/auth/v1/**',route=>{
    const u = new URL(route.request().url()), suffix=u.pathname.replace('/auth/v1','');
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*','cache-control':'no-store'}});
    if(suffix==='/token' && u.searchParams.get('grant_type')==='password')
      return failLogin?reply({error_code:'invalid_credentials'},401):reply({access_token:token('aal1'),user:{id:UID}});
    if(suffix==='/user') return reply({id:UID,factors:factorVerified?[{id:'factor-qa-1',factor_type:'totp',status:'verified'}]:[]});
    if(suffix==='/factors' && route.request().method()==='POST') {
      enrolled=true;
      return reply({id:'factor-qa-1',totp:{secret:'SYNTHETIC-NEVER-USE',qr_code:'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')}});
    }
    if(suffix==='/factors/factor-qa-1/challenge') return reply({id:'challenge-qa-1'});
    if(suffix==='/factors/factor-qa-1/verify'){
      factorVerified=true;
      return reply({access_token:token('aal2',wrongVerifiedSubject?'22222222-2222-4222-8222-222222222222':UID)});
    }
    if(suffix==='/logout')return reply({});
    return reply({error_code:'no_mock'},404);
  });
  await page.route('**/*',route=>route.abort('blockedbyclient'));
  // Last route has priority in Playwright; allow the two explicit matches above.
  await page.unroute('**/*');
  await page.goto(ENTRY,{waitUntil:'domcontentloaded'});
}
for(const size of [{width:390,height:844},{width:1440,height:900}]){
  test('Staging MFA acceptance UI: '+size.width,async({page})=>{
    await page.setViewportSize(size);
    await mockedPage(page);
    await expect(page.locator('#login')).toBeEnabled();
    await page.locator('#email').fill('qa@example.test');
    await page.locator('#password').fill('staging-test-pass');
    await page.locator('#login').click();
    await expect(page.locator('#authStatus')).toContainText('Staging Auth');
    await expect(page.locator('#password')).toHaveValue('');
    await expect(page.locator('#result')).toContainText('AAL1');
    await page.locator('#enroll').click();
    await expect(page.locator('#setup')).toBeVisible();
    await page.locator('#reveal').click();
    await expect(page.locator('#privateQr')).toBeVisible();
    await page.locator('#conceal').click();
    await expect(page.locator('#privateQr')).not.toBeVisible();
    await page.locator('#otp').fill('123456');
    await page.locator('#verify').click();
    await expect(page.locator('#result')).toContainText('PASS');
    await expect(page.locator('#result')).toContainText('AAL2');
    await expect(page.locator('#otp')).toHaveValue('');
    const rect=await page.locator('main').boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.x+rect.width).toBeLessThanOrEqual(size.width+1);
    const persisted=await page.evaluate(()=>[localStorage.length,sessionStorage.length]);
    expect(persisted).toEqual([0,0]);
    await page.locator('#logout').click();
    await expect(page.locator('#authStatus')).toContainText('已退出');
  });
  test('real-JWT acceptance UI verifies RLS, RPC and Storage: '+size.width,async({page})=>{
    await page.setViewportSize(size);await mockedPage(page);
    const getAal=(request)=>{
      const tok=request.headers()['authorization']?.replace(/^Bearer /i,'');
      if(!tok) return null;
      try{return JSON.parse(Buffer.from(tok.split('.')[1],'base64url').toString()).aal}catch{return null}
    };
    await page.route('**/rest/v1/**',route=>{
      const a=getAal(route.request());
      const path=new URL(route.request().url()).pathname;
      const reply=(body,status=200)=>route.fulfill({
        status,contentType:'application/json',
        body:JSON.stringify(body),
        headers:{'access-control-allow-origin':'*'}
      });
      if(path.includes('/rpc/mmh_n10_qa_privileged_read')){
        const owner=route.request().postDataJSON()?.p_expected_uid;
        if(a!=='aal2'||owner!==UID)return reply({code:'42501',message:'not authorized'},403);
        return reply(true);
      }
      if(path.includes('/mmh_n10_signed_qa_entries')){
        return reply(a==='aal2'?[{user_id:UID,marker:'N10-ISOLATED-STAGING-ONLY'}]:[]);
      }
      return reply({message:'unexpected route'},404);
    });
    await page.route('**/storage/v1/**',route=>{
      const a=getAal(route.request());
      if(a!=='aal2')return route.fulfill({status:403,contentType:'application/json',body:'{"message":"denied"}'});
      const method=route.request().method();
      if(method==='GET')return route.fulfill({status:200,contentType:'text/plain',body:'N10-STAGING-SYNTHETIC-FILE'});
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    });
    await page.locator('#email').fill('qa@example.test');
    await page.locator('#password').fill('not-a-real-password');
    await page.locator('#login').click();
    await expect(page.locator('#acceptance')).toBeDisabled();
    await page.locator('#enroll').click();
    await page.locator('#otp').fill('123456');
    await page.locator('#verify').click();
    await expect(page.locator('#acceptance')).toBeEnabled();
    await page.locator('#acceptance').click();
    await expect(page.locator('#acceptanceStatus')).toContainText('全部 PASS');
    const results=await page.locator('#acceptanceResults').textContent();
    expect(results).not.toMatch(/FAIL|未完成/);
    expect((results.match(/✅ PASS/g)||[]).length).toBe(11);
    const stored=await page.evaluate(()=>[localStorage.length,sessionStorage.length]);
    expect(stored).toEqual([0,0]);
  });

  test('Staging credential error clears password: '+size.width,async({page})=>{
    await page.setViewportSize(size);await mockedPage(page,{failLogin:true});
    await page.locator('#email').fill('qa@example.test');
    await page.locator('#password').fill('not-the-password');
    await page.locator('#login').click();
    await expect(page.locator('#authStatus')).toContainText('invalid_credentials');
    await expect(page.locator('#password')).toHaveValue('');
    await expect(page.locator('#verify')).toBeDisabled();
  });
  test('MFA wrong subject cannot pass Auth validation: '+size.width,async({page})=>{
    await page.setViewportSize(size);await mockedPage(page,{wrongVerifiedSubject:true});
    await page.locator('#email').fill('qa@example.test');
    await page.locator('#password').fill('test-only');
    await page.locator('#login').click();
    await page.locator('#enroll').click();
    await page.locator('#otp').fill('123456');
    await page.locator('#verify').click();
    await expect(page.locator('#factorStatus')).toContainText('验证失败');
    await expect(page.locator('#result')).not.toContainText('PASS');
  });
}
