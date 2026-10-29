'use strict';
/* N10-A7.32. A local UI demo ONLY. No fetch, SDK, remote URLs or credentials. */
(() => {
 const $=id=>document.getElementById(id);
 let locale='zh',mode='login';
 const details={
  login:{zh:['验证已绑定账号','邮箱身份基准 → 用户名登录 → 同 UID/RLS → 本地退出。'],
   en:['Verify linked account','Email baseline → Username login → Same UID/RLS → Local sign-out.']},
  bind:{zh:['验证原账号绑定','邮箱认证 → 原 UID/RLS → 绑定用户名 → 退出 → 用户名登录 → 再次检查 UID/RLS。'],
   en:['Verify existing account binding','Email auth → Original UID/RLS → Bind alias → Sign-out → Username login → Recheck UID/RLS.']}
 };
 const failures={
  closed:{zh:'窗口已关闭。无法继续真实验收。',en:'Window closed. Real acceptance cannot proceed.'},
  uid:{zh:'UID 不一致，立即终止。',en:'UID mismatch; stop immediately.'},
  rls:{zh:'RLS 所属人检查失败，立即终止。',en:'RLS ownership validation failed; stop.'},
  logout:{zh:'退出清理未确认，不得标记通过。',en:'Sign-out not confirmed; never mark PASS.'}
 };
 function applyLocale(){
  document.documentElement.lang=locale==='zh'?'zh-CN':'en';
  document.querySelectorAll('[data-zh][data-en]').forEach(el=>{
   el.textContent=el.dataset[locale];
  });
  for(const code of ['zh','en']){
   $(code).classList.toggle('active',code===locale);
   $(code).setAttribute('aria-pressed',String(code===locale));
  }
  $('mode-login').classList.toggle('selected',mode==='login');
  $('mode-bind').classList.toggle('selected',mode==='bind');
  $('mode-login').setAttribute('aria-selected',String(mode==='login'));
  $('mode-bind').setAttribute('aria-selected',String(mode==='bind'));
  const [heading,desc]=details[mode][locale];
  $('flow-heading').textContent=heading;
  $('flow-description').textContent=desc;
  const selected=$('sim-result').dataset.scenario;
  if(selected&&failures[selected]){
   $('sim-result').textContent=(locale==='zh'?'离线模拟：':'Offline mock: ')+failures[selected][locale];
  }
 }
 $('zh').addEventListener('click',()=>{locale='zh';applyLocale()});
 $('en').addEventListener('click',()=>{locale='en';applyLocale()});
 $('mode-login').addEventListener('click',()=>{mode='login';applyLocale()});
 $('mode-bind').addEventListener('click',()=>{mode='bind';applyLocale()});
 $('simulate').addEventListener('click',()=>{
  const scenario=$('scenario').value;
  if(!Object.hasOwn(failures,scenario))return;
  $('sim-result').dataset.scenario=scenario;
  $('sim-result').classList.add('failing');
  applyLocale();
 });
 applyLocale();
})();
