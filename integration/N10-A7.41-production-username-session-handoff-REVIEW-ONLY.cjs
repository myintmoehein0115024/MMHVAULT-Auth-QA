'use strict';
/**
 * N10-A7.41 · Production login.html USERNAME SESSION HANDOFF CANDIDATE
 * REVIEW ONLY · NO DEPLOY · NO PROD API CALLS · GATE MUST REMAIN FALSE.
 *
 * Preserve existing production login.html verifiedRedirectV946. The username
 * server, when independently approved in PROD, must verify username/password,
 * Turnstile hostname and action, perform replay guard/rate limit, check original
 * Supabase Auth UID, and return the original same-project session tokens.
 *
 * Never copy isolated Staging Edge, secrets, captcha sitekey or test accounts to
 * production. Do not use raw JWT as proof for finance data authorization.
 */
const ENABLE_PRODUCTION_USERNAME_LOGIN=false;
const PRODUCTION_SUPABASE_URL='https://vrypucmyrztxgiqhjspd.supabase.co';
const MAX_TOKEN_BYTES=12000;
function isUserId(s){return typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s)}
function result(ok,code,uid){return {ok,code,...(uid?{user_id:uid}:{})}}
function validGrant(x){
 return x&&x.code==='login_success'&&typeof x.access_token==='string'&&x.access_token.length>30&&
 x.access_token.length<=MAX_TOKEN_BYTES&&typeof x.refresh_token==='string'&&
 x.refresh_token.length>0&&x.refresh_token.length<=MAX_TOKEN_BYTES;
}
async function verifySessionAndHandoff({db,grant,verifiedRedirect,clientUrl}){
 // Pure contract for sandbox testing only. Caller MUST enforce runtime lock,
 // trusted prod Edge + approved captcha before passing a grant to this function.
 if(!db||!db.auth||typeof db.auth.getUser!=='function'||
    typeof db.auth.getSession!=='function'||typeof db.auth.setSession!=='function'||
    typeof db.auth.signOut!=='function'||typeof verifiedRedirect!=='function'||
    clientUrl!==PRODUCTION_SUPABASE_URL||db.supabaseUrl!==PRODUCTION_SUPABASE_URL)
    return result(false,'prod_project_or_client_invalid');
 if(!validGrant(grant))return result(false,'unverified_grant');
 let installed=false,uid='';
 try {
   // Reject cross-user replacement of an existing session. Never revoke a prior
   // device or reuse a second user's financial state.
   const before=await db.auth.getSession();
   if(before?.error)return result(false,'precheck_failed');
   if(before?.data?.session?.user?.id)return result(false,'existing_session_requires_logout');
   const installedResult=await db.auth.setSession({
     access_token:grant.access_token,refresh_token:grant.refresh_token
   });
   if(installedResult?.error||!installedResult?.data?.session)
     return result(false,'session_install_failed');
   installed=true;
   const info=await db.auth.getUser();
   const current=await db.auth.getSession();
   const user=info?.data?.user,session=current?.data?.session;
   if(info?.error||current?.error||!isUserId(user?.id)||
      user.id!==session?.user?.id||
      user.id!==installedResult?.data?.session?.user?.id||
      !user.email_confirmed_at||user.is_anonymous===true)
      throw Error('uid_mismatch_or_unverified');
   uid=user.id;
   const redirected=await verifiedRedirect(uid);
   if(redirected!==true)throw Error('verified_redirect_rejected');
   return result(true,'verified_same_uid_redirected',uid);
 } catch {
   return result(false,'uid_or_redirect_check_failed');
 } finally {
   if(installed&&(!uid||typeof verifiedRedirect!=='function')){
     try{await db.auth.signOut({scope:'local'})}catch{}
   }
 }
}
async function invokeProductionUsernameLogin(){
 if(!ENABLE_PRODUCTION_USERNAME_LOGIN)return result(false,'not_released');
 return result(false,'server_endpoint_not_yet_authorized');
}
if(typeof module==='object'&&module.exports){
 module.exports={PRODUCTION_SUPABASE_URL,ENABLE_PRODUCTION_USERNAME_LOGIN,
   verifySessionAndHandoff,invokeProductionUsernameLogin,validGrant};
}
