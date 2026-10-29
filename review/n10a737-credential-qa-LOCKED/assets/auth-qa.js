'use strict';
/*
 N10-A7.37. ISOLATED UI REVIEW ONLY.
 No credentials, no OAuth, no CAPTCHA, no Supabase SDK and no network.
 User form inputs and submit buttons are disabled permanently. Only tabs
 and synthetic, fixed-name failure examples are interactive.
*/
(() => {
 const REAL_AUTH_ENABLED=false;
 const REAL_REGISTRATION_ENABLED=false;
 const REAL_RESET_ENABLED=false;
 const GOOGLE_OAUTH_ENABLED=false;
 const $=id=>document.getElementById(id);
 const views=['login','register','recovery'];
 const methods=['username','email','google'];
 const mockMessages={
  duplicate:{zh:'模拟：用户名已被使用，请更换用户名。真实数据库未查询。',en:'Mock: Username already exists. No database lookup was performed.'},
  weak_password:{zh:'模拟：密码必须为 6–20 位。没有接收真实密码。',en:'Mock: Password must be 6–20 characters. No password was accepted.'},
  uid:{zh:'模拟：UID 不一致，停止验收。真实账号仍为 NOT RUN。',en:'Mock: UID mismatch, stop acceptance. Real accounts remain NOT RUN.'},
  rls:{zh:'模拟：RLS 所属关系不一致。没有读取任何财务数据。',en:'Mock: RLS ownership rejected. No finance data was read.'},
  captcha:{zh:'模拟：Turnstile Token 未通过验证。未触发验证码服务。',en:'Mock: Turnstile token rejected. No CAPTCHA service was called.'},
  reset:{zh:'模拟：密码重置链接已过期。未发送任何邮件。',en:'Mock: Password reset link expired. No email was sent.'}
 };
 let locale='zh',view='login',method='username',lastCase='';
 function verifyLocked(){
  if(REAL_AUTH_ENABLED||REAL_REGISTRATION_ENABLED||REAL_RESET_ENABLED||GOOGLE_OAUTH_ENABLED)
   throw Error('real_auth_must_remain_locked');
  for(const el of document.querySelectorAll('input, .primary-action')){
   el.disabled=true;
   el.setAttribute('aria-disabled','true');
   if(el.tagName==='INPUT')el.value='';
  }
 }
 function translated(){document.querySelectorAll('[data-zh][data-en]').forEach(el=>{
  el.textContent=el.dataset[locale];
 })}
 function update(){
  verifyLocked();
  document.documentElement.lang=locale==='zh'?'zh-CN':'en';
  translated();
  for(const l of ['zh','en']){
   $('lang-'+l).classList.toggle('active',l===locale);
   $('lang-'+l).setAttribute('aria-pressed',String(l===locale));
  }
  for(const id of views){
   const selected=id===view;
   $('view-'+id).classList.toggle('selected',selected);
   $('view-'+id).setAttribute('aria-selected',String(selected));
   $(id+'-content').hidden=!selected;
  }
  for(const id of methods){
   const selected=id===method;
   $('method-'+id).classList.toggle('selected',selected);
   $('method-'+id).setAttribute('aria-selected',String(selected));
  }
  $('login-fields').hidden=method==='google';
  $('google-fields').hidden=method!=='google';
  const identity=$('login-identity');
  identity.type=method==='email'?'email':'text';
  identity.maxLength=method==='email'?254:20;
  $('login-identity-label').textContent=method==='email'?
   (locale==='zh'?'邮箱地址':'Email address'):(locale==='zh'?'用户名':'Username');
  $('login-submit').textContent=method==='google'?
   (locale==='zh'?'Google 登录（未开放）':'Google sign in (unavailable)'):
   (locale==='zh'?'安全登录（未开放）':'Secure sign in (unavailable)');
  if(lastCase){
   $('mock-result').textContent=(locale==='zh'?'离线模拟 · ':'Offline mock · ')+mockMessages[lastCase][locale];
  }
 }
 for(const lang of ['zh','en'])$('lang-'+lang).addEventListener('click',()=>{
  locale=lang;update();
 });
 for(const v of views)$('view-'+v).addEventListener('click',()=>{
  view=v;update();
 });
 for(const m of methods)$('method-'+m).addEventListener('click',()=>{
  method=m;update();
 });
 $('mock-run').addEventListener('click',()=>{
  const scenario=$('mock-case').value;
  if(!Object.hasOwn(mockMessages,scenario))return;
  lastCase=scenario;
  $('mock-result').classList.add('fail');
  update();
 });
 // Guard the entire page against an accidental unlocked source change.
 // A genuine future credential page must be a distinct, reviewed artifact.
 document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>{
  event.preventDefault();verifyLocked();
 }));
 window.addEventListener('pageshow',verifyLocked);
 update();
})();