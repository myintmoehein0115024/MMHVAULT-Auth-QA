// N10 isolated Auth-Staging MFA enrollment UI. PUBLISHED LOCKED, NOT QA-APPROVED.
// No secret/service key, session persistence, analytics, or production endpoints.
// Change BOTH time window and flag ONLY after new explicit owner approval.
const QA_RELEASED = false;
const QA_WINDOW_END_UTC = '1970-01-01T00:00:00.000Z';
const PROJECT = 'https://ldivswlhtgmznzwhzsoi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_LxIB8564OZD48HQ8Mfsc0A_apkgERZo'; // Staging publishable/browser key, NOT a secret.
const EXPECTED_ORIGIN = 'https://myintmoehein0115024.github.io';
const EXPECTED_PATH = '/MMHVAULT-Auth-QA/n10-joint-mfa-bind-20261101.html';
const ACCOUNT_EMAIL = 'n10-joint-mfa-a-20261101@no-mail.mmhvault.invalid';
const ACCOUNT_UID = 'be5ec3b7-a35f-4a53-b2b7-0ff77a01fc4f';
const QA_OPEN = QA_RELEASED &&
  Number.isFinite(Date.parse(QA_WINDOW_END_UTC)) &&
  Date.now() < Date.parse(QA_WINDOW_END_UTC) &&
  location.origin === EXPECTED_ORIGIN &&
  location.pathname === EXPECTED_PATH;
// A page may remain open past its QA deadline; re-evaluate time on EVERY
// sensitive interaction and after asynchronous Auth calls, not just on load.
function qaWindowActive(){return QA_OPEN && Date.now() < Date.parse(QA_WINDOW_END_UTC);}
const $ = id => document.getElementById(id);
let client = null;
let enrollingFactor = '';
let flowVersion = 0;
let qrTimer = null;
let busy = false;
function status(message){$('message').textContent=message;}
function hideQr(){
  if(qrTimer!==null){clearTimeout(qrTimer);qrTimer=null;}
  $('totpQr').removeAttribute('src');
  $('qrBox').hidden=true;
  $('totpCode').value='';
}
function clearPrivate(){
  hideQr();
  $('qaPassword').value='';
  $('totpCode').value='';
}
function resetVisible(){
  $('enrollPanel').hidden=true;
  $('successPanel').hidden=true;
  $('loginForm').hidden=false;
}
function alive(version){return qaWindowActive()&&version===flowVersion&&!document.hidden;}
function lockBusy(on){
  busy=on;
  $('loginButton').disabled=on||!qaWindowActive();
  $('verifyButton').disabled=on||!qaWindowActive();
  $('cancelButton').disabled=on||!qaWindowActive();
}
async function getClient(){
  if(!qaWindowActive())throw Error('qa_closed');
  if(client)return client;
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
  client=createClient(PROJECT,PUBLIC_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{headers:{'x-client-info':'mmhvault-n10-staging-qa'}}
  });
  return client;
}
async function verifyOwner(db){
  const res=await db.auth.getUser();
  return !res.error&&res.data?.user?.id===ACCOUNT_UID&&
    String(res.data.user.email||'').toLowerCase()===ACCOUNT_EMAIL&&
    res.data.user.email_confirmed_at!=null&&
    res.data.user.is_anonymous!==true&&
    res.data.user.app_metadata?.mmhvault_auth_kind==null;
}
async function closeSession({removePending=true}={}){
  flowVersion++;
  clearPrivate();
  resetVisible();
  const pending=enrollingFactor;
  enrollingFactor='';
  const db=client;
  if(db){
    if(removePending&&pending){
      try{
        if(await verifyOwner(db)){
          await db.auth.mfa.unenroll({factorId:pending});
        }
      }catch(_){}
    }
    try{await db.auth.signOut({scope:'local'});}catch(_){}
  }
}
function sessionError(){status('测试登录或验证未完成，请重新确认账户及网络。不要分享您的密码或动态验证码。');}
async function doLogin(event){
  event.preventDefault();
  if(!qaWindowActive()||busy)return;
  const pass=$('qaPassword').value;
  $('qaPassword').value='';
  if(pass.length<6||pass.length>128){status('测试密码长度不符合要求。');return;}
  const ver=++flowVersion;
  lockBusy(true);status('正在验证 Staging 合成账户…');
  try{
    const db=await getClient();if(!alive(ver))return;
    const {data,error}=await db.auth.signInWithPassword({email:ACCOUNT_EMAIL,password:pass});
    if(error||data?.user?.id!==ACCOUNT_UID||!data.session?.access_token)throw Error('auth_failed');
    if(!await verifyOwner(db))throw Error('owner_mismatch');
    if(!alive(ver)){await closeSession();return;}
    const {data:factors,error:factorError}=await db.auth.mfa.listFactors();
    if(factorError||!factors)throw Error('factors_unavailable');
    if(!alive(ver)){await closeSession();return;}
    if((factors.totp||[]).some(f=>f.status==='verified')){
      $('loginForm').hidden=true;$('successPanel').hidden=false;
      status('该测试账户已存在已验证的 TOTP，无需重复绑定。请先退出，后续等待受控联测。');
      return;
    }
    // Clean up only unverified factors owned by the signed-in fixture
    // before initiating a fresh enrollment.
    for(const f of (factors.totp||[])){
      if(f.status!=='verified'&&f.id){
        const gone=await db.auth.mfa.unenroll({factorId:f.id});
        if(gone.error)throw Error('pending_cleanup_failed');
      }
    }
    if(!alive(ver))return;
    const enrolled=await db.auth.mfa.enroll({
      factorType:'totp',friendlyName:'MMHVAULT N10 Staging A'
    });
    if(enrolled.error||!enrolled.data?.id||!enrolled.data?.totp?.qr_code)throw Error('enroll_failed');
    enrollingFactor=enrolled.data.id;
    if(!alive(ver)){await closeSession();return;}
    $('totpQr').src=enrolled.data.totp.qr_code;
    $('qrBox').hidden=false;
    $('loginForm').hidden=true;
    $('enrollPanel').hidden=false;
    qrTimer=setTimeout(()=>{
      hideQr();status('二维码已自动隐藏，请取消绑定并重新开始以获取新二维码。');
    },90000);
    status('请扫描二维码并输入六位验证码。二维码会在 90 秒后隐藏，切换到其他标签页也会隐藏。');
  }catch(_){
    if(alive(ver)){sessionError();await closeSession();}
  }finally{lockBusy(false);}
}
async function doVerify(){
  if(!qaWindowActive()||busy||!enrollingFactor||$('qrBox').hidden)return;
  const code=$('totpCode').value.trim();
  if(!/^\d{6}$/.test(code)){status('请输入六位动态验证码。');return;}
  $('totpCode').value='';
  const ver=flowVersion;
  lockBusy(true);status('正在验证 TOTP 和安全等级…');
  try{
    const db=await getClient();
    if(!await verifyOwner(db)||!alive(ver))throw Error('owner_changed');
    const factor=enrollingFactor;
    const challenge=await db.auth.mfa.challenge({factorId:factor});
    if(challenge.error||!challenge.data?.id||!alive(ver))throw Error('challenge_failed');
    const proof=await db.auth.mfa.verify({factorId:factor,challengeId:challenge.data.id,code});
    if(proof.error||!alive(ver))throw Error('verify_failed');
    const level=await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if(level.error||level.data?.currentLevel!=='aal2')throw Error('aal2_missing');
    if(!await verifyOwner(db)||!alive(ver))throw Error('identity_changed');
    const factors=await db.auth.mfa.listFactors();
    if(factors.error||!(factors.data?.totp||[]).some(f=>f.id===factor&&f.status==='verified'))
      throw Error('verified_factor_missing');
    // This token never leaves the in-memory Supabase client. Vault is not queried.
    enrollingFactor='';
    hideQr();
    $('enrollPanel').hidden=true;$('successPanel').hidden=false;
    status('PASS：测试账户 A 的 TOTP 绑定与 AAL2 验证完成。本页面没有访问 Vault 或财务 API。请选择退出。');
  }catch(_){
    sessionError();
    await closeSession({removePending:false});
  }finally{lockBusy(false);}
}
$('loginForm').addEventListener('submit',doLogin);
$('verifyButton').addEventListener('click',doVerify);
$('cancelButton').addEventListener('click',async()=>{
  if(busy)return;lockBusy(true);
  try{await closeSession();status('绑定已取消；会话已退出。');}
  finally{lockBusy(false);}
});
$('logoutButton').addEventListener('click',async()=>{
  if(busy)return;lockBusy(true);
  try{await closeSession();status('测试会话已退出。');}
  finally{lockBusy(false);}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    // Prevent a hidden-tab / stale async result from showing a QR later.
    flowVersion++;hideQr();
    $('qaPassword').value='';
    if(client){void closeSession().catch(()=>{});}
  }
});
window.addEventListener('pagehide',()=>{
  flowVersion++;clearPrivate();enrollingFactor='';
});
function expireWindow(){
  if(qaWindowActive())return;
  flowVersion++;
  clearPrivate();
  resetVisible();
  $('qaPassword').disabled=true;
  $('loginButton').disabled=true;
  $('verifyButton').disabled=true;
  $('cancelButton').disabled=true;
  $('stateTitle').textContent='LOCKED · 测试窗口已结束';
  $('stateNote').textContent='测试窗口已到期，不能再登录或绑定 MFA。';
  status('测试窗口已结束。如需继续，必须重新获得授权。');
  if(client)void closeSession().catch(()=>{});
}
if(qaWindowActive()){
  // UI closes without requiring refresh. Runtime guards independently
  // deny late requests even if this browser timer gets throttled.
  const remaining=Math.max(0,Date.parse(QA_WINDOW_END_UTC)-Date.now());
  if(remaining<=2147483000)setTimeout(expireWindow,remaining+5);
  $('qaPassword').disabled=false;
  $('loginButton').disabled=false;
  $('stateTitle').textContent='Staging enrollment · 有效测试窗口';
  $('stateNote').textContent='仅用于审核通过的合成账户 A。测试不读取财务与 Vault 数据。';
  status('测试窗口已启用：请只使用 A 合成测试密码。');
}else{
  $('qaPassword').disabled=true;
  $('loginButton').disabled=true;
  $('verifyButton').disabled=true;
  $('stateTitle').textContent='LOCKED · 尚未开放';
  $('stateNote').textContent='测试尚未得到完整启用批准。页面不会提交密码、验证码或读取任何账户。';
  status('测试页面已准备好，但当前安全开关关闭。请等待新的测试授权。');
}
