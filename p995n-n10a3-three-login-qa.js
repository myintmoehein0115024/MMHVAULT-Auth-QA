'use strict';
(()=>{
const HOST='https://myintmoehein0115024.github.io',PATH='/MMHVAULT-Auth-QA/p995n-n10a3-three-login-qa.html',REDIRECT=HOST+PATH;
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co',KEY='sb_publishable_LxIB8564OZD48HQ8Mfsc0A_apkgERZo';
const A='1bc5708a-cc72-4a33-a6f8-2096bdf4c690',B='72a8d120-e4d4-4c49-89df-02b85c89cffc';
const VERIFIER='mmh_n10a3_pkce_verifier',START='mmh_n10a3_pkce_start';
const $=s=>document.getElementById(s);
let session=null,busy=false,mode='email',lang='zh';
let usernameReadyUntil=0,captchaToken=null,widgetId=null,captchaPromise=null;
const t=(cn,en)=>lang==='zh'?cn:en,small=s=>s?.slice(0,8)+'…'+s?.slice(-4)||'—';
function status(s,tone='normal'){$('status').textContent=s;$('status').dataset.tone=tone;}
function view(){for(const [m,tab,body] of [['email','tabEmail','emailView'],['google','tabGoogle','googleView'],['username','tabUsername','usernameView']]){$(tab).setAttribute('aria-selected',String(mode===m));$(body).hidden=mode!==m;}}
function usernameReady(){return usernameReadyUntil>Date.now();}
function update(){const logged=!!session;$('emailBtn').disabled=busy||logged;$('googleBtn').disabled=busy||logged;$('usernameBtn').disabled=busy||logged;$('usernamePassword').disabled=busy||logged||!usernameReady();$('usernameLoginBtn').disabled=busy||logged||!usernameReady()||!captchaToken;$('refreshBtn').disabled=busy||!logged;$('logoutBtn').disabled=busy||!logged;$('password').disabled=busy||logged;$('authState').textContent=logged?t('已验证','Verified'):t('未登录','Signed out');$('uid').textContent=logged?small(session.uid):'—';$('method').textContent=logged?session.method:'—';$('rls').textContent=logged?'PASS · 1':'—';}
function clearPkce(){sessionStorage.removeItem(VERIFIER);sessionStorage.removeItem(START);}
async function req(path,body=null,token=null,method='POST'){
 const headers={apikey:KEY,Accept:'application/json'};if(body!==null)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),16000);
 try{const r=await fetch(BASE+path,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:'omit',mode:'cors',cache:'no-store',referrerPolicy:'no-referrer',signal:c.signal});return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)}}finally{clearTimeout(timer);}
}
async function who(token){const r=await req('/auth/v1/user',null,token,'GET');if(!r.ok||!r.data?.id)throw Error('Get user HTTP '+r.status);return r.data.id;}
async function owner(token,id){const r=await req('/rest/v1/mmh_p995k_session_protected_qa?select=user_id,fixture_name',null,token,'GET');return r.ok&&Array.isArray(r.data)&&r.data.length===1&&r.data[0].user_id===id&&r.data[0].fixture_name==='P995K_OWNER_ONLY';}
async function revoke(token){try{return (await req('/auth/v1/logout?scope=local',null,token)).ok}catch{return false;}}
async function accept(data,expected,method){
 if(!data?.access_token||!data?.refresh_token)throw Error('Missing access/refresh token');
 const token=data.access_token;
 try{
 const uid=await who(token);
 if(uid!==expected||!await owner(token,uid))throw Error('UID or RLS mismatch; unexpected account');
 session={uid,method,access:token,refresh:data.refresh_token};
 status(t('PASS：'+method+' 登录成功，原 UID '+small(uid)+' 保持不变，QA RLS 只读取自己 1 条数据。','PASS: '+method+' UID '+small(uid)+' unchanged, QA RLS own row only.'),'good');update();
 }catch(e){await revoke(token);throw e;}
}
async function emailLogin(ev){
 ev.preventDefault();if(busy||session)return;const pwd=$('password').value;$('password').value='';
 if(pwd.length<6||pwd.length>256){status(t('请输入测试账户 B 的密码。','Enter test account B password.'),'bad');return;}
 busy=true;update();status(t('核验账户 B…','Verifying account B…'));
 try{const r=await req('/auth/v1/token?grant_type=password',{email:'myintmoehein0115024@gmail.com',password:pwd});if(!r.ok)throw Error('Email login HTTP '+r.status);await accept(r.data,B,'Email');}
 catch(e){status(t('登录未通过：','Login failed: ')+String(e.message||e),'bad');}
 finally{busy=false;update();}
}
function genVerifier(){let b=new Uint8Array(48);crypto.getRandomValues(b);return Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');}
async function digest(v){const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));return btoa(Array.from(b,n=>String.fromCharCode(n)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function google(){
 if(busy||session)return;busy=true;update();
 try{let v=genVerifier(),c=await digest(v);sessionStorage.setItem(VERIFIER,v);sessionStorage.setItem(START,String(Date.now()));
 let url=new URL(BASE+'/auth/v1/authorize');url.searchParams.set('provider','google');url.searchParams.set('redirect_to',REDIRECT);url.searchParams.set('code_challenge',c);url.searchParams.set('code_challenge_method','s256');
 status(t('请仅选择账户 A 对应的 Google 账号。','Use only Google account A.'));location.assign(url.toString());
 }catch(e){clearPkce();status(String(e.message||e),'bad');busy=false;update();}
}
async function oauthCallback(){
 const q=new URLSearchParams(location.search),code=q.get('code'),err=q.get('error');if(!code&&!err)return;
 history.replaceState(null,'',REDIRECT);mode='google';view();busy=true;update();status(t('正在验证 PKCE 回调…','Checking PKCE callback…'));
 let token=null;
 try{
 if(err||!code||code.length>2048)throw Error('OAuth callback error');
 const v=sessionStorage.getItem(VERIFIER),start=Number(sessionStorage.getItem(START));clearPkce();
 if(!v||!start||Date.now()-start>300000||Date.now()<start-30000)throw Error('PKCE verifier expired. Retry in same tab.');
 const r=await req('/auth/v1/token?grant_type=pkce',{auth_code:code,code_verifier:v});if(!r.ok)throw Error('PKCE exchange HTTP '+r.status+'; check Staging Redirect URL');
 token=r.data?.access_token;await accept(r.data,A,'Google PKCE');
 }catch(e){if(token)await revoke(token);status(t('Google 登录未通过：','Google sign-in failed: ')+String(e.message||e),'bad');}
 finally{busy=false;update();}
}
async function refresh(){
 if(!session||busy)return;busy=true;update();const old=session;
 try{const r=await req('/auth/v1/token?grant_type=refresh_token',{refresh_token:old.refresh});if(!r.ok||!r.data?.access_token||!r.data?.refresh_token)throw Error('Refresh HTTP '+r.status);
 const uid=await who(r.data.access_token);if(uid!==old.uid||!await owner(r.data.access_token,uid)){await revoke(r.data.access_token);throw Error('Refresh UID/RLS mismatch');}
 session={...old,access:r.data.access_token,refresh:r.data.refresh_token};status(t('PASS：会话续期，原 UID 与 RLS 不变。','PASS: Refresh; UID and RLS unchanged.'),'good');
 }catch(e){status(String(e.message||e),'bad');}
 finally{busy=false;update();}
}
async function logout(){
 if(!session||busy)return;busy=true;update();const token=session.access;session=null;update();
 try{const out=await revoke(token),r=await req('/rest/v1/mmh_p995k_session_protected_qa?select=user_id',null,token,'GET');
 const blocked=r.status===401||r.status===403||(r.ok&&Array.isArray(r.data)&&r.data.length===0);
 status((out?'PASS':'UNCONFIRMED')+t(' 退出；',' sign-out; ')+(blocked?'PASS':'UNCONFIRMED')+t(' 旧 JWT 不可访问 QA 表。',' old JWT blocked on QA fixture.'),out&&blocked?'good':'bad');
 }catch(e){status('Logout check: '+String(e.message||e),'bad')}
 finally{busy=false;update();}
}

const USERNAME_ENDPOINT='/functions/v1/mmh-staging-n10a3-username-login';
const SITEKEY='0x4AAAAAAFlXEfEHAP1TUxjr'; // public Cloudflare Turnstile site key (never a secret)
function usernameMessage(message,tone='normal'){$('usernamePreflight').textContent=message;$('usernamePreflight').dataset.tone=tone;}
function resetCaptcha(){captchaToken=null;if(widgetId!==null&&window.turnstile?.reset){try{window.turnstile.reset(widgetId)}catch{}}update();}
async function loadTurnstile(){
 if(window.turnstile?.render)return;
 if(!captchaPromise){
  captchaPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.async=true;script.defer=true;
   script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
   script.onload=()=>window.turnstile?.render?resolve():reject(Error('Turnstile unavailable'));
   script.onerror=()=>reject(Error('Turnstile script blocked'));document.head.appendChild(script);
  }).catch(e=>{captchaPromise=null;throw e;});
 }
 await captchaPromise;
}
async function mountTurnstile(){
 await loadTurnstile();
 $('usernameCaptcha').hidden=false;
 if(widgetId!==null){resetCaptcha();return;}
 widgetId=window.turnstile.render($('usernameCaptcha'),{
  sitekey:SITEKEY,action:'mmh_username_login',theme:'dark',
  callback:token=>{captchaToken=typeof token==='string'?token:null;update();},
  'expired-callback':()=>{captchaToken=null;update();},
  'error-callback':()=>{captchaToken=null;update();}
 });
 if(widgetId===undefined||widgetId===null)throw Error('Turnstile did not mount');
}
async function username(){
 if(busy||session)return;
 usernameReadyUntil=0;captchaToken=null;
 busy=true;update();
 usernameMessage(t('检查新 Staging 接口的关闭状态…','Checking new Staging gate…'));
 try{
  const r=await req(USERNAME_ENDPOINT,{action:'preflight'});
  if(!r.ok||r.data?.code!=='preflight_ok'){
   usernameMessage(t('安全关闭：N10-A3.2 服务端尚未部署或不可用。没有发送用户名密码。','Safely locked: N10-A3.2 server is not deployed or unavailable. No password sent.')+' HTTP '+r.status,'normal');
   return;
  }
  if(r.data?.enabled!==true){
   usernameMessage(t('PASS：N10-A3.2 服务端登录开关关闭。用户名密码登录不可用（预期状态）。','PASS: N10-A3.2 gate remains closed; username login unavailable as designed.'),'good');
   return;
  }
  if(r.data?.configured!==true||r.data?.scope!=='staging_account_b_only')throw Error('Unexpected server configuration');
  await mountTurnstile();
  usernameReadyUntil=Date.now()+90000;
  usernameMessage(t('仅 Staging B：临时测试接口已启用。请完成 Cloudflare 验证后输入测试密码。','Staging B only: temporary test endpoint enabled. Complete Cloudflare challenge before test password.'),'good');
 }catch(e){
  usernameReadyUntil=0;captchaToken=null;
  usernameMessage(t('保持锁定：无法验证 N10-A3.2 接口。','Locked: cannot validate N10-A3.2 endpoint.')+' '+String(e.message||e),'bad');
 }finally{busy=false;update();}
}
async function usernameLogin(ev){
 ev.preventDefault();
 if(busy||session||!usernameReady()||!captchaToken){
  usernameMessage(t('未取得有效验证码或登录窗口关闭，不会发送密码。','No valid captcha or test gate closed; password was not sent.'),'bad');
  return;
 }
 const pwd=$('usernamePassword').value;$('usernamePassword').value='';
 const captcha=captchaToken;captchaToken=null;
 if(pwd.length<6||pwd.length>256){resetCaptcha();usernameMessage(t('请输入账户 B 的 Staging 测试密码。','Enter account B Staging password.'),'bad');return;}
 busy=true;update();usernameMessage(t('正在核对用户名、原 UID 和专用 QA RLS…','Checking username, original UID, QA RLS…'));
 try{
  const r=await req(USERNAME_ENDPOINT,{action:'login',username:$('username').value,password:pwd,captcha_token:captcha});
  if(!r.ok)throw Error('Username login rejected · HTTP '+r.status+' · '+String(r.data?.code||'unknown'));
  if(r.data?.code!=='login_success')throw Error('Unexpected login response');
  await accept(r.data,B,'Username');
  usernameMessage(t('用户名登录与原账户 B UID 校验成功。','Username login matched original account B UID.'),'good');
 }catch(e){usernameMessage(t('登录未通过：','Sign-in not verified: ')+String(e.message||e),'bad');status(t('用户名登录未通过。请检查下方原因。','Username login was not verified. See username panel.'),'bad');}
 finally{busy=false;resetCaptcha();update();}
}
function language(){lang=lang==='zh'?'en':'zh';document.documentElement.lang=lang==='zh'?'zh-CN':'en';document.querySelectorAll('[data-zh][data-en]').forEach(el=>el.textContent=el.dataset[lang]);$('lang').textContent=lang==='zh'?'EN':'中文';update();}
function tab(name){if(busy)return;mode=name;view();status(name==='username'?t('N10-A3.3 用户名测试默认锁定，先检查新接口（无需密码）。','N10-A3.3 username test locked; check new gate first (no password).'):t('请选择测试账号。','Choose a test account.'));}
try{
 if(location.origin!==HOST||location.pathname!==PATH)throw Error('Incorrect Auth QA origin/path');
 $('emailForm').addEventListener('submit',emailLogin);$('googleBtn').addEventListener('click',google);$('usernameBtn').addEventListener('click',username);$('usernameForm').addEventListener('submit',usernameLogin);$('refreshBtn').addEventListener('click',refresh);$('logoutBtn').addEventListener('click',logout);$('lang').addEventListener('click',language);
 for(const [button,m] of [['tabEmail','email'],['tabGoogle','google'],['tabUsername','username']])$(button).addEventListener('click',()=>tab(m));
 window.addEventListener('pagehide',()=>{$('password').value='';$('usernamePassword').value='';captchaToken=null;session=null;});
 $('scriptReady').textContent=t('交互脚本已加载 · 凭据仅存在当前页面内存中','Script ready · Tokens kept only in page memory');
 view();update();oauthCallback();
}catch(e){status('Startup error: '+String(e.message||e),'bad');}
})();