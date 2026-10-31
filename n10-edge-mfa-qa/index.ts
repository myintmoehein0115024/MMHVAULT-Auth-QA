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
  if(!Array.isArray(user.factors))return reply("FACTOR_STATE_UNAVAILABLE",503);
  let mode:string;
  try{
    const request=await req.json();
    if(!request||typeof request.mode!=="string")return reply("INVALID_REQUEST",400);
    mode=request.mode;
  }catch(_){return reply("INVALID_REQUEST",400);}
  if(!["financial-ai","push-test","recovery-phrase"].includes(mode))return reply("UNKNOWN_MODE",400);
  const hasFactors=user.factors.some((f:any)=>f&&f.status==="verified");
  const {data:assurance,error}=await sdk.auth.mfa.getAuthenticatorAssuranceLevel(bearer);
  if(error||!assurance)return reply("MFA_CHECK_UNAVAILABLE",503);
  let decision="unavailable";
  if(mode==="push-test"){
    // Use the same pure Push decision as the production branch, with factor
    // state sourced from verified Auth user rather than a QA SQL proxy.
    decision=evaluatePushMfa(hasFactors,user.id,readJwtClaims(bearer));
    const mfa=evaluateMfaAssurance(assurance,hasFactors);
    if(mfa==="unavailable"||decision==="unavailable")decision="unavailable";
    else if(mfa==="required"||decision==="required")decision="required";
  }else{
    // Both financial AI and saved recovery-phrase branches reuse this exact helper.
    decision=evaluateMfaAssurance(assurance,hasFactors);
  }
  if(decision==="unavailable")return reply("MFA_CHECK_UNAVAILABLE",503);
  if(decision==="required")return reply("MFA_REQUIRED",403);
  if(decision==="allowed")return reply("MFA_ALLOWED",200);
  return reply("MFA_CHECK_UNAVAILABLE",503);
});
