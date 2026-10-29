/**
 * MMHVAULT N10-A7.16 — staging-only Cloudflare Siteverify plus atomic replay guard.
 * Protected by platform verify_jwt=true AND getUser + RLS owner-probe.
 * No login, no username binding, no account creation, no production references.
 * This diagnostic expires automatically at 2026-10-30 17:00 UTC.
 */
const STAGING='ldivswlhtgmznzwhzsoi';
const ORIGIN='https://myintmoehein0115024.github.io';
const HOSTNAME='myintmoehein0115024.github.io';
const DEADLINE='2026-10-30T17:00:00.000Z';
const MAX_BYTES=4096;
const env=k=>Deno.env.get(k)||'';
const BASE=env('SUPABASE_URL');
const ANON=env('SUPABASE_ANON_KEY');
const ADMIN=env('SUPABASE_SERVICE_ROLE_KEY');
const TURNSTILE=env('N10A6_TURNSTILE_SECRET');
const RATE_KEY=env('N10A6_RATE_HMAC_KEY');
const encode=new TextEncoder();
function headers(origin){
  return {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, private, max-age=0',
    'Pragma':'no-cache',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Vary':'Origin',
    ...(origin===ORIGIN?{
      'Access-Control-Allow-Origin':ORIGIN,
      'Access-Control-Allow-Headers':'authorization,apikey,content-type',
      'Access-Control-Allow-Methods':'POST,OPTIONS',
      'Access-Control-Max-Age':'120'
    }:{})
  };
}
function respond(origin,status,code){
  return new Response(JSON.stringify({ok:status>=200&&status<300,code}),
    {status,headers:headers(origin)});
}
function configured(){
  return BASE==='https://'+STAGING+'.supabase.co' &&
    ANON.length>20 && ADMIN.length>20 &&
    TURNSTILE.length>12 && RATE_KEY.length>=32;
}
async function readJson(req){
  const announced=req.headers.get('content-length');
  if(announced && (!/^\d+$/.test(announced)||Number(announced)>MAX_BYTES))
    return {error:'payload_too_large'};
  if(!req.body)return {error:'bad_json'};
  const reader=req.body.getReader();
  let bytes=0;const chunks=[];
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BYTES){
        await reader.cancel().catch(()=>{});
        return {error:'payload_too_large'};
      }
      chunks.push(value);
    }
  }catch{return {error:'bad_json'}}
  finally{reader.releaseLock()}
  try{
    const b=new Uint8Array(bytes);let idx=0;
    for(const ch of chunks){b.set(ch,idx);idx+=ch.length}
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
    if(!value||typeof value!=='object'||Array.isArray(value))return {error:'bad_json'};
    return {value};
  }catch{return {error:'bad_json'}}
}
const timeout=ms=>AbortSignal.timeout(ms);
async function jsonFetch(url,options){
  const response=await fetch(url,{...options,cache:'no-store',signal:timeout(8000)});
  if(!response.ok)return {status:response.status,data:null};
  const data=await response.json().catch(()=>null);
  return {status:response.status,data};
}
async function getIdentity(jwt){
  const r=await jsonFetch(BASE+'/auth/v1/user',{
    headers:{apikey:ANON,Authorization:'Bearer '+jwt,Accept:'application/json'}
  });
  const u=r.data;
  return r.status===200&&typeof u?.id==='string'&&u.id.length===36&&
    typeof u?.email==='string'&&!!u.email_confirmed_at&&!u.is_anonymous?u:null;
}
async function isExistingQaOwner(jwt,uid){
  const r=await jsonFetch(BASE+'/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2',{
    headers:{apikey:ANON,Authorization:'Bearer '+jwt,Accept:'application/json'}
  });
  return r.status===200&&Array.isArray(r.data)&&r.data.length===1&&r.data[0]?.user_id===uid;
}
async function quota(uid){
  const hmac=await crypto.subtle.importKey('raw',encode.encode(RATE_KEY),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',hmac,encode.encode('n10a15-siteverify:'+uid));
  const key=Array.from(new Uint8Array(signature),x=>x.toString(16).padStart(2,'0')).join('');
  const r=await jsonFetch(BASE+'/rest/v1/rpc/mmh_n10a6_take_attempt',{
    method:'POST',
    headers:{apikey:ADMIN,Authorization:'Bearer '+ADMIN,'Content-Type':'application/json'},
    body:JSON.stringify({p_key:key,p_limit:6,p_window_seconds:3600})
  });
  if(r.status!==200 || typeof r.data!=='boolean')throw Error('rate_unavailable');
  return r.data;
}
// Token replay defense: atomic single-use HMAC bucket, shared across workers.
// Never save raw CAPTCHA tokens, JWTs, or emails. 600s exceeds Turnstile 300s.
// A token is consumed BEFORE contacting Cloudflare; network errors fail closed.
async function claimOneTimeToken(token){
  const hmac=await crypto.subtle.importKey('raw',encode.encode(RATE_KEY),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',hmac,
    encode.encode('n10a15-token-single-use:'+token));
  const key=Array.from(new Uint8Array(signature),x=>x.toString(16).padStart(2,'0')).join('');
  const r=await jsonFetch(BASE+'/rest/v1/rpc/mmh_n10a6_take_attempt',{
    method:'POST',
    headers:{apikey:ADMIN,Authorization:'Bearer '+ADMIN,'Content-Type':'application/json'},
    body:JSON.stringify({p_key:key,p_limit:1,p_window_seconds:600})
  });
  if(r.status!==200 || typeof r.data!=='boolean')throw Error('one_time_bucket_unavailable');
  return r.data;
}
async function siteverify(token,expectedAction){
  const r=await jsonFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({secret:TURNSTILE,response:token})
  });
  if(r.status!==200||!r.data||typeof r.data.success!=='boolean')
    throw Error('siteverify_unavailable');
  return r.data.success===true && r.data.hostname===HOSTNAME && r.data.action===expectedAction;
}
async function handler(request){
  const origin=request.headers.get('Origin');
  if(request.method==='OPTIONS')
    return new Response(null,{status:204,headers:headers(origin)});
  if(origin!==ORIGIN)return respond(origin,403,'origin_not_allowed');
  if(request.method!=='POST')return respond(origin,405,'method_not_allowed');
  if(Date.now()>=Date.parse(DEADLINE))return respond(origin,410,'qa_window_expired');
  if(!configured())return respond(origin,503,'qa_not_configured');
  const auth=/^Bearer\s+([^\s]+)$/i.exec(request.headers.get('Authorization')||'');
  if(!auth)return respond(origin,401,'authentication_required');
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))
    return respond(origin,415,'json_required');
  const parsed=await readJson(request);
  if(parsed.error)return respond(origin,parsed.error==='payload_too_large'?413:400,parsed.error);
  const {action,expected_action,captcha_token}=parsed.value;
  if(action!=='verify')return respond(origin,400,'invalid_qa_action');
  if(!['mmh_n10a6_login','mmh_n10a6_bind'].includes(expected_action))
    return respond(origin,400,'invalid_test_action');
  if(typeof captcha_token!=='string'||captcha_token.length<20||captcha_token.length>2048)
    return respond(origin,400,'invalid_token');
  try{
    const identity=await getIdentity(auth[1]);
    if(!identity)return respond(origin,401,'authentication_required');
    if(!await isExistingQaOwner(auth[1],identity.id))
      return respond(origin,403,'not_qa_owner');
    if(Date.now()>=Date.parse(DEADLINE))return respond(origin,410,'qa_window_expired');
    if(!await quota(identity.id))return respond(origin,429,'qa_rate_limited');
    if(!await claimOneTimeToken(captcha_token))return respond(origin,403,'token_replayed');
    const verified=await siteverify(captcha_token,expected_action);
    return respond(origin,verified?200:403,verified?'siteverify_pass':'siteverify_rejected');
  }catch{
    return respond(origin,503,'qa_service_unavailable');
  }
}
Deno.serve(handler);
