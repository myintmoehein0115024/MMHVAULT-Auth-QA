'use strict';
/*
 N10-A7.36 - DO NOT DEPLOY. Creates review-only JS variants of the five
 Staging browser modules, preserving their default immutable hardlocks.
 Never touches cloud, production, authentication accounts or CSS/HTML.
*/
const ALLOW_ORIGIN_PATCH_DEPLOYMENT=false;
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve('review/N10-A7.36-candidate-browser');
const NEW='https://mmhvault-auth-qa-locked.pages.dev';
const OLD='https://myintmoehein0115024.github.io';
const MAP=Object.freeze([
 {input:'integration/N10-A7.23-real-username-acceptance-LOCKED.cjs',
  name:'controller.cjs',constant:"const ALLOWED_ORIGIN='"+OLD+"';",
  updated:"const ALLOWED_ORIGIN='"+NEW+"';",gate:'const ALLOW_REAL_OPERATIONS=false;'},
 {input:'integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs',
  name:'adapter.cjs',constant:"const HOST='"+OLD+"';",
  updated:"const HOST='"+NEW+"';",gate:'const STAGING_ADAPTER_ENABLED=false;'},
 {input:'integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs',
  name:'sdk.cjs',constant:"const HOST='"+OLD+"';",
  updated:"const HOST='"+NEW+"';",gate:'const STAGING_SDK_BOOTSTRAP_ENABLED=false;'},
 {input:'integration/N10-A7.29-turnstile-actions-LOCKED.cjs',
  name:'turnstile.cjs',constant:"const ORIGIN='"+OLD+"';",
  updated:"const ORIGIN='"+NEW+"';",gate:'const ALLOW_TURNSTILE_ACTIONS=false;'},
 {input:'integration/N10-A7.30-browser-acceptance-LOCKED.cjs',
  name:'browser.cjs',constant:"const ORIGIN='"+OLD+"';",
  updated:"const ORIGIN='"+NEW+"';",gate:'const ALLOW_BROWSER_ACCEPTANCE=false;'}
]);
function build({output=ROOT}={}){
 if(ALLOW_ORIGIN_PATCH_DEPLOYMENT)throw Error('review_lock_violation');
 if(path.resolve(output)!==ROOT)throw Error('unapproved_output_directory');
 const result=[];const specs=[];
 for(const m of MAP){
  const original=fs.readFileSync(m.input,'utf8');
  if(original.split(m.constant).length!==2||
    !original.includes(m.gate)||original.includes("ALLOW_REAL_OPERATIONS=true"))
   throw Error('unknown_source_or_gate_changed:'+m.name);
  const patched=original.replace(m.constant,m.updated);
  if(!patched.includes(m.gate)||patched.includes(m.constant)||
   patched.includes('vrypucmyrztxgiqhjspd')||patched.includes('sb_secret_'))
   throw Error('patch_did_not_preserve_isolation:'+m.name);
  specs.push({name:m.name,input:m.input,gate:m.gate,
   sha256:crypto.createHash('sha256').update(patched).digest('hex')});
  result.push({name:m.name,content:patched});
 }
 fs.rmSync(ROOT,{force:true,recursive:true});
 fs.mkdirSync(ROOT,{recursive:true});
 for(const e of result)fs.writeFileSync(path.join(ROOT,e.name),
  '/* N10-A7.36 REVIEW-ONLY / NOT DEPLOYED / HARDLOCKED */\n'+e.content);
 fs.writeFileSync(path.join(ROOT,'manifest.json'),JSON.stringify({
  phase:'N10-A7.36',action:'REVIEW_NOT_APPLIED',
  cloudMutationAllowed:false,realAuthAllowed:false,sitekeyHostnameAttested:false,
  sourceOrigin:OLD,targetOrigin:NEW,
  stagingEdgeVersion:11,
  stagingEdgeSha:'0352514a17a62da58fbebea97ac0c570d6cf4bfcc50dc78bb7bdedc3774479e7',
  hostname:'mmhvault-auth-qa-locked.pages.dev',
  stagingWindowStart:'1970-01-01T00:00:00.000Z',
  stagingWindowEnd:'1970-01-01T00:00:00.000Z',
  modules:specs
 },null,2)+'\n');
 return {ok:true,locked:true,modules:specs.map(x=>x.name),directory:ROOT};
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={build,MAP,ROOT,NEW,OLD};
