'use strict';
/* N10-A7.29 · REVIEW-ONLY Turnstile action adapter; never deployed unlocked.
 * No secret keys, credentials, token persistence or logging.
 * CI may switch the immutable gate only in a hermetic VM with fake widgets. */
const ALLOW_TURNSTILE_ACTIONS=false;
const ORIGIN='https://myintmoehein0115024.github.io';
const ACTIONS=Object.freeze(['mmh_n10a6_login','mmh_n10a6_bind']);
function validConfig({origin,sitekey,turnstile,makeContainer,timeoutMs}={}){
 return origin===ORIGIN&&typeof sitekey==='string'&&
  /^[A-Za-z0-9_-]{20,90}$/.test(sitekey)&&
  typeof turnstile?.render==='function'&&typeof turnstile?.execute==='function'&&
  typeof turnstile?.remove==='function'&&typeof makeContainer==='function'&&
  Number.isInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=120000;
}
function createActionProvider({origin,sitekey,turnstile,makeContainer,timeoutMs=90000,
 setDelay=setTimeout,clearDelay=clearTimeout}={}){
 if(!ALLOW_TURNSTILE_ACTIONS)return Object.freeze({enabled:false,code:'turnstile_review_locked'});
 if(!validConfig({origin,sitekey,turnstile,makeContainer,timeoutMs})||
  typeof setDelay!=='function'||typeof clearDelay!=='function')
  return Object.freeze({enabled:false,code:'invalid_staging_turnstile_config'});
 let closed=false,busy=false,pendingAbort=null;
 async function take(action){
  if(closed)throw Error('turnstile_closed');
  if(busy)throw Error('turnstile_busy');
  if(!ACTIONS.includes(action))throw Error('turnstile_action_not_allowed');
  busy=true;
  let widget=null,handle=null,container=null,done=false;
  const cleanup=()=>{
   if(handle!==null){clearDelay(handle);handle=null}
   if(widget!==null){try{turnstile.remove(widget)}catch{}widget=null}
   try{container?.remove?.()}catch{}
   pendingAbort=null;busy=false;
  };
  try{
   container=makeContainer(action);
   if(!container)throw Error('turnstile_container_unavailable');
   return await new Promise((resolve,reject)=>{
    function settle(error,token){
     if(done)return;done=true;cleanup();
     if(error){reject(error);return}
     if(typeof token!=='string'||token.length<20||token.length>2048){
      reject(Error('turnstile_invalid_token'));return
     }
     resolve(token);
    }
    pendingAbort=()=>settle(Error('turnstile_closed'));
    handle=setDelay(()=>settle(Error('turnstile_timeout')),timeoutMs);
    try{
     widget=turnstile.render(container,{
      sitekey,action,execution:'execute',appearance:'execute',theme:'dark',
      callback:token=>Promise.resolve().then(()=>settle(null,token)),
      'error-callback':()=>settle(Error('turnstile_failed')),
      'expired-callback':()=>settle(Error('turnstile_expired')),
      'timeout-callback':()=>settle(Error('turnstile_timeout'))
     });
     if(widget===null||widget===undefined)throw Error('turnstile_widget_unavailable');
     turnstile.execute(widget);
    }catch{settle(Error('turnstile_widget_unavailable'))}
   });
  }finally{if(busy&&pendingAbort===null)cleanup()}
 }
 function close(){closed=true;if(pendingAbort)pendingAbort();return {ok:true,code:'turnstile_provider_closed'}}
 return Object.freeze({enabled:true,code:'staging_review_only',take,close});
}
module.exports={createActionProvider,validConfig,ACTIONS,ORIGIN};
