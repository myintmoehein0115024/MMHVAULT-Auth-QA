// N10 isolated Auth-Staging real-JWT Edge MFA acceptance.
// Synthetic read-only endpoint: NO finance data, SQL, storage, service_role,
// recovered words, secrets, account mutation, production calls or token logging.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { evaluateMfaAssurance } from "./mfa-assurance.mjs";
import { evaluatePushMfa } from "./mfa-push.mjs";

const PROJECT="ldivswlhtgmznzwhzsoi";
const BASE="https://"+PROJECT+".supabase.co";
const ORIGIN="https://myintmoehein0115024.github.io";
const PUBLIC=(()=>{
  try{
    const x=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
    if(typeof x.default==="string"&&x.default.length>15)return x.default;
  }catch(_){}
  return Deno.env.get("SUPABASE_ANON_KEY")||"";
})();
const sdk=PUBLIC?createClient(BASE,PUBLIC,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
}):null;
function reply(code:string,status:number){
  return Response.json({code},{status,headers:{
    "Access-Control-Allow-Origin":ORIGIN,
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type",
    "Vary":"Origin",
    "Cache-Control":"no-store,private",
    "X-Content-Type-Options":"nosniff"
  }});
}
function readJwtClaims(token:string){
  const parts=token.split(".");
  if(parts.length!==3||parts[1].length>8192)return null;
  try{
    const str=parts[1].replace(/-/g,"+").replace(/_/g,"/");
    const raw=atob(str+"=".repeat((4-str.length%4)%4));
    const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,x=>x.charCodeAt(0))));
    return data&&typeof data==="object"?data:null;
  }catch(_){return null;}
}
Deno.serve(async(req:Request)=>{
  if(req.headers.get("origin")!==ORIGIN)return reply("ORIGIN_DENIED",403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Origin":ORIGIN,
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type",
    "Vary":"Origin"
  }});
  if(req.method!=="POST")return reply("METHOD_DENIED",405);
  if(!sdk)return reply("AUTH_CONFIG_UNAVAILABLE",503);
  const bearer=/^Bearer\s+([^\s]+)$/i.exec(req.headers.get("authorization")||"")?.[1]||"";
  if(!bearer||bearer.length>8192)return reply("LOGIN_REQUIRED",401);
  // Both calls bind to the SAME JWT. Credentials are NEVER returned or logged.
  const {data:current,error:authError}=await sdk.auth.getUser(bearer);
  const user=current?.user;
  if(authError||!user?.id||user.is_anonymous)return reply("LOGIN_REQUIRED",401);
  let mode:string;
  try{
    const request=await req.json();
    if(!request||typeof request.mode!=="string")return reply("INVALID_REQUEST",400);
    mode=request.mode;
  }catch(_){return reply("INVALID_REQUEST",400);}
  if(!["financial-ai","push-test","recovery-phrase"].includes(mode))return reply("UNKNOWN_MODE",400);

  // The exact bearer has just passed Auth verification. Decode its JWT
  // *only then*: its AAL claim is trustworthy only in this validated context.
  const jwtClaims=readJwtClaims(bearer);
  if(!jwtClaims || jwtClaims.sub!==user.id ||
     jwtClaims.iss!==BASE+"/auth/v1" ||
     !Number.isSafeInteger(jwtClaims.exp) ||
     jwtClaims.exp<=Math.floor(Date.now()/1000))return reply("JWT_ASSERTION_UNAVAILABLE",503);
  if(jwtClaims.aal!==undefined&&jwtClaims.aal!=="aal1"&&jwtClaims.aal!=="aal2")
    return reply("JWT_ASSURANCE_UNRECOGNIZED",503);

  // Auth's /user payload may not always include a `factors` array in
  // certain SDK/GoTrue combinations. Independently request assurance in
  // that case, but fail CLOSED if neither trusted source provides the
  // enrolled factor state. Do not treat missing factors as "no MFA".
  let hasFactors:boolean|undefined=Array.isArray(user.factors)
    ? user.factors.some((f:any)=>f?.status==="verified") : undefined;
  // Some SDK responses omit factors. Try the raw, Auth-validated /user
  // endpoint using the SAME verified JWT; never guess "unenrolled".
  if(hasFactors===undefined){
    try{
      const r=await fetch(BASE+"/auth/v1/user",{
        headers:{"apikey":PUBLIC,"authorization":"Bearer "+bearer},
        cache:"no-store"
      });
      if(r.ok){
        const record=await r.json();
        if(record?.id===user.id&&Array.isArray(record.factors))
          hasFactors=record.factors.some((f:any)=>f?.status==="verified");
      }
    }catch(_){ /* fail closed below if unavailable */ }
  }
  let assurance:any=null;
  try{
    const a=await sdk.auth.mfa.getAuthenticatorAssuranceLevel(bearer);
    if(!a.error&&a.data &&
       (a.data.nextLevel==="aal1"||a.data.nextLevel==="aal2"))assurance=a.data;
  }catch(_){ /* use independently verified /user factor state if present */ }
  // Do not infer absence of MFA from the SDK's nextLevel: some SDK
  // versions default nextLevel to aal1 if factors are missing. That would
  // incorrectly allow an enrolled AAL1 user through a privileged API.
  if(typeof hasFactors!=="boolean")return reply("FACTOR_STATE_UNAVAILABLE",503);

  const currentLevel=jwtClaims.aal||"aal1";
  const nextLevel=hasFactors?"aal2":"aal1";
  // Never override verified factor evidence with an SDK default "aal1"
  // (some SDK versions interpret missing factors as an empty list).
  // But a positive, independently verified SDK indication of MFA enrollment
  // must not be ignored if /user reports none. Reject contradictory identity/AAL.
  if(assurance && (
      (assurance.nextLevel==="aal2" && !hasFactors) ||
      (assurance.currentLevel!==null &&
       assurance.currentLevel!==currentLevel)))
    return reply("MFA_ASSURANCE_CONFLICT",503);

  const state={currentLevel,nextLevel};
  const mfa=evaluateMfaAssurance(state,hasFactors);
  let decision=mfa;
  if(mode==="push-test"){
    // Reuse production-candidate Push decision on the SAME Auth-verified bearer.
    const push=evaluatePushMfa(hasFactors,user.id,jwtClaims);
    if(push==="unavailable"||mfa==="unavailable")decision="unavailable";
    else if(push==="required"||mfa==="required")decision="required";
    else decision="allowed";
  }
  if(decision==="unavailable")return reply("MFA_CHECK_UNAVAILABLE",503);
  if(decision==="required")return reply("MFA_REQUIRED",403);
  if(decision==="allowed")return reply("MFA_ALLOWED",200);
  return reply("MFA_CHECK_UNAVAILABLE",503);
});
