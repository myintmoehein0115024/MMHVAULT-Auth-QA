// N10 MFA candidate — NOT DEPLOYED. Review/test separately before production.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { evaluateVerifiedAuthUserMfa } from "./mfa-assurance.mjs";
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co',ORIGIN='https://myintmoehein0115024.github.io';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const RATEKEY=Deno.env.get('N10A740_RATE_HMAC_KEY')||'';
const admin=createClient(BASE,SERVICE||'placeholder',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
// N10 candidate ONLY; not deployed. Conditional MFA must guard both status
// and phrase verification because this is a sensitive account-recovery endpoint.
// The service-role Auth client has already validated this bearer in getUser.
// Its verified factors are server-owned; SDK nextLevel can be unavailable in
// stateless Edge calls. The helper checks JWT subject, issuer, expiry and AAL.
function checkMfa(jwt:string,user:any){
 return evaluateVerifiedAuthUserMfa(jwt,user,BASE);
}

const enc=new TextEncoder();
function out(origin,status,code,extra={}){return new Response(JSON.stringify({code,...extra}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store,private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin',...(origin===ORIGIN?{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type'}:{})}})}
async function mac(v,prefix){const key=await crypto.subtle.importKey('raw',enc.encode(RATEKEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(prefix+v)));return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')}
function sameHex(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;let d=0;for(let i=0;i<64;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
function words(v){if(typeof v!=='string'||v.length>240)return null;let a=v.trim().toLowerCase().split(/\s+/);return a.length===10&&a.every(x=>/^[a-z]{2,13}$/.test(x))?a.join(' '):null}
Deno.serve(async req=>{
 const origin=req.headers.get('origin');if(origin!==ORIGIN)return out(origin,403,'origin_denied');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:out(origin,200,'ok').headers});
 if(req.method!=='POST')return out(origin,405,'method_denied');
 if(SERVICE.length<20)return out(origin,503,'unavailable');
 const match=/^Bearer\s+([^\s]+)$/i.exec(req.headers.get('authorization')||'');if(!match||match[1].length>8192)return out(origin,401,'sign_in_required');
 const {data,error}=await admin.auth.getUser(match[1]);const user=data?.user;
 if(error||!user?.id||user.is_anonymous)return out(origin,401,'sign_in_required');
 const mfaDecision=await checkMfa(match[1],user);
 if(mfaDecision==='unavailable')return out(origin,503,'mfa_state_unavailable');
 if(mfaDecision==='required')return out(origin,403,'mfa_required');
 // QA-only short circuit AFTER actual Auth user verification + MFA gate.
 // No recovery words, identifiers or persistent rows will be inspected.
 return out(origin,200,'MFA_ALLOWED',{qa_only:true});
 let body;try{const raw=await req.text();if(raw.length>700)return out(origin,400,'bad_request');body=JSON.parse(raw)}catch{return out(origin,400,'bad_request')}
 if(body?.action==='status'){
   const {data:matches,error:e1}=await admin.from('mmh_n10a740_username_links').select('username_key').eq('user_id',user.id).limit(2);
   if(e1)return out(origin,503,'unavailable');
   const usernameOnly=user.app_metadata?.mmhvault_auth_kind==='username_only';
   return out(origin,200,'account_status',{username:matches?.length===1?matches[0].username_key:null,username_only:usernameOnly,has_recovery_key:usernameOnly});
 }
 if(body?.action!=='verify_saved_phrase')return out(origin,400,'unknown_action');
 if(user.app_metadata?.mmhvault_auth_kind!=='username_only')return out(origin,403,'username_account_required');
 const {data:quota,error:qe}=await admin.rpc('mmh_n10a769_take_attempt',{p_key:await mac('phrase_verify:'+user.id,'mmh-a783-rate:'),p_limit:5,p_window_seconds:900});
 if(qe||quota!==true)return out(origin,429,'too_many_attempts');
 const phrase=words(body.phrase);if(!phrase)return out(origin,400,'invalid_phrase');
 const {data:records,error:dbErr}=await admin.from('mmh_n10a769_recovery_phrases').select('verifier,version').eq('user_id',user.id).limit(2);
 if(dbErr||records?.length!==1||records[0].version!==1)return out(origin,503,'unavailable');
 const verifier=await mac('phrase:'+user.id+':'+phrase,'mmh-a769-prod:');
 if(!sameHex(verifier,records[0].verifier))return out(origin,401,'incorrect_words');
 return out(origin,200,'phrase_verified',{verified:true});
});
