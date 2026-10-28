'use strict';
/**
 * N10-A7.18 — ISOLATED PREVIEW CONTRACT ONLY.
 * Not imported by production login.html; not active in GitHub Pages.
 * QA tests turn the gate on only inside an in-memory VM.
 *
 * This is an example handoff contract, not a production-ready integration.
 */
const MMH_USERNAME_HANDOFF_LIVE=false;
async function usernameHandoffPreview({
  client, supabaseUrl, endpoint, expectedProjectRef,
  username, password, captchaToken, transport=fetch
}) {
  if(!MMH_USERNAME_HANDOFF_LIVE)return {ok:false,code:'preview_disabled'};
  // Ref validation must not use an Origin value provided by an untrusted user.
  if(!/^[a-z0-9]{20}$/.test(expectedProjectRef||''))return {ok:false,code:'project_not_allowed'};
  if(supabaseUrl!=='https://'+expectedProjectRef+'.supabase.co')return {ok:false,code:'project_mismatch'};
  let u;
  try{u=new URL(endpoint)}catch{return {ok:false,code:'endpoint_invalid'}}
  if(u.origin!==supabaseUrl||u.pathname!=='/functions/v1/mmh-n10a6-username'||u.search||u.hash)
    return {ok:false,code:'endpoint_mismatch'};
  if(!client?.auth?.setSession||!client.auth.getUser||!client.auth.getSession)
    return {ok:false,code:'client_unavailable'};
  if(!/^[a-z][a-z0-9_]{3,19}$/.test(username||'') ||
     typeof password!=='string'||!password.length||password.length>1024 ||
     typeof captchaToken!=='string'||captchaToken.length<20||captchaToken.length>2048)
    return {ok:false,code:'invalid_input'};
  const request=async(body)=>{
    const response=await transport(endpoint,{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const value=await response.json().catch(()=>null);
    return {status:response.status,value};
  };
  let handedOff=false,verifiedSuccess=false;
  try{
    const pre=await request({action:'preflight'});
    if(pre.status!==200||pre.value?.enabled!==true||pre.value?.registration_enabled!==false)
      return {ok:false,code:'backend_disabled'};
    const result=await request({action:'login',username,password,captcha_token:captchaToken});
    if(result.status!==200||result.value?.code!=='login_success')
      return {ok:false,code:'login_rejected'};
    const {access_token,refresh_token}=result.value;
    if(typeof access_token!=='string'||access_token.length<10||access_token.length>8192||
       typeof refresh_token!=='string'||refresh_token.length<10||refresh_token.length>8192)
      return {ok:false,code:'malformed_session'};
    handedOff=true;
    const switched=await client.auth.setSession({access_token,refresh_token});
    if(switched.error||!switched.data?.user?.id)return {ok:false,code:'invalid_session'};
    const uid=switched.data.user.id;
    const remote=await client.auth.getUser();
    const local=await client.auth.getSession();
    if(remote.error||local.error||remote.data?.user?.id!==uid||
       local.data?.session?.user?.id!==uid)
      return {ok:false,code:'uid_verification_failed'};
    // The calling PRODUCTION login.html must STILL call its own
    // verifiedRedirectV946(uid), which repeats getUser/getSession checks.
    // Do not navigate, write financial records, or create another auth user here.
    verifiedSuccess=true;
    return {ok:true,uid};
  }catch{
    return {ok:false,code:'authentication_unavailable'};
  }finally{
    // Failure AFTER installing a new session must never retain unverified tokens.
    // Never use global signout; never revoke other devices.
    if(handedOff && !verifiedSuccess){try{await client.auth.signOut({scope:'local'})}catch{}}
  }
}
module.exports={usernameHandoffPreview};
