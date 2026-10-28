'use strict';
/*
 * N10-A7.23 · REAL STAGING USERNAME + BIND ACCEPTANCE CONTRACT
 * LOCKED REVIEW ONLY. Nothing here is deployed as an active login UI.
 * All real requests are prohibited until a separate scoped Staging approval.
 * Tests may set ALLOW_REAL_OPERATIONS=true only in a hermetic VM, with mocks.
 */
const ALLOW_REAL_OPERATIONS=false;
const STAGING_PROJECT='ldivswlhtgmznzwhzsoi';
const STAGING_URL='https://'+STAGING_PROJECT+'.supabase.co';
const EDGE_PATH='/functions/v1/mmh-n10a6-username';
const ALLOWED_ORIGIN='https://myintmoehein0115024.github.io';
const USERNAME_RE=/^[a-z][a-z0-9_]{3,19}$/;
const EXPECTED_ACTIONS=Object.freeze({bind:'mmh_n10a6_bind',login:'mmh_n10a6_login'});
function result(ok,code,steps=[]){return {ok,code,steps:steps.slice()}}
function guardConfig(cfg){
 return !!cfg&&cfg.project===STAGING_PROJECT&&
  cfg.base===STAGING_URL&&cfg.origin===ALLOWED_ORIGIN&&
  cfg.endpoint===STAGING_URL+EDGE_PATH;
}
function identicalOwner(owner,server,cached){
 return typeof owner==='string'&&/^[a-f0-9-]{36}$/i.test(owner)&&
  owner===server?.id&&owner===cached?.user?.id;
}
async function verifiedSession(api,expected){
 const [user,session]=await Promise.all([api.getUser(),api.getSession()]);
 const owner=user?.id;
 const cached=session?.user;
 if(!owner||cached?.id!==owner||(expected&&owner!==expected))throw Error('uid_mismatch');
 if(!user.email_confirmed_at||user.is_anonymous===true)throw Error('unverified_owner');
 const rows=await api.ownerProbe();
 if(!Array.isArray(rows)||rows.length!==1||rows[0]?.user_id!==owner)throw Error('rls_owner_mismatch');
 return owner;
}
async function runControlledAcceptance({cfg,api,captcha,credentials,options={}}){
 // Most important property: code-level false means zero calls, even preflight.
 if(!ALLOW_REAL_OPERATIONS)return result(false,'test_window_locked');
 if(!guardConfig(cfg))return result(false,'wrong_staging_project');
 if(!api||!captcha||!credentials)return result(false,'missing_test_dependencies');
 const mode=options.mode||'bind_then_login';
 if(mode!=='bind_then_login'&&mode!=='login_existing_alias')return result(false,'unsupported_test_mode');
 const username=String(credentials.username||'');
 if(!USERNAME_RE.test(username))return result(false,'invalid_sample_username');
 // Caller must use a previously-approved existing Staging QA account.
 // Do not write or print passwords/JWT/CAPTCHA or user email.
 const steps=[],record=(v)=>steps.push(v);
 let sessionTouched=false;
 try{
  const state=await api.preflight();
  if(state?.status!==200||state.code!=='preflight_ok'||state.enabled!==true||
   state.registration_enabled!==false||state.scope!=='isolated_staging_only')
   return result(false,'server_window_closed',steps);
  record('server_open_staging_only');
  let expectedUid;
  if(mode==='bind_then_login'){
   const signed=await api.signInWithPassword(credentials);
   if(signed?.error||!signed?.data?.user?.id)throw Error('email_login_failed');
   sessionTouched=true;
   expectedUid=await verifiedSession(api);
   record('existing_uid_rls_pass');
   const bindToken=await captcha.take(EXPECTED_ACTIONS.bind);
   if(typeof bindToken!=='string'||bindToken.length<20)throw Error('captcha_bind_unavailable');
   const state2=await api.preflight();
   if(state2?.enabled!==true)throw Error('server_window_closed');
   const bind=await api.bindUsername({
    username, password:credentials.password, captcha_token:bindToken,
    action:'bind'
   });
   if(bind?.status===429)throw Error('rate_limited_stop');
   if(bind?.status!==200||bind.code!=='bind_success')throw Error('bind_not_accepted');
   record('bind_success');
   // Local only: preserve sessions on other devices and never global logout.
   await api.signOutLocal();
   sessionTouched=false;
   if(await api.getSession())throw Error('local_logout_failed');
   record('local_signout_pass');
  }else{
   const signed=await api.signInWithPassword(credentials);
   if(signed?.error||!signed?.data?.user?.id)throw Error('email_login_failed');
   sessionTouched=true;
   expectedUid=await verifiedSession(api);
   record('existing_uid_rls_pass');
   await api.signOutLocal();
   sessionTouched=false;
   if(await api.getSession())throw Error('local_logout_failed');
   record('local_signout_pass');
  }
  // A NEW widget is mandatory for username login. Never replay the bind token.
  const loginToken=await captcha.take(EXPECTED_ACTIONS.login);
  if(typeof loginToken!=='string'||loginToken.length<20)throw Error('captcha_login_unavailable');
  const state3=await api.preflight();
  if(state3?.enabled!==true)throw Error('server_window_closed');
  const login=await api.loginUsername({
   username,password:credentials.password,captcha_token:loginToken,action:'login'
  });
  if(login?.status===429)throw Error('rate_limited_stop');
  if(login?.status!==200||login.code!=='login_success'||!login.access_token||!login.refresh_token)
   throw Error('username_login_failed');
  record('username_login_grant_returned');
  // setSession MUST install in client of the same staging project.
  sessionTouched=true;
  const installed=await api.setSession({access_token:login.access_token,refresh_token:login.refresh_token});
  if(installed?.error||!installed?.data?.user?.id)throw Error('session_install_failed');
  const newUid=await verifiedSession(api,expectedUid);
  if(newUid!==expectedUid)throw Error('uid_mismatch');
  record('same_uid_rls_pass');
  return result(true,'staging_username_acceptance_pass',steps);
 }catch(error){
  const code=String(error?.message||'test_unavailable');
  const known=new Set(['uid_mismatch','rls_owner_mismatch','unverified_owner',
   'captcha_bind_unavailable','captcha_login_unavailable','server_window_closed',
   'bind_not_accepted','local_logout_failed','rate_limited_stop',
   'username_login_failed','email_login_failed','session_install_failed','test_unavailable']);
  return result(false,known.has(code)?code:'test_unavailable',steps);
 }finally{
  if(sessionTouched){try{await api.signOutLocal()}catch{}}
  // No secret material in return value, storage, URL or console.
 }
}
module.exports={
 runControlledAcceptance,guardConfig,identicalOwner,verifiedSession,
 STAGING_PROJECT,STAGING_URL,EDGE_PATH,EXPECTED_ACTIONS
};
