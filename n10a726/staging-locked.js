'use strict';
/* N10-A7.26: fail-closed public QA shell, no credentials or Auth SDK. */
(() => {
  const LIVE_AUTH_ENABLED = false; // NEVER enable without separate scoped user approval + code review.
  const PROJECT = 'ldivswlhtgmznzwhzsoi';
  const EDGE = 'https://' + PROJECT + '.supabase.co/functions/v1/mmh-n10a6-username';
  const SCOPE = 'isolated_staging_only';
  const $ = (id) => document.getElementById(id);
  const messages = {
    zh:{
      eyebrow:'N10-A7.26 · 独立测试环境',title:'身份安全验收',subtitle:'为真实用户名登录与绑定准备的隔离测试控制台。',
      locked:'浏览器真实认证：硬锁关闭',lockDetail:'不会初始化认证 SDK、读取凭据或自动发起登录。公开测试页面不接受真实密码。',
      envTitle:'Staging 隔离核验',project:'项目',service:'服务',production:'生产系统',untouched:'不连接 / 不修改',registration:'新用户注册',registrationClosed:'禁止（需要服务端复核）',
      windowTitle:'服务器测试窗口',windowExplain:'只有手动点击才会向固定 Staging Edge 发送不含身份信息的 preflight 请求。',
      notChecked:'尚未查询 / 未验证',checkWindow:'只读查询窗口状态',noBackground:'页面打开时零认证请求；预检不使用密码、JWT 或验证码。',
      flowTitle:'验收路径',usernameTab:'G10 · 用户名登录',bindTab:'G11 · 绑定用户名',loginHeading:'验证已绑定账号',
      loginDetail:'受控窗口内：邮箱身份基准 → 本地退出 → 用户名登录 → 同一 UID / RLS → 清理会话。',
      bindHeading:'验证已有账号绑定',bindDetail:'受控窗口内：邮箱认证 → 原 UID / RLS → 唯一用户名绑定 → 本地退出 → 用户名重新登录 → 同 UID / RLS → 清理会话。',
      identityLabel:'测试账号（尚未授权输入）',passwordLabel:'测试密码（禁止输入）',realDisabled:'真实验收未授权',disabledDetail:'真实入口不能从页面解锁；需要独立审核与明确授权后，另行发布受控版本。',
      resultTitle:'身份与权限检查',emailAuth:'邮箱原账号认证',bindResult:'用户名绑定',usernameAuth:'用户名登录',uidCheck:'Auth UID 一致性',rlsCheck:'RLS Owner Probe',logoutCheck:'末次本地退出',
      noFakePass:'模拟结果不会被记录为真实云端 PASS。此页面不输出任何用户 ID、令牌或密码。',
      simTitle:'安全反馈预览',scenarioLabel:'合成错误场景（不使用真实账号）',optClosed:'窗口关闭 / 503',optInvalid:'认证失败 / 401',optConflict:'用户名冲突 / 409',optRate:'访问限制 / 429',optUid:'UID 不一致',optRls:'RLS 拒绝',optLogout:'会话清理失败',
      simulate:'运行离线模拟',simIdle:'尚未运行模拟。',foot:'仅限独立 Staging · 真实测试待批准 · 正式系统保持不变',
      checking:'正在执行只读预检…',closed:'Staging 服务端窗口关闭',open:'Staging 服务端窗口开放，但浏览器认证仍锁定',unknown:'无法确认服务器状态（按关闭处理）',invalidResponse:'返回状态不满足 Staging 安全约束（按关闭处理）',
      noteClosed:'服务端确认未开放。没有身份凭据发送。',noteOpen:'服务端预检为开放，仅表示远端状态；当前页面仍禁止真实登录、绑定及注册。',noteFailed:'网络异常或安全校验未通过。不能据此认定服务器已开放。',
      simPrefix:'离线模拟：',scenario_closed:'测试窗口已经关闭（HTTP 503）',scenario_invalid:'账号或密码不正确（HTTP 401）',scenario_conflict:'用户名已被占用（HTTP 409）',scenario_rate:'请求过于频繁（HTTP 429），请停止重试',scenario_uid:'远端 UID 与本地会话不一致，必须退出',scenario_rls:'RLS Owner Probe 拒绝，禁止继续',scenario_logout:'末次本地退出失败，不允许标记 PASS'
    },
    en:{
      eyebrow:'N10-A7.26 · ISOLATED STAGING',title:'Identity acceptance',subtitle:'Isolated staging console prepared for username sign-in and binding.',
      locked:'Real browser authentication: HARD LOCKED',lockDetail:'No auth SDK initialization, credentials, or automatic sign-in. Never enter real passwords on this public QA page.',
      envTitle:'Staging isolation',project:'Project',service:'Function',production:'Production',untouched:'No connection / no modification',registration:'New registrations',registrationClosed:'Forbidden (requires server verification)',
      windowTitle:'Server test window',windowExplain:'Manual click sends an identity-free preflight to the fixed Staging Edge only.',
      notChecked:'Not checked / unverified',checkWindow:'Check window (read-only)',noBackground:'Zero authentication requests on load. No password, JWT or CAPTCHA in preflight.',
      flowTitle:'Acceptance flows',usernameTab:'G10 · Username login',bindTab:'G11 · Bind username',loginHeading:'Verify linked account',
      loginDetail:'Approved window: email identity baseline → local sign-out → username login → same UID/RLS → session cleanup.',
      bindHeading:'Verify existing-account binding',bindDetail:'Approved window: email authentication → original UID/RLS → unique username binding → local sign-out → username login → same UID/RLS → cleanup.',
      identityLabel:'Test account (not authorized)',passwordLabel:'Test password (do not enter)',realDisabled:'Real acceptance not authorized',disabledDetail:'Cannot unlock authentication here. An approved, reviewed controlled release is required.',
      resultTitle:'Identity & permission checks',emailAuth:'Original email authentication',bindResult:'Username binding',usernameAuth:'Username sign-in',uidCheck:'Auth UID consistency',rlsCheck:'RLS Owner Probe',logoutCheck:'Final local sign-out',
      noFakePass:'Mock outcomes are never reported as real cloud PASS. No user IDs, tokens or passwords are shown.',
      simTitle:'Security feedback preview',scenarioLabel:'Synthetic error scenario (no real account)',optClosed:'Window closed / 503',optInvalid:'Invalid credentials / 401',optConflict:'Username conflict / 409',optRate:'Rate limited / 429',optUid:'UID mismatch',optRls:'RLS denied',optLogout:'Session cleanup failed',
      simulate:'Run offline simulation',simIdle:'No simulation run.',foot:'Isolated staging only · Real tests need approval · Production unchanged',
      checking:'Running read-only preflight…',closed:'Server test window is closed',open:'Server window open; browser authentication stays locked',unknown:'Server status not verified (treat as closed)',invalidResponse:'Server response failed strict Staging checks (treat as closed)',
      noteClosed:'Server confirmed closed. No credentials were sent.',noteOpen:'Server reports open, but this page still forbids sign-in, binding, and registration.',noteFailed:'Network or validation failure. Do not assume the window is open.',
      simPrefix:'Offline mock: ',scenario_closed:'Test window closed (HTTP 503)',scenario_invalid:'Incorrect account or password (HTTP 401)',scenario_conflict:'Username already in use (HTTP 409)',scenario_rate:'Too many attempts (HTTP 429); stop retrying',scenario_uid:'Remote UID differs from local session; sign out',scenario_rls:'RLS Owner Probe denied; stop',scenario_logout:'Final local sign-out failed; never mark PASS'
    }
  };
  let lang='zh',mode='login',inflight=false,lastProbe=0;
  const tr=(key)=>messages[lang][key] || key;
  function translate(){
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';
    document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=tr(el.dataset.i18n)});
    $('zh').classList.toggle('active',lang==='zh');$('en').classList.toggle('active',lang==='en');
    $('zh').setAttribute('aria-pressed',String(lang==='zh'));$('en').setAttribute('aria-pressed',String(lang==='en'));
    showMode();if($('window-status').dataset.key) $('window-status').textContent=tr($('window-status').dataset.key);
    if($('window-note').dataset.key) $('window-note').textContent=tr($('window-note').dataset.key);
    if($('sim-result').dataset.key) $('sim-result').textContent=tr('simPrefix')+tr($('sim-result').dataset.key);
  }
  function showMode(){
    const login=mode==='login';
    $('mode-login').classList.toggle('selected',login);$('mode-bind').classList.toggle('selected',!login);
    $('mode-login').setAttribute('aria-selected',String(login));$('mode-bind').setAttribute('aria-selected',String(!login));
    $('flow-heading').textContent=tr(login?'loginHeading':'bindHeading');
    $('flow-description').textContent=tr(login?'loginDetail':'bindDetail');
  }
  function setWindow(key,note,state){
    $('window-status').dataset.key=key;$('window-note').dataset.key=note;
    $('window-status').textContent=tr(key);$('window-note').textContent=tr(note);
    $('window-dot').className='status-dot '+state;
  }
  async function checkWindow(){
    // Read-only preflight: no key, no login, no account, no session.
    if(inflight||Date.now()-lastProbe<10000)return;
    inflight=true;lastProbe=Date.now();$('preflight').disabled=true;
    setWindow('checking','noBackground','');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch(EDGE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preflight'}),cache:'no-store',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok){setWindow('unknown','noteFailed','closed');return;}
      const payload=await response.json();
      if(!payload||payload.code!=='preflight_ok'||payload.scope!==SCOPE||payload.registration_enabled!==false||typeof payload.enabled!=='boolean'){
        setWindow('invalidResponse','noteFailed','closed');return;
      }
      if(payload.enabled===true){setWindow('open','noteOpen','open');return;}
      setWindow('closed','noteClosed','closed');
    }catch{
      setWindow('unknown','noteFailed','closed');
    }finally{
      clearTimeout(timeout);inflight=false;$('preflight').disabled=false;
    }
  }
  $('preflight').addEventListener('click',checkWindow);
  $('zh').addEventListener('click',()=>{lang='zh';translate()});$('en').addEventListener('click',()=>{lang='en';translate()});
  $('mode-login').addEventListener('click',()=>{mode='login';showMode()});$('mode-bind').addEventListener('click',()=>{mode='bind';showMode()});
  $('simulate').addEventListener('click',()=>{
    const selected=$('scenario').value,allowed=new Set(['closed','invalid','conflict','rate','uid','rls','logout']);
    if(!allowed.has(selected))return;
    $('sim-result').classList.add('failing');$('sim-result').dataset.key='scenario_'+selected;
    $('sim-result').textContent=tr('simPrefix')+tr('scenario_'+selected);
  });
  // Constant kept for CI source-gate verification. No production or other project URL exists.
  if(LIVE_AUTH_ENABLED)throw new Error('No real-auth implementation exists in this review-only build');
  translate();
})();
