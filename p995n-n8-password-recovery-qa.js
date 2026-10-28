'use strict';
(()=> {
const ROOT='https://ldivswlhtgmznzwhzsoi.supabase.co';
const APIKEY='sb_publishable_LxIB8564OZD48HQ8Mfsc0A_apkgERZo';
const EXPECTED_UID='72a8d120-e4d4-4c49-89df-02b85c89cffc';
const EXPECTED_EMAIL='myintmoehein0115024@gmail.com';
const CALLBACK='https://myintmoehein0115024.github.io/MMHVAULT-Auth-QA/p995n-n8-password-recovery-qa.html';
let recoverToken=null, busy=false, mailRequested=false, completed=false, oldTested=false;
const el=id=>document.getElementById(id);
const set=(id,message,tone='note')=>{el(id).textContent=message;el(id).dataset.tone=tone};
const short=u=>u.slice(0,8)+'…'+u.slice(-4);
const sleep=()=>new Promise(resolve=>setTimeout(resolve,10));
function update(){
 el('request').disabled=busy||mailRequested;
 el('change').disabled=busy||!recoverToken||completed;
 el('checkOld').disabled=busy||!completed||oldTested;
 el('checkNew').disabled=busy||!completed;
}
function assertStaging(){if(location.origin!=='https://myintmoehein0115024.github.io'||location.pathname!=='/MMHVAULT-Auth-QA/p995n-n8-password-recovery-qa.html')throw Error('只允许在原 Auth QA GitHub Pages 路径运行');}
async function api(path,body,bearer=null,method='POST'){
 const h={'apikey':APIKEY,'Content-Type':'application/json','Accept':'application/json'};
 if(bearer)h['Authorization']='Bearer '+bearer;
 let response;
 try{response=await fetch(ROOT+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body),cache:'no-store',referrerPolicy:'no-referrer'});}
 catch{throw Error('Staging 网络连接失败');}
 let data=null;try{data=await response.json();}catch{}
 return {ok:response.ok,status:response.status,data};
}
async function user(access){
 const r=await api('/auth/v1/user',null,access,'GET');
 return r.ok&&r.data&&r.data.id?r.data:null;
}
async function owner(access){
 const r=await api('/rest/v1/mmh_p995k_session_protected_qa?select=user_id,fixture_name',null,access,'GET');
 return r.ok&&Array.isArray(r.data)&&r.data.length===1&&r.data[0].user_id===EXPECTED_UID;
}
async function logout(access){
 try{return (await api('/auth/v1/logout?scope=global',null,access)).ok;}catch{return false;}
}
function clearRecovery(){recoverToken=null;update();}
function validateIdentity(record){return !!record&&record.id===EXPECTED_UID&&record.email?.toLowerCase()===EXPECTED_EMAIL;}
async function receive(){
 const params=new URLSearchParams(location.hash.startsWith('#')?location.hash.slice(1):'');
 const query=new URLSearchParams(location.search);
 const access=params.get('access_token');
 const kind=params.get('type');
 const issue=params.get('error_description')||params.get('error')||query.get('error_description')||query.get('error');
 const code=query.get('code');
 // Remove all secrets and transient params from the browser address before any async request.
 if(location.hash||location.search)history.replaceState(null,'',CALLBACK);
 if(issue){set('callback','恢复链接返回错误：'+issue,'bad');return;}
 if(!access){if(code)set('callback','当前邮件链接返回 code，但此独立工具只接收标准恢复链接。不要继续；请反馈截图（遮住链接参数）。','bad');return;}
 if(kind!=='recovery'){set('callback','拒绝非 recovery 类型的认证链接。','bad');return;}
 try{
  busy=true;update();
  const u=await user(access);
  if(!validateIdentity(u)){await logout(access);set('callback','拒绝继续：恢复链接身份与测试账户 B 不一致。已尝试撤销该会话。','bad');return;}
  if(!await owner(access)){await logout(access);set('callback','拒绝继续：UID 匹配但 QA 所有者记录检查未通过。','bad');return;}
  recoverToken=access;
  set('callback','恢复身份验证通过｜账户 B UID '+short(u.id)+'｜QA RLS PASS。现在可以设置新密码。','good');
 }catch(e){set('callback','恢复链接验证失败：'+String(e.message||e),'bad');}
 finally{busy=false;update();}
}
async function send(){
 if(busy||mailRequested)return;busy=true;update();
 try{
  assertStaging();
  const r=await api('/auth/v1/recover?redirect_to='+encodeURIComponent(CALLBACK),{email:EXPECTED_EMAIL});
  if(!r.ok)throw Error('恢复请求未被接受（HTTP '+r.status+'）；请检查邮箱服务、发送限流和 Staging 配置。');
  mailRequested=true;
  set('sendResult','恢复邮件请求已提交。请在账户 B 的邮箱中打开最新邮件，点击官方链接；如果邮件跳往错误页面，请检查 Staging 的 Auth → URL Configuration。','good');
 }catch(e){set('sendResult',String(e.message||e),'bad');}
 finally{busy=false;update();}
}
async function changePassword(){
 if(busy||!recoverToken||completed)return;
 const pass=el('newPass').value,confirm=el('confirmPass').value;
 if(pass.length<6||pass.length>20||pass!==confirm){set('callback','新密码必须为 6–20 位，且两次输入完全一致。','bad');return;}
 busy=true;update();
 try{
  const token=recoverToken;
  const r=await api('/auth/v1/user',{password:pass},token,'PUT');
  el('newPass').value='';el('confirmPass').value='';
  if(!r.ok)throw Error('密码更新失败（HTTP '+r.status+'）；请检查 Staging 密码规则。');
  const chk=await user(token);
  if(!validateIdentity(chk))throw Error('密码更改后 UID 核验失败，请停止并检查账户。');
  completed=true;
  set('callback','密码更新成功｜账户 B UID '+short(chk.id)+' 保持不变。请分别检查旧密码被拒、新密码可登录。','good');
  const signout=await logout(token);
  set('finalResult',signout?'已请求全局退出恢复会话，可继续验证新旧密码。':'密码已更新，但恢复会话退出未确认；请结束测试并反馈。',signout?'note':'bad');
 }catch(e){el('newPass').value='';el('confirmPass').value='';set('callback',String(e.message||e),'bad');}
 finally{clearRecovery();busy=false;update();}
}
async function testPassword(kind){
 if(busy||!completed)return;
 const input=el(kind==='old'?'oldPass':'loginNewPass');const value=input.value;input.value='';
 if(value.length<6||value.length>72){set('finalResult','请输入要检测的 Staging 密码。','bad');return;}
 busy=true;update();
 try{
  const r=await api('/auth/v1/token?grant_type=password',{email:EXPECTED_EMAIL,password:value});
  if(kind==='old'){
   oldTested=true;
   if(r.ok){if(r.data?.access_token)await logout(r.data.access_token);set('oldResult','FAIL：旧密码仍能登录，请停止测试。','bad');}
   else set('oldResult','PASS：旧密码已被拒绝。','good');
   return;
  }
  if(!r.ok||!r.data?.access_token){set('finalResult','FAIL：新密码未能登录（HTTP '+r.status+'）。','bad');return;}
  const token=r.data.access_token;
  try{
   const u=await user(token);
   if(!validateIdentity(u)){set('finalResult','FAIL：新密码登录返回了错误 UID。','bad');return;}
   if(!await owner(token)){set('finalResult','FAIL：新密码登录后 QA RLS 检查未通过。','bad');return;}
   set('finalResult','PASS：新密码登录账户 B｜UID '+short(u.id)+' 不变｜QA RLS 仅自己 1 条｜无新增用户。','good');
  }finally{const ok=await logout(token);if(!ok)set('finalResult','新密码登录及数据检查已通过，但退出请求未确认；请反馈。','bad');}
 }catch(e){set('finalResult','验证失败：'+String(e.message||e),'bad');}
 finally{busy=false;update();}
}
try{
 assertStaging();
 el('request').addEventListener('click',send);
 el('change').addEventListener('click',changePassword);
 el('checkOld').addEventListener('click',()=>testPassword('old'));
 el('checkNew').addEventListener('click',()=>testPassword('new'));
 update();receive();
}catch(e){set('callback',String(e.message||e),'bad');el('request').disabled=true;}
})();