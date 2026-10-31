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
let codeFailures = 0;
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
  codeFailures=0;
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
  let stage='password';
  lockBusy(true);status('正在验证 Staging 合成账户…');
  try{
    const db=await getClient();if(!alive(ver))return;
    const {data,error}=await db.auth.signInWithPassword({email:ACCOUNT_EMAIL,password:pass});
    if(error||data?.user?.id!==ACCOUNT_UID||!data.session?.access_token)throw Error('auth_failed');
    stage='identity';
    if(!await verifyOwner(db))throw Error('owner_mismatch');
    if(!alive(ver)){await closeSession();return;}
    stage='factor_lookup';
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
    stage='stale_factor_cleanup';
    for(const f of (factors.totp||[])){
      if(f.status!=='verified'&&f.id){
        const gone=await db.auth.mfa.unenroll({factorId:f.id});
        if(gone.error)throw Error('pending_cleanup_failed');
      }
    }
    if(!alive(ver)){await closeSession();return;}
    // Re-fetch after cleanup to detect concurrent enrollment or failed
    // factor removal. Do not create another factor if the old one remains.
    stage='factor_recheck';
    const {data:remaining,error:remainingError}=await db.auth.mfa.listFactors();
    if(remainingError||!remaining)throw Error('recheck_unavailable');
    if((remaining.totp||[]).length!==0)throw Error('stale_factor_remains');
    if(!alive(ver)){await closeSession();return;}
    stage='enrollment';
    // A fixed friendly name can collide with a previous unverified factor,
    // producing mfa_factor_name_conflict (422) even for a synthetic user.
    // Use a fresh random display suffix, never Auth identifiers or OTP values.
    const friendlyName='MMHVAULT N10 Staging A '+crypto.randomUUID().slice(0,8);
    const enrolled=await db.auth.mfa.enroll({
      factorType:'totp',friendlyName
    });
    if(enrolled.error||!enrolled.data?.id||!enrolled.data?.totp?.qr_code)throw Error('enroll_failed');
    enrollingFactor=enrolled.data.id;
    codeFailures=0;
    if(!alive(ver)){await closeSession();return;}
    $('totpQr').src=enrolled.data.totp.qr_code;
    $('qrBox').hidden=false;
    $('loginForm').hidden=true;
    $('enrollPanel').hidden=false;
    qrTimer=setTimeout(()=>{
      hideQr();
      $('verifyButton').disabled=true;
      status('二维码已自动隐藏，本轮验证码不再接受；请点 Cancel 后重新登录，获取新的二维码。');
    },90000);
    status('请扫描本次新显示的二维码，旧验证器条目不能用于本次绑定。输入六位数字后点击 Verify；只有服务器确认为 verified/AAL2 才算成功。二维码 90 秒后隐藏。');
  }catch(_){
    if(alive(ver)){
      const reason=stage==='password'?'测试密码或登录认证未通过':
        stage==='identity'?'账户 A 身份确认失败':
        stage==='factor_lookup'?'无法查询验证器绑定状态':
        stage==='stale_factor_cleanup'?'无法清理上一次未验证的 TOTP（请停止尝试）':
        stage==='factor_recheck'?'旧 TOTP 验证器仍然存在，请勿重复绑定':
        '无法创建新的 TOTP 二维码';
      await closeSession();
      status(reason+'。当前没有完成绑定。请把此提示文字告诉我，不要分享凭证。');
    }
  }finally{lockBusy(false);}
}
async function doVerify(){
  if(!qaWindowActive()||busy||!enrollingFactor||$('qrBox').hidden)return;
  const code=$('totpCode').value.trim();
  if(!/^\\d{6}$/.test(code)){status('请输入六位动态验证码（不含空格）。');return;}
  $('totpCode').value='';
  const ver=flowVersion;
  let stage='identity';
  lockBusy(true);status('正在核对账户并发送 TOTP 验证请求…');
  try{
    const db=await getClient();
    if(!await verifyOwner(db)||!alive(ver))throw Error('owner_changed');
    const factor=enrollingFactor;
    stage='challenge';
    const challenge=await db.auth.mfa.challenge({factorId:factor});
    if(challenge.error)throw challenge.error;
    if(!challenge.data?.id||!alive(ver))throw Error('challenge_failed');
    stage='verify_code';
    const proof=await db.auth.mfa.verify({factorId:factor,challengeId:challenge.data.id,code});
    if(proof.error)throw proof.error;
    if(!alive(ver))throw Error('window_closed');
    stage='aal2';
    const level=await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if(level.error||level.data?.currentLevel!=='aal2')throw Error('aal2_missing');
    if(!await verifyOwner(db)||!alive(ver))throw Error('identity_changed');
    stage='factor_status';
    const factors=await db.auth.mfa.listFactors();
    if(factors.error||!(factors.data?.totp||[]).some(f=>f.id===factor&&f.status==='verified'))
      throw Error('verified_factor_missing');
    // Display success ONLY after live Auth factor=verified AND AAL2.
    enrollingFactor='';
    codeFailures=0;
    hideQr();
    $('enrollPanel').hidden=true;$('successPanel').hidden=false;
    status('PASS：当前测试会话已达到 AAL2，且 Auth 已返回 TOTP verified。请点击 Sign out，之后由服务端只读复核最终状态。');
  }catch(e){
    // Verification failures may be a mistyped/expired 6-digit code. Allow
    // at most 2 retries with a fresh challenge, keeping this factor/session.
    // Do not expose the code, TOTP seed, JWT, factor UUID, or backend details.
    if(stage==='verify_code'&&alive(ver)){
      codeFailures++;
      const http=Number(e?.status);
      const hint=Number.isInteger(http)&&http>=400&&http<600?('HTTP '+http):'验证未接受';
      if(codeFailures<3){
        status('验证码未通过（'+hint+'）。可能是验证码过期或设备时间不同步。请等待手机产生新六位码后重新输入，剩余尝试 '+(3-codeFailures)+' 次。');
        return;
      }
      status('连续 3 次验证码未通过，测试会话已关闭。请不要重复尝试。');
      await closeSession();
      return;
    }
    if(qaWindowActive()&&ver===flowVersion){
      const message=stage==='challenge'?'TOTP 挑战未建立':
        stage==='aal2'?'验证码请求已返回，但 AAL2 尚未确认':
        stage==='factor_status'?'AAL2 检查后，TOTP 仍未标记为 verified':
        '测试会话或账户身份验证失败';
      status(message+'。本次不能标记 PASS。请停止操作并告知我该提示。');
    }
    await closeSession({removePending:stage!=='aal2'&&stage!=='factor_status'});
    // Closing the session resets the panel, but leaves sanitized evidence.
    if(!qaWindowActive())expireWindow();
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
