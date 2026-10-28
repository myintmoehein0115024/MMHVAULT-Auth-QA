'use strict';
(()=>{
const HOST='https://myintmoehein0115024.github.io';
const PATH='/MMHVAULT-Auth-QA/p995n-n9-username-reset-compat.html';
const API='https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-staging-p995n-n9-compat-qa';
const KEY='sb_publishable_LxIB8564OZD48HQ8Mfsc0A_apkgERZo';
const SITE='0x4AAAAAAFlXEfEHAP1TUxjr';
const EXPECTED='72a8d120-e4d4-4c49-89df-02b85c89cffc';
const NAME='myintmoehein0115024';
let enabled=false,configured=false,busy=false,widget=null,token='';
const e=id=>document.getElementById(id);
function note(message,tone='normal'){e('result').textContent=message;e('result').dataset.tone=tone;}
function state(){
 e('check').disabled=busy;
 e('login').disabled=busy||!enabled||!token||e('pass').value.length<6;
}
function reset(){
 token='';
 try{if(window.turnstile&&widget!==null)window.turnstile.reset(widget);}catch{}
 state();
}
async function call(data){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),14000);
 try{
  const res=await fetch(API,{method:'POST',headers:{'apikey':KEY,'Content-Type':'application/json'},body:JSON.stringify(data),mode:'cors',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
  const json=await res.json().catch(()=>({}));
  return {ok:res.ok,status:res.status,data:json};
 }finally{clearTimeout(timer);}
}
async function preflight(){
 if(busy)return;
 busy=true;state();note('正在查询 Staging 测试接口状态……');
 try{
  const x=await call({action:'preflight'});
  configured=x.ok&&x.data.configured===true;enabled=x.ok&&x.data.enabled===true;
  if(configured&&enabled)note('安全配置已具备｜N9 临时测试开关：已开启。请完成 Cloudflare 验证，然后只输入账户 B 的新 Staging 密码。','good');
  else if(configured)note('安全配置已具备｜N9 临时测试开关：仍关闭（正常）。此时不会执行用户名登录。','normal');
  else note('未能确认安全配置，请暂停测试（HTTP '+x.status+'）。','bad');
 }catch(err){enabled=false;note('连接失败：'+String(err.message||err),'bad');}
 finally{busy=false;state();}
}
async function login(){
 if(busy||!enabled||!token)return;
 const password=e('pass').value;e('pass').value='';
 if(password.length<6||password.length>256){note('请填写账户 B 当前的新 Staging 密码，长度不符合要求。','bad');state();return;}
 const captcha=token;token='';busy=true;state();note('正在验证用户名与更新后的密码，并核验原 UID……');
 try{
  const x=await call({action:'login',username:NAME,password,captcha_token:captcha});
  if(x.ok&&x.data.code==='n9_login_verified'&&x.data.uid===EXPECTED&&x.data.owner_rls==='PASS'&&x.data.session_closed===true){
   note('PASS：用户名 '+NAME+' 与新密码兼容｜原 UID 72a8d1…cffc 保持不变｜QA RLS 只读自己的 1 条记录｜测试会话已退出。','good');
  }else{
   const code=String(x.data.code||'unknown');
   note('未通过：HTTP '+x.status+' · '+code+'。请不要反复尝试，截取错误码给我（不要发送密码）。','bad');
  }
 }catch(err){note('测试请求失败：'+String(err.message||err),'bad');}
 finally{busy=false;reset();}
}
function initialize(){
 if(!window.turnstile||typeof window.turnstile.render!=='function')return;
 if(widget!==null)return;
 try{
  widget=window.turnstile.render('#turn',{sitekey:SITE,action:'mmh_username_login',theme:'dark',
   callback:value=>{token=value;state();},
   'expired-callback':()=>{token='';state();},
   'error-callback':()=>{token='';note('Cloudflare 验证失败，请检查网络并刷新。','bad');state();}
  });
 }catch(err){note('Cloudflare 初始化失败：'+String(err.message||err),'bad');}
}
window.mmhN9Loaded=()=>{
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
};
try{
 if(location.origin!==HOST||location.pathname!==PATH)throw Error('仅允许原 Staging QA 站点运行');
 e('check').addEventListener('click',preflight);
 e('login').addEventListener('click',login);
 e('pass').addEventListener('input',state);
 window.addEventListener('pagehide',()=>{token='';e('pass').value='';});
 state();
 if(window.turnstile)initialize();
}catch(err){note('页面运行安全检查失败：'+String(err.message||err),'bad');}
})();