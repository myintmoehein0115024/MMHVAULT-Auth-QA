/**
 * MMHVAULT N10-A7.17 · isolated Staging only; atomic CAPTCHA replay hardening (CLOSED).
 * This is a review build for staging verification, NOT a production login service.
 * Deploying with verify_jwt=false is necessary for future pre-login requests;
 * login and bind remain disabled by hardcoded gate and expired time window.
 */
const STAGING_PROJECT_ID = 'ldivswlhtgmznzwhzsoi';
const ORIGIN = 'https://mmhvault-auth-g10g11-locked.pages.dev';
const HOSTNAME = 'mmhvault-auth-g10g11-locked.pages.dev';
const CODE_GATE_OPEN = false; // DO NOT CHANGE DURING N10-A7.2
const WINDOW_START_UTC = '1970-01-01T00:00:00.000Z';
const WINDOW_END_UTC = '1970-01-01T00:00:00.000Z';
const MAX_WINDOW_MS = 15 * 60 * 1000;
const NAME_RE = /^[a-z][a-z0-9_]{3,19}$/;
const RESERVED = new Set(['admin','administrator','root','system','support','mmhvault','security','billing','help']);
const enc = new TextEncoder();
const env = (name) => Deno.env.get(name) || '';
const BASE = env('SUPABASE_URL');
const PUBLISHABLE = env('SUPABASE_ANON_KEY');
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const TURNSTILE_SECRET = env('N10A6_TURNSTILE_SECRET');
const RATE_SALT = env('N10A6_RATE_HMAC_KEY');

function boundedWindow() {
  const start = Date.parse(WINDOW_START_UTC);
  const end = Date.parse(WINDOW_END_UTC);
  const now = Date.now();
  return Number.isFinite(start) && Number.isFinite(end) && end > start &&
    end - start <= MAX_WINDOW_MS && now >= start && now < end;
}
function configured() {
  return BASE === 'https://' + STAGING_PROJECT_ID + '.supabase.co' &&
    PUBLISHABLE.length > 20 && SERVICE.length > 20 &&
    TURNSTILE_SECRET.length > 12 && RATE_SALT.length >= 32;
}
function ready() {
  return CODE_GATE_OPEN && boundedWindow() && configured() &&
    env('N10A6_STAGING_ENABLED') === 'true';
}
function responseHeaders(origin) {
  return {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, private, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Pragma':'no-cache',
    'Vary':'Origin',
    ...(origin === ORIGIN ? {
      'Access-Control-Allow-Origin':ORIGIN,
      'Access-Control-Allow-Headers':'content-type,apikey,authorization,x-client-info,x-retry-count',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Max-Age':'120'
    } : {})
  };
}
function respond(origin,status,code,additional={}) {
  return new Response(JSON.stringify({ok:status>=200 && status<300,code,...additional}),
    {status,headers:responseHeaders(origin)});
}
function nameKey(value) {
  if (typeof value !== 'string') return null;
  const v=value.trim().toLowerCase();
  return NAME_RE.test(v) && !RESERVED.has(v) ? v : null;
}
function adminHeaders(extra={}) {
  return {apikey:SERVICE,Authorization:'Bearer '+SERVICE,Accept:'application/json',...extra};
}
function clientHeaders(access='',extra={}) {
  return {apikey:PUBLISHABLE,...(access ? {Authorization:'Bearer '+access} : {}),
    Accept:'application/json',...extra};
}
function timeout(ms=8000) { return AbortSignal.timeout(ms); }
async function jsonResponse(resp) { return resp.json().catch(()=>null); }
async function hmacTag(input) {
  const key=await crypto.subtle.importKey('raw',enc.encode(RATE_SALT),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,enc.encode('n10a6:'+input));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
async function quota(bucket,max,seconds) {
  const r=await fetch(BASE+'/rest/v1/rpc/mmh_n10a6_take_attempt',{
    method:'POST',cache:'no-store',signal:timeout(),
    headers:adminHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({p_key:await hmacTag(bucket),p_limit:max,p_window_seconds:seconds})
  });
  if(!r.ok) throw Error('limiter_unavailable');
  const v=await jsonResponse(r);
  if(typeof v!=='boolean') throw Error('limiter_unavailable');
  return v;
}
// N10-A7.17: same token-HMAC namespace as the independent Siteverify QA.
// Atomic DB bucket means only one backend action can accept a given token.
// 600s protects beyond the five-minute Cloudflare token lifetime.
// Never persist raw token, JWT or account identifiers in this bucket.
async function claimSingleUseCaptcha(token) {
  const key=await crypto.subtle.importKey('raw',enc.encode(RATE_SALT),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,
    enc.encode('n10a15-token-single-use:'+token));
  const bucket=Array.from(new Uint8Array(signature),x=>x.toString(16).padStart(2,'0')).join('');
  const r=await fetch(BASE+'/rest/v1/rpc/mmh_n10a6_take_attempt',{
    method:'POST',cache:'no-store',signal:timeout(),
    headers:adminHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({p_key:bucket,p_limit:1,p_window_seconds:600})
  });
  if(!r.ok) throw Error('single_use_unavailable');
  const v=await jsonResponse(r);
  if(typeof v!=='boolean') throw Error('single_use_unavailable');
  return v;
}
async function captcha(token,action) {
  if(typeof token!=='string' || token.length<20 || token.length>2048) return false;
  const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',cache:'no-store',signal:timeout(),
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({secret:TURNSTILE_SECRET,response:token})
  });
  if(!r.ok) throw Error('captcha_unavailable');
  const j=await jsonResponse(r);
  return j?.success === true && j?.hostname === HOSTNAME && j?.action === action;
}
async function identity(access) {
  if(!access || typeof access!=='string' || access.length>8192) return null;
  const r=await fetch(BASE+'/auth/v1/user',{
    headers:clientHeaders(access),cache:'no-store',signal:timeout()
  });
  if(!r.ok) return null;
  const u=await jsonResponse(r);
  return typeof u?.id==='string' && u.id.length===36 ? u : null;
}
async function lookup(name) {
  const r=await fetch(BASE+'/rest/v1/mmh_n10a6_username_links?select=user_id&username_key=eq.'+
    encodeURIComponent(name)+'&limit=2',{
      headers:adminHeaders(),cache:'no-store',signal:timeout()
    });
  if(!r.ok) throw Error('lookup_unavailable');
  const rows=await jsonResponse(r);
  return Array.isArray(rows) && rows.length===1 && typeof rows[0]?.user_id==='string'
    ? rows[0].user_id : null;
}
async function verifiedEmail(uid) {
  const r=await fetch(BASE+'/auth/v1/admin/users/'+encodeURIComponent(uid),{
    headers:adminHeaders(),cache:'no-store',signal:timeout()
  });
  if(!r.ok) throw Error('user_lookup_unavailable');
  const u=await jsonResponse(r);
  if(u?.id!==uid || !u.email_confirmed_at || typeof u.email!=='string' || u.is_anonymous) return null;
  return u.email;
}
async function revokeProof(jwt) {
  if(!jwt) return;
  try {
    await fetch(BASE+'/auth/v1/logout?scope=local',{
      method:'POST',headers:clientHeaders(jwt),cache:'no-store',signal:timeout(5000)
    });
  } catch { /* best effort; access JWT may remain usable until expiry */ }
}
async function provePassword(email,password,expectedUid) {
  const r=await fetch(BASE+'/auth/v1/token?grant_type=password',{
    method:'POST',cache:'no-store',signal:timeout(10000),
    headers:clientHeaders('',{'Content-Type':'application/json'}),
    body:JSON.stringify({email,password})
  });
  if(!r.ok) return null;
  const grant=await jsonResponse(r);
  if(typeof grant?.access_token!=='string' || typeof grant?.refresh_token!=='string') return null;
  try {
    const verified=await identity(grant.access_token);
    return {grant,matches:verified?.id===expectedUid};
  } catch(err) {
    await revokeProof(grant.access_token);
    throw err;
  }
}
async function ownerProbe(jwt,uid) {
  const r=await fetch(BASE+'/rest/v1/mmh_n10a6_auth_owner_probe?select=user_id&limit=2',{
    headers:clientHeaders(jwt),cache:'no-store',signal:timeout()
  });
  if(!r.ok) return false;
  const rows=await jsonResponse(r);
  return Array.isArray(rows) && rows.length===1 && rows[0]?.user_id===uid;
}
async function claim(uid,name) {
  const r=await fetch(BASE+'/rest/v1/rpc/mmh_n10a6_claim_username',{
    method:'POST',headers:adminHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({p_user_id:uid,p_username:name,p_window_end:WINDOW_END_UTC}),
    cache:'no-store',signal:timeout()
  });
  if(!r.ok) throw Error('claim_unavailable');
  const v=await jsonResponse(r);
  if(typeof v!=='boolean') throw Error('claim_unavailable');
  return v;
}
async function handle(request) {
  const origin=request.headers.get('Origin');
  if(request.method==='OPTIONS' && origin!==ORIGIN) return respond(origin,403,'origin_not_allowed');
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:responseHeaders(origin)});
  if(origin!==ORIGIN) return respond(origin,403,'origin_not_allowed');
  if(request.method!=='POST') return respond(origin,405,'method_not_allowed');
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))
    return respond(origin,415,'json_required');
  // N10-A7.11: bound the byte count BEFORE assembling/parsing JSON.
  // Content-Length alone is untrusted; enforce the cap on streamed chunks too.
  let data;
  const contentLength=request.headers.get('content-length');
  if(contentLength!==null && (!/^\d+$/.test(contentLength) || Number(contentLength)>4000))
    return respond(origin,413,'payload_too_large');
  if(!request.body) return respond(origin,400,'bad_json');
  const reader=request.body.getReader();
  const parts=[];let bytes=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      bytes += value?.byteLength||0;
      if(bytes>4000) {
        await reader.cancel().catch(()=>{});
        return respond(origin,413,'payload_too_large');
      }
      parts.push(value);
    }
  } catch {
    return respond(origin,400,'bad_json');
  } finally {
    reader.releaseLock();
  }
  try {
    const buffer=new Uint8Array(bytes);
    let offset=0;
    for(const part of parts) { buffer.set(part,offset); offset+=part.byteLength; }
    data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
    if(!data || typeof data!=='object' || Array.isArray(data)) throw Error('invalid');
  } catch {return respond(origin,400,'bad_json');}
  if(data.action==='preflight') return respond(origin,200,'preflight_ok',{
    enabled:ready(),scope:'isolated_staging_only',version:'N10-A7.9',registration_enabled:false,
    prerequisites_present:configured()
  });
  if(!['login','bind'].includes(data.action)) return respond(origin,400,'unsupported_action');
  if(!ready()) return respond(origin,503,'n10a6_disabled');
  const username=nameKey(data.username);
  const password=data.password;
  if(!username || typeof password!=='string' || password.length<1 || password.length>1024)
    return respond(origin,401,'invalid_credentials');
  let issued=null,handoff=false;
  try {
    // N10-A7.10 P1 fix: malformed/missing/failed Turnstile never consumes
    // an account or shared limiter bucket. Use independent HMAC'd username
    // buckets only; a global bucket would let one attacker block all users.
    // Note: CAPTCHA is single-use, validated server-side with hostname/action.
    if(!await captcha(data.captcha_token,
       data.action==='login'?'mmh_n10a6_login':'mmh_n10a6_bind'))
      return respond(origin,403,'verification_required');
    // Siteverify must pass before allocating a DB row. Atomic shared token
    // claim occurs BEFORE password exchange, username bind, and owner lookup.
    if(!await claimSingleUseCaptcha(data.captcha_token))
      return respond(origin,403,'verification_required');
    if(!ready()) return respond(origin,503,'n10a6_window_closed');
    if(!await quota(data.action+':username:'+username,8,900))
      return respond(origin,429,'too_many_attempts');
    if(data.action==='login') {
      const uid=await lookup(username);
      if(!uid) return respond(origin,401,'invalid_credentials');
      const email=await verifiedEmail(uid);
      if(!email) return respond(origin,401,'invalid_credentials');
      const proof=await provePassword(email,password,uid);
      if(!proof) return respond(origin,401,'invalid_credentials');
      issued=proof.grant;
      if(!proof.matches || !await ownerProbe(issued.access_token,uid))
        return respond(origin,503,'identity_check_unavailable');
      if(!ready()) return respond(origin,503,'n10a6_window_closed');
      handoff=true;
      return respond(origin,200,'login_success',{
        access_token:issued.access_token,refresh_token:issued.refresh_token,
        expires_in:issued.expires_in,token_type:'bearer'
      });
    }
    const bearer=/^Bearer\s+([^\s]+)$/i.exec(request.headers.get('Authorization')||'')?.[1]||'';
    const user=await identity(bearer);
    if(!user?.id || !user.email_confirmed_at || user.is_anonymous)
      return respond(origin,401,'authentication_required');
    if(!await quota('bind:user:'+user.id,5,900)) return respond(origin,429,'too_many_attempts');
    const email=await verifiedEmail(user.id);
    if(!email || email.toLowerCase()!==String(user.email||'').toLowerCase())
      return respond(origin,401,'authentication_required');
    const proof=await provePassword(email,password,user.id);
    if(!proof) return respond(origin,401,'invalid_credentials');
    issued=proof.grant;
    if(!proof.matches) return respond(origin,401,'invalid_credentials');
    if(!ready()) return respond(origin,503,'n10a6_window_closed');
    const claimed=await claim(user.id,username);
    return respond(origin,claimed?200:409,claimed?'bind_success':'username_unavailable');
  } catch {
    return respond(origin,503,'auth_service_unavailable');
  } finally {
    if(issued?.access_token && !handoff) await revokeProof(issued.access_token);
  }
}
Deno.serve(handle);
