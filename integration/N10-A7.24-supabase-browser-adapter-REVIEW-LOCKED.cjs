'use strict';
/*
 N10-A7.24 REVIEW-ONLY Staging SDK/Edge adapter, NOT active in any web page.
 No data is transferred unless the fixed gate is explicitly changed after separate approval.
 This file deliberately does NOT initialize a Supabase client or obtain credentials.
*/
const STAGING_ADAPTER_ENABLED=false;
const PROJECT='ldivswlhtgmznzwhzsoi';
const BASE='https://'+PROJECT+'.supabase.co';
const EDGE=BASE+'/functions/v1/mmh-n10a6-username';
const HOST='https://myintmoehein0115024.github.io';
const OWNER_TABLE='mmh_n10a6_auth_owner_probe';
function isValidContext(cfg){
 return cfg?.project===PROJECT&&cfg?.base===BASE&&cfg?.endpoint===EDGE&&
 cfg?.origin===HOST&&typeof cfg?.publishableKey==='string'&&
 /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(cfg.publishableKey);
}
function strictResult(data){
 return data&&typeof data==='object'&&!Array.isArray(data)&&typeof data.code==='string'&&data.code.length<90;
}
function makeStagingAdapter({cfg,client,transport}){
 // Default lock runs BEFORE inspecting configuration or invoking any dependency.
 if(!STAGING_ADAPTER_ENABLED)return {enabled:false,code:'review_locked'};
 if(!isValidContext(cfg)||!client?.auth||!client?.from||typeof transport!=='function')
   return {enabled:false,code:'wrong_project_or_client'};
 const auth=client.auth;
 if(!['getUser','getSession','signInWithPassword','signOut','setSession'].every(k=>typeof auth[k]==='function'))
   return {enabled:false,code:'auth_sdk_unavailable'};
 let busy=false;
 async function post(action,fields={},accessToken=null){
  if(!['preflight','login','bind'].includes(action))throw Error('unsupported_action');
  // This adapter can only reach this hardcoded URL. Origin is enforced by browser.
  if(busy)throw Error('request_in_progress');
  busy=true;
  try{
   const headers={'Content-Type':'application/json','apikey':cfg.publishableKey};
   if(accessToken)headers.Authorization='Bearer '+accessToken;
   const reply=await transport(EDGE,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',
    headers,body:JSON.stringify({action,...fields})
   });
   if(!Number.isInteger(reply?.status)||reply.status<200||reply.status>599)
     throw Error('invalid_http_result');
   const value=await reply.json();
   if(!strictResult(value))throw Error('invalid_server_response');
   // Only known public code is returned for failed requests; no JSON/body echo.
   if(reply.status!==200)return {status:reply.status,code:value.code};
   if(action==='preflight'){
    return {status:200,code:value.code,enabled:value.enabled===true,
      registration_enabled:value.registration_enabled===true,scope:value.scope};
   }
   if(action==='bind')return {status:200,code:value.code};
   if(value.code!=='login_success'||typeof value.access_token!=='string'||
      typeof value.refresh_token!=='string'||value.access_token.length<10||
      value.refresh_token.length<10||value.access_token.length>8192||
      value.refresh_token.length>8192)throw Error('invalid_server_response');
   // Token strings travel only in process memory to the same-project SDK.
   return {status:200,code:value.code,
    access_token:value.access_token,refresh_token:value.refresh_token};
  }finally{busy=false}
 }
 async function getUser(){
  const r=await auth.getUser();
  if(r?.error||!r?.data?.user?.id)throw Error('remote_auth_failed');
  return r.data.user;
 }
 async function getSession(){
  const r=await auth.getSession();
  if(r?.error)throw Error('cached_auth_failed');
  return r?.data?.session||null;
 }
 async function ownerProbe(){
  const q=client.from(OWNER_TABLE);
  const r=await q.select('user_id').limit(2);
  if(r?.error||!Array.isArray(r?.data))throw Error('owner_probe_unavailable');
  return r.data;
 }
 async function signInWithPassword(credentials){
  if(typeof credentials?.email!=='string'||!credentials.email.includes('@')||
     typeof credentials?.password!=='string'||credentials.password.length<1)
    return {error:{code:'invalid_sample_credentials'}};
  return auth.signInWithPassword({email:credentials.email,password:credentials.password});
 }
 async function signedBind(fields){
  const owner=await getUser();
  const session=await getSession();
  if(owner.id!==session?.user?.id||!owner.email_confirmed_at||owner.is_anonymous===true)
    throw Error('identity_mismatch');
  const rows=await ownerProbe();
  if(rows.length!==1||rows[0]?.user_id!==owner.id)throw Error('owner_probe_rejected');
  if(!session.access_token)throw Error('missing_session_token');
  return post('bind',{
    username:fields.username,password:fields.password,
    captcha_token:fields.captcha_token
  },session.access_token);
 }
 async function signOutLocal(){
  const r=await auth.signOut({scope:'local'});
  if(r?.error)throw Error('local_signout_failed');
 }
 async function setSession(tokens){
  if(!tokens?.access_token||!tokens?.refresh_token)throw Error('missing_session_token');
  return auth.setSession(tokens);
 }
 return {
  enabled:true,code:'review_unlocked_in_isolated_test_only',
  preflight:()=>post('preflight'),
  signInWithPassword,getUser,getSession,ownerProbe,
  bindUsername:signedBind,
  loginUsername:f=>post('login',{username:f.username,password:f.password,captcha_token:f.captcha_token}),
  setSession,signOutLocal
 };
}
module.exports={makeStagingAdapter,isValidContext,PROJECT,BASE,EDGE,HOST};
