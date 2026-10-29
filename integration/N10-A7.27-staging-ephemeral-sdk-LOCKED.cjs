'use strict';
/*
 N10-A7.27 · ISOLATED STAGING SDK BOOTSTRAP (REVIEW ONLY).
 Do not deploy as active authentication. No real SDK is initialized when locked.
 Tests may change this single gate only inside an isolated Node VM with synthetic dependencies.
*/
const STAGING_SDK_BOOTSTRAP_ENABLED=false;
const PROJECT='ldivswlhtgmznzwhzsoi';
const BASE='https://'+PROJECT+'.supabase.co';
const EDGE=BASE+'/functions/v1/mmh-n10a6-username';
const HOST='https://myintmoehein0115024.github.io';
const PROBE='mmh_n10a6_auth_owner_probe';
let active=false;
function validContext(cfg,origin){
 return cfg?.project===PROJECT&&cfg.base===BASE&&cfg.endpoint===EDGE&&
  cfg.origin===HOST&&origin===HOST&&
  /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(cfg.publishableKey||'');
}
function isolatedStorage(){
 const items=new Map();
 return {
  getItem:key=>items.has(key)?items.get(key):null,
  setItem:(key,val)=>{items.set(key,String(val))},
  removeItem:key=>{items.delete(key)},
  clear:()=>items.clear()
 };
}
function target(input){
 // SDK fetch takes string, URL or Request. The request must have an absolute URL.
 const raw=typeof input==='string'?input:input?.url||input?.href;
 if(typeof raw!=='string')throw Error('network_target_rejected');
 let u;
 try{u=new URL(raw)}catch{throw Error('network_target_rejected')}
 if(u.origin!==BASE||u.username||u.password||u.hash)throw Error('network_target_rejected');
 return u;
}
function methodOf(input,options){
 return String(options?.method||input?.method||'GET').toUpperCase();
}
function onlyKnownSdkRequest(input,options){
 const url=target(input),method=methodOf(input,options);
 if(url.pathname==='/auth/v1/token' && method==='POST' &&
  ['password','refresh_token'].includes(url.searchParams.get('grant_type')) &&
  url.searchParams.size===1)return true;
 if(url.pathname==='/auth/v1/user' && method==='GET' &&
  !url.search)return true;
 if(url.pathname==='/auth/v1/logout' && method==='POST' &&
  url.searchParams.get('scope')==='local'&&url.searchParams.size===1)return true;
 if(url.pathname==='/rest/v1/'+PROBE && method==='GET' &&
  url.searchParams.get('select')==='user_id'&&
  url.searchParams.get('limit')==='2'&&url.searchParams.size===2)return true;
 throw Error('unapproved_sdk_endpoint');
}
function createSdkGuard(fetcher){
 return async function sdkFetch(input,options){
  onlyKnownSdkRequest(input,options);
  return fetcher(input,{...options,method:methodOf(input,options),credentials:'omit',
    redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
 };
}
function createEdgeGuard(fetcher){
 return async function edgeFetch(url,options={}){
  if(url!==EDGE||String(options.method||'').toUpperCase()!=='POST' ||
    options.credentials!=='omit'||options.mode!=='cors')throw Error('unapproved_edge_target');
  let body;
  try{body=JSON.parse(options.body)}catch{throw Error('unapproved_edge_payload')}
  if(!body||Array.isArray(body)||!['preflight','login','bind'].includes(body.action))
    throw Error('unapproved_edge_payload');
  // Never log payload. Captcha, password and identity remain transient request data.
  return fetcher(url,{...options,redirect:'error',referrerPolicy:'no-referrer',
    credentials:'omit',cache:'no-store'});
 };
}
function createIsolatedStagingSdk({cfg,origin,createClient,fetcher,randomUUID}={}){
 // CODE LOCK FIRST: no SDK init, random number, credential or network calls.
 if(!STAGING_SDK_BOOTSTRAP_ENABLED)return {enabled:false,code:'staging_sdk_bootstrap_locked'};
 if(active)return {enabled:false,code:'another_test_session_exists'};
 if(!validContext(cfg,origin)||typeof createClient!=='function'||
   typeof fetcher!=='function'||typeof randomUUID!=='function')
   return {enabled:false,code:'wrong_project_or_dependencies'};
 let nonce;
 try{nonce=randomUUID()}catch{return {enabled:false,code:'session_nonce_unavailable'}}
 if(typeof nonce!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce))
  return {enabled:false,code:'session_nonce_unavailable'};
 const storage=isolatedStorage();
 const sdkFetch=createSdkGuard(fetcher);
 const edgeFetch=createEdgeGuard(fetcher);
 let client;
 active=true;
 try{
  client=createClient(BASE,cfg.publishableKey,{
   auth:{
    persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
    flowType:'implicit',storageKey:'mmh-n10a27-tab-'+nonce,storage
   },global:{fetch:sdkFetch}
  });
  if(!client?.auth||typeof client.from!=='function'||
   !['signInWithPassword','getUser','getSession','setSession','signOut']
     .every(k=>typeof client.auth[k]==='function'))throw Error('sdk_shape_invalid');
 }catch{
  active=false;storage.clear();
  return {enabled:false,code:'sdk_creation_failed'};
 }
 let closed=false;
 const auth=client.auth;
 const facade=Object.freeze({
  auth:Object.freeze({
   signInWithPassword:credentials=>auth.signInWithPassword(credentials),
   getUser:()=>auth.getUser(),
   getSession:()=>auth.getSession(),
   setSession:tokens=>auth.setSession(tokens),
   // The only signout is the current QA local session, never global/device-wide.
   signOut:arg=>{
    if(arg?.scope!=='local')throw Error('global_signout_forbidden');
    return auth.signOut({scope:'local'});
   }
  }),
  from:table=>{
   if(table!==PROBE)throw Error('non_owner_table_forbidden');
   return client.from(PROBE);
  }
 });
 async function close(){
  if(closed)return {ok:true,code:'already_closed'};
  let confirmed=false;
  try{
   const logout=await facade.auth.signOut({scope:'local'});
   if(logout?.error)throw Error('logout_rejected');
   const session=await facade.auth.getSession();
   if(session?.error||session?.data?.session)throw Error('session_remains');
   confirmed=true;
  }catch{confirmed=false}
  try{await auth.dispose?.()}catch{}
  storage.clear();closed=true;active=false;
  return {ok:confirmed,code:confirmed?'local_session_cleared':'session_cleanup_unconfirmed'};
 }
 return Object.freeze({
  enabled:true,code:'isolated_staging_sdk_review',
  // Review adapter receives only the restricted facade and Edge transport.
  client:facade,transport:edgeFetch,close
 });
}
module.exports={
 createIsolatedStagingSdk,validContext,isolatedStorage,
 onlyKnownSdkRequest,createSdkGuard,createEdgeGuard,BASE,EDGE,HOST
};
