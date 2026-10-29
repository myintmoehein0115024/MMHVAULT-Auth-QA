'use strict';
/* N10-A7.39-P8 - Private, nonproduction Google existing-identity PKCE QA.
 * Only ephemeral PKCE verifier is stored in sessionStorage for one redirect.
 * Never store OAuth code, JWT, refresh token, password or account profile.
 * Do not log arbitrary server responses, URL search params or exceptions.
 */
(() => {
 const ORIGIN='https://mmhvault-auth-g10g11-locked.pages.dev';
 const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co';
 const CALLBACK=ORIGIN+'/staging-google';
 const PUBLISHABLE='sb_publishable_LxIB8564OZD48HQ8Mfsc0A_apkgERZo';
 const PKCE_SLOT='mmhv-p8-staging-google-pkce-v1';
 const MAX_AGE=300000;
 const $=id=>document.getElementById(id);
 const status=$('oauth-result'),button=$('google-login');
 let busy=false;
 function display(kind,message){
   status.className='status '+kind;status.dataset.state=kind;status.textContent=message;
 }
 function drop(){try{sessionStorage.removeItem(PKCE_SLOT)}catch{}}
 function safeHost(){
   return location.origin===ORIGIN && window.isSecureContext &&
    (location.pathname==='/staging-google.html'||location.pathname==='/staging-google');
 }
 function allowedRoute(path){
   return path==='/auth/v1/settings'||
    path==='/auth/v1/token?grant_type=pkce'||
    path==='/auth/v1/user'||
    path==='/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2'||
    path==='/auth/v1/logout?scope=local';
 }
 async function read(path,options={},jwt){
   if(!allowedRoute(path))throw Error('unapproved_staging_endpoint');
   const headers={apikey:PUBLISHABLE,...options.headers};
   if(jwt)headers.Authorization='Bearer '+jwt;
   return fetch(BASE+path,{...options,headers,
    mode:'cors',credentials:'omit',cache:'no-store',
    redirect:'error',referrerPolicy:'no-referrer'});
 }
 function base64url(bytes){
   let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
   return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 }
 async function challengeFor(verifier){
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
   return base64url(new Uint8Array(digest));
 }
 async function providerReady(){
   const response=await read('/auth/v1/settings',{method:'GET'});
   if(!response.ok)throw Error('auth_settings_unavailable');
   const s=await response.json();
   const enabled=s?.external?.google===true,disabled=s?.disable_signup===true;
   $('provider').textContent=enabled?'ENABLED':'BLOCKED';
   $('signup').textContent=disabled?'DISABLED':'BLOCKED';
   if(!enabled||!disabled)throw Error('unsafe_oauth_provider_or_signup');
 }
 function validId(v){
   return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 }
 async function proveOwner(access){
   const userResponse=await read('/auth/v1/user',{method:'GET'},access);
   if(!userResponse.ok)throw Error('google_user_lookup_failed');
   const user=await userResponse.json();
   if(!validId(user?.id)||typeof user?.email!=='string'||
      !user.email_confirmed_at||user.is_anonymous===true ||
      !user?.app_metadata?.providers?.includes('google'))
      throw Error('google_existing_identity_mismatch');
   const rls=await read('/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2',
     {method:'GET'},access);
   if(!rls.ok)throw Error('google_rls_unavailable');
   const rows=await rls.json();
   if(!Array.isArray(rows)||rows.length!==1||rows[0]?.user_id!==user.id)
     throw Error('google_rls_owner_mismatch');
 }
 async function localLogout(access){
   if(!access)return false;
   try{
     const res=await read('/auth/v1/logout?scope=local',{method:'POST'},access);
     return res.ok;
   }catch{return false}
 }
 function cleanupUrl(){
   // Clean the short-lived OAuth code from the browser URL before any fetch.
   history.replaceState(null,'',CALLBACK);
 }
 async function callback(params){
   const code=params.get('code'),failure=params.has('error')||params.has('error_code');
   cleanupUrl();
   if(failure){drop();display('blocked','Google 认证未完成或被拒绝，请重新开始。');return}
   if(!code)return;
   button.disabled=true;
   if(!/^[a-zA-Z0-9_\-.]{10,1400}$/.test(code)){
     drop();display('blocked','收到无效授权码，本次测试已停止。');return;
   }
   let pending;
   try{pending=JSON.parse(sessionStorage.getItem(PKCE_SLOT)||'null')}
   catch{pending=null}
   drop(); // one-use even if exchange or owner probe fails
   if(!pending || typeof pending.verifier!=='string'||
      !/^[a-zA-Z0-9_-]{43,128}$/.test(pending.verifier)||
      !Number.isFinite(pending.started)||Date.now()<pending.started||
      Date.now()-pending.started>MAX_AGE){
      display('blocked','缺少同一标签页内有效的 PKCE 验证器。请重新从此页面发起 Google 登录。');
      return;
   }
   let access;
   display('checking','Google 已返回，正在交换一次性授权码并核对 UID/RLS……');
   $('google-status').textContent='CHECKING';
   try{
     const response=await read('/auth/v1/token?grant_type=pkce',{
       method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({auth_code:code,code_verifier:pending.verifier})});
     if(!response.ok)throw Error('pkce_exchange_rejected');
     const payload=await response.json();
     if(typeof payload?.access_token!=='string'||payload.access_token.length<30)
       throw Error('no_valid_access_token');
     access=payload.access_token;
     await proveOwner(access);
     const loggedOut=await localLogout(access);access=null;
     if(!loggedOut)throw Error('logout_unconfirmed');
     $('google-status').textContent='PASS';
     $('owner-status').textContent='PASS';
     display('pass','Google OAuth + 现有账号 UID/RLS 所属关系 + 本地退出：PASS。');
   }catch(error){
     const type=String(error?.message||'');
     let reason='Google 验收未完成；没有标记 PASS。';
     if(type==='pkce_exchange_rejected')reason='Google 授权码交换失败，请检查回调地址、同一标签页和有效期。';
     else if(type==='google_existing_identity_mismatch')reason='返回的 Google 身份与指定的已有测试账号不符。';
     else if(type==='google_rls_unavailable'||type==='google_rls_owner_mismatch')reason='Google 已认证，但 UID/RLS 所属关系检查失败。';
     else if(type==='logout_unconfirmed')reason='账号及 UID/RLS 已验证，但本地退出未确认。';
     display('blocked',reason+' 如已登录，请关闭此标签页。');
   }finally{
     if(access)await localLogout(access);
     access=null;pending=null;button.disabled=false;
   }
 }
 async function begin(){
   if(busy)return;busy=true;button.disabled=true;
   try{
     await providerReady();
     // This callback MUST be in Supabase Staging Auth URL allow list,
     // added as exact https://.../staging-google.html before user clicks.
     const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));
     const challenge=await challengeFor(verifier);
     sessionStorage.setItem(PKCE_SLOT,JSON.stringify({
       verifier,started:Date.now()
     }));
     const destination=new URL(BASE+'/auth/v1/authorize');
     destination.searchParams.set('provider','google');
     destination.searchParams.set('redirect_to',CALLBACK);
     destination.searchParams.set('code_challenge',challenge);
     destination.searchParams.set('code_challenge_method','s256');
     display('checking','正在跳转至 Staging Google 认证页面……');
     window.location.assign(destination.toString());
   }catch{
     drop();display('blocked','无法安全启动 Google OAuth。请检查 Staging Google 提供商与回调白名单。');
     button.disabled=false;busy=false;
   }
 }
 async function init(){
   if(!safeHost()||!PUBLISHABLE.startsWith('sb_publishable_')){
     drop();button.disabled=true;display('blocked','安全限制：此页面只能在独立的 Cloudflare Access QA 主域名使用。');
     return;
   }
   const callbackParams=new URL(location.href).searchParams;
   if(callbackParams.has('code')||callbackParams.has('error')||callbackParams.has('error_code')){
     await callback(callbackParams);
     return;
   }
   try{
     await providerReady();
     button.disabled=false;
     display('neutral','已确认 Google 提供商启用且注册关闭。请先确保回调地址已加入 Supabase Staging 白名单，然后点击按钮。');
   }catch{
     button.disabled=true;display('blocked','Staging Google 前置条件不满足，无法启动真实登录。');
   }
 }
 button.addEventListener('click',()=>{void begin()});
 void init();
})();