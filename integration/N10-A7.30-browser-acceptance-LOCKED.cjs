'use strict';
/*
 N10-A7.30 · Review-only browser acceptance composition.
 The production copy and any public QA Pages MUST stay hard-locked.
 Only hermetic CI replaces the single gate in a transient JS bundle.
*/
const ALLOW_BROWSER_ACCEPTANCE=false;
const PROJECT='ldivswlhtgmznzwhzsoi';
const BASE='https://'+PROJECT+'.supabase.co';
const ORIGIN='https://myintmoehein0115024.github.io';
const EDGE=BASE+'/functions/v1/mmh-n10a6-username';
const ACCEPT_CODES=Object.freeze(new Set([
 'staging_username_acceptance_pass','test_window_locked','wrong_staging_project',
 'server_window_closed','email_login_failed','unverified_owner','uid_mismatch',
 'rls_owner_mismatch','captcha_bind_unavailable','captcha_login_unavailable',
 'bind_not_accepted','rate_limited_stop','username_login_failed',
 'session_install_failed','local_logout_failed','test_unavailable'
]));
function contextAllowed(cfg,origin){
 return origin===ORIGIN&&cfg?.project===PROJECT&&cfg?.base===BASE&&
  cfg?.endpoint===EDGE&&cfg?.origin===ORIGIN&&
  /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(cfg?.publishableKey||'');
}
function sanitized(result){
 const code=ACCEPT_CODES.has(result?.code)?result.code:'test_unavailable';
 const clean=Array.isArray(result?.steps)?result.steps.filter(s=>
  typeof s==='string'&&/^[a-z_]{3,55}$/.test(s)).slice(0,14):[];
 return Object.freeze({ok:result?.ok===true&&code==='staging_username_acceptance_pass',
  code,steps:Object.freeze(clean)});
}
function createReviewBrowserAcceptance({cfg,origin,createSdk,createAdapter,createCaptcha,
 runController,now=Date.now,deadlineUTC}={}){
 // Hard lock fires before inspecting configs or accessing collaborators.
 if(!ALLOW_BROWSER_ACCEPTANCE)
  return Object.freeze({enabled:false,code:'browser_acceptance_hard_locked'});
 if(!contextAllowed(cfg,origin)||typeof createSdk!=='function'||
    typeof createAdapter!=='function'||typeof createCaptcha!=='function'||
    typeof runController!=='function'||typeof now!=='function')
  return Object.freeze({enabled:false,code:'browser_review_context_rejected'});
 const deadline=Date.parse(deadlineUTC);
 if(typeof deadlineUTC!=='string'||!Number.isFinite(deadline)||
   !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(deadlineUTC)||
   new Date(deadline).toISOString()!==deadlineUTC||deadline<=now())
  return Object.freeze({enabled:false,code:'browser_deadline_not_future'});
 let busy=false,used=false;
 async function run({mode,credentials}={}){
  if(busy)return Object.freeze({ok:false,code:'browser_run_in_progress',steps:[]});
  if(used)return Object.freeze({ok:false,code:'browser_run_already_used',steps:[]});
  used=true;busy=true;
  let sdk=null,captcha=null;
  let output={ok:false,code:'test_unavailable',steps:[]};
  try{
   if(now()>=deadline){output={ok:false,code:'server_window_closed'};return sanitized(output)}
   if(mode!=='bind_then_login'&&mode!=='login_existing_alias'){
    output={ok:false,code:'unsupported_test_mode'};return sanitized(output)
   }
   if(typeof credentials?.email!=='string'||typeof credentials?.password!=='string'||
      typeof credentials?.username!=='string'){
    output={ok:false,code:'missing_test_dependencies'};return sanitized(output)
   }
   sdk=createSdk();
   if(!sdk?.enabled||!sdk.client||typeof sdk.close!=='function')throw Error('sdk_unavailable');
   const adapter=createAdapter(sdk);
   if(!adapter?.enabled)throw Error('adapter_unavailable');
   captcha=createCaptcha();
   if(!captcha?.enabled||typeof captcha.take!=='function'||typeof captcha.close!=='function')
    throw Error('captcha_unavailable');
   output=sanitized(await runController({cfg,api:adapter,captcha,credentials,options:{mode}}));
  }catch{
   output={ok:false,code:'test_unavailable',steps:[]};
  }finally{
   try{captcha?.close?.()}catch{}
   if(sdk){
    try{
     const cleanup=await sdk.close();
     if(cleanup?.ok!==true)output={ok:false,code:'session_cleanup_unconfirmed',steps:[]}
    }catch{output={ok:false,code:'session_cleanup_unconfirmed',steps:[]}}
   }
   if(now()>=deadline)output={ok:false,code:'server_window_closed',steps:[]};
   busy=false;
  }
  // Never reveal credentials, JWT, UID, CAPTCHA or SDK errors in caller response.
  if(output.code==='session_cleanup_unconfirmed')
   return Object.freeze({ok:false,code:'session_cleanup_unconfirmed',steps:[]});
  return sanitized(output);
 }
 return Object.freeze({enabled:true,code:'review_runtime_isolated',run});
}
module.exports={createReviewBrowserAcceptance,contextAllowed,sanitized,PROJECT,BASE,EDGE,ORIGIN};
