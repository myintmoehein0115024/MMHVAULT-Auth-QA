'use strict';
/* MMHVAULT ISOLATED STAGING USER QA.
 * Real email login and existing username login after bounded server window.
 * Never production, no sign up, no refresh token storage, no global logout.
 */
(() => {
 const ORIGIN='https://mmhvault-auth-g10g11-locked.pages.dev';
 const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co';
 const EDGE=BASE+'/functions/v1/mmh-n10a6-username';
 const PUBLISHABLE='sb_publishable_LxIB8564OZD48HQ8Mfsc0A_apkgERZo';
 const TURNSTILE_SITEKEY='0x4AAAAAAFq1yWQ26zasvyxh';
 const CAPTCHA_ACTION='mmh_n10a6_login';
 const $=id=>document.getElementById(id);
 const result=$('result');
 const emailPanel=$('email-panel'),namePanel=$('username-panel');
 let busy=false,usedCaptcha=false;
 const allowed = location.origin===ORIGIN&&window.isSecureContext
  &&PUBLISHABLE.startsWith('sb_publishable_');
 function setState(kind,label){
  result.className='status '+kind;
  result.dataset.state=kind;
  result.textContent=label;
 }
 function lockInputs(disabled){
  $('email-submit').disabled=disabled;
  $('username-submit').disabled=disabled;
 }
 function select(which){
  if(busy)return;
  const mail=which==='email';
  emailPanel.hidden=!mail;
  namePanel.hidden=mail;
  $('tab-email').classList.toggle('selected',mail);
  $('tab-username').classList.toggle('selected',!mail);
 }
 $('tab-email').addEventListener('click',()=>select('email'));
 $('tab-username').addEventListener('click',()=>select('username'));
 if(!allowed){
  lockInputs(true);
  setState('blocked','安全限制：只能在受 Cloudflare Access 保护的独立 HTTPS QA 主域名测试。');
  return;
 }
 function pathAllowed(path){
  return path==='/auth/v1/token?grant_type=password'||
    path==='/auth/v1/user'||
    path==='/auth/v1/logout?scope=local'||
    path==='/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2'||
    path==='/functions/v1/mmh-n10a6-username';
 }
 async function remote(path,options={},token){
  if(!pathAllowed(path))throw Error('unapproved_endpoint');
  const url=BASE+path;
  const headers={apikey:PUBLISHABLE,...options.headers};
  if(token)headers.Authorization='Bearer '+token;
  return fetch(url,{...options,headers,
   credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
 }
 function validId(v){return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)}
 async function proveOwner(token){
  const userResponse=await remote('/auth/v1/user',{method:'GET'},token);
  if(!userResponse.ok)throw Error('user_identity_unavailable');
  const user=await userResponse.json();
  if(!validId(user?.id)||!user.email_confirmed_at||user.is_anonymous===true)
   throw Error('unverified_staging_user');
  const ownerResponse=await remote('/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2',
   {method:'GET'},token);
  if(!ownerResponse.ok)throw Error('owner_rls_unavailable');
  const rows=await ownerResponse.json();
  if(!Array.isArray(rows)||rows.length!==1||rows[0]?.user_id!==user.id)
   throw Error('uid_rls_mismatch');
  return true;
 }
 async function signOutLocal(token){
  if(!token)return false;
  try{
   const res=await remote('/auth/v1/logout?scope=local',{method:'POST'},token);
   return res.ok;
  }catch{return false;}
 }
 async function checkServerOpen(){
  const r=await remote('/functions/v1/mmh-n10a6-username',
   {method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},
    body:'{"action":"preflight"}'});
  if(!r.ok)return false;
  const v=await r.json();
  return v?.code==='preflight_ok'&&v?.enabled===true&&
   v?.registration_enabled===false&&v?.scope==='isolated_staging_only';
 }
 async function acceptTokens(tokens){
  let secret=tokens?.access_token,refresh=tokens?.refresh_token;
  if(typeof secret!=='string'||secret.length<30||typeof refresh!=='string'||refresh.length<30)
   throw Error('missing_staging_session');
  let succeeded=false,logout=false;
  try{await proveOwner(secret);succeeded=true}
  finally {
   logout=await signOutLocal(secret);
   secret=null;refresh=null;
  }
  if(!logout)throw Error('local_logout_unconfirmed');
  return succeeded;
 }
 async function emailLogin(){
  const email=$('email').value.trim();
  const password=$('password').value;
  if(!email||!email.includes('@')||password.length<1||password.length>1024)
   throw Error('invalid_test_input');
  let token;
  try{
   const r=await remote('/auth/v1/token?grant_type=password',
    {method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({email,password})});
   if(!r.ok)throw Error('staging_email_login_failed');
   token=await r.json();
   await acceptTokens(token);
   $('email-check').textContent='PASS';
   setState('pass','邮箱登录 + 服务端 UID / RLS 所属关系 + 本地退出：PASS。用户名与 Google 仍未验收。');
  }finally{
   $('password').value='';
   token=null;
  }
 }
 function captcha(){
  if(usedCaptcha)throw Error('turnstile_one_use_only');
  usedCaptcha=true;
  return new Promise((resolve,reject)=>{
   const box=$('turnstile-container');
   let id=null,done=false;
   const timer=setTimeout(()=>finish(null,'captcha_timeout'),100000);
   function finish(token,error){
    if(done)return;
    done=true;
    clearTimeout(timer);
    try{if(id!==null)window.turnstile?.remove(id)}catch{}
    if(error){reject(Error(error));return}
    if(typeof token!=='string'||token.length<20){reject(Error('captcha_invalid'));return}
    resolve(token);
   }
   function render(){
    try{
     id=window.turnstile.render(box,{
      sitekey:TURNSTILE_SITEKEY,action:CAPTCHA_ACTION,
      execution:'execute',appearance:'execute',theme:'dark',
      callback:v=>finish(v,null),
      'error-callback':()=>finish(null,'captcha_failed'),
      'expired-callback':()=>finish(null,'captcha_expired'),
      'timeout-callback':()=>finish(null,'captcha_timeout')
     });
     window.turnstile.execute(id);
    }catch{finish(null,'captcha_unavailable')}
   }
   if(window.turnstile?.render){render();return}
   const js=document.createElement('script');
   js.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
   js.async=true;js.referrerPolicy='no-referrer';
   js.onload=render;
   js.onerror=()=>finish(null,'captcha_unavailable');
   document.head.appendChild(js);
  });
 }
 async function usernameLogin(){
  // Mandatory preflight BEFORE processing or transmitting password/CAPTCHA.
  const open=await checkServerOpen();
  if(!open){
   $('username-password').value='';
   setState('blocked','用户名测试窗口尚未开放，未提交密码或验证码。请继续使用邮箱验收。');
   return;
  }
  const name=$('username').value.trim().toLowerCase();
  const password=$('username-password').value;
  if(!/^[a-z][a-z0-9_]{3,19}$/.test(name)||!password||password.length>1024)
   throw Error('invalid_test_input');
  let grant=null;
  try{
   const token=await captcha();
   if(!await checkServerOpen())throw Error('test_window_closed');
   const r=await remote('/functions/v1/mmh-n10a6-username',
    {method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({action:'login',username:name,password,captcha_token:token})});
   const body=await r.json();
   if(!r.ok||body?.code!=='login_success')throw Error('staging_username_login_failed');
   grant=body;
   await acceptTokens(grant);
   $('username-check').textContent='PASS';
   setState('pass','用户名登录 + UID/RLS 所属关系 + 本地退出：PASS。');
  }finally{$('username-password').value='';grant=null}
 }
 async function guarded(task){
  if(busy)return;
  busy=true;lockInputs(true);
  setState('checking','正在执行隔离的 Staging 测试，不会保存密码或令牌……');
  try{await task()}catch{
    setState('blocked','本次 Staging 认证或安全检查未通过；已尝试清理本地会话。不要将其视为成功。');
  }finally{busy=false;lockInputs(false)}
 }
 $('email-form').addEventListener('submit',e=>{e.preventDefault();void guarded(emailLogin)});
 $('username-form').addEventListener('submit',e=>{e.preventDefault();void guarded(usernameLogin)});
 window.addEventListener('pagehide',()=>{$('password').value='';$('username-password').value=''});
})();
