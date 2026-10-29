'use strict';
/* N10-A7.39-P3: Build five browser modules for Access-protected private QA host,
 * with ALL original hardlocks preserved. Output is only a QA artifact, never
 * active Pages. Any source drift fails closed. No credentials or real auth.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ALLOW_DEPLOYMENT=false,ALLOW_REAL_AUTH=false;
const oldHost='https://myintmoehein0115024.github.io';
const newHost='https://mmhvault-auth-g10g11-locked.pages.dev';
const output='qa/n10a739p3-locked-browser-review';
const sources=[
 ['integration/N10-A7.23-real-username-acceptance-LOCKED.cjs','controller.cjs','ALLOWED_ORIGIN','ALLOW_REAL_OPERATIONS'],
 ['integration/N10-A7.24-supabase-browser-adapter-REVIEW-LOCKED.cjs','adapter.cjs','HOST','STAGING_ADAPTER_ENABLED'],
 ['integration/N10-A7.27-staging-ephemeral-sdk-LOCKED.cjs','sdk.cjs','HOST','STAGING_SDK_BOOTSTRAP_ENABLED'],
 ['integration/N10-A7.29-turnstile-actions-LOCKED.cjs','turnstile.cjs','ORIGIN','ALLOW_TURNSTILE_ACTIONS'],
 ['integration/N10-A7.30-browser-acceptance-LOCKED.cjs','acceptance.cjs','ORIGIN','ALLOW_BROWSER_ACCEPTANCE']
];
function generate(){
 if(ALLOW_DEPLOYMENT||ALLOW_REAL_AUTH)throw Error('deployment_or_auth_forbidden');
 const outputFile=[];
 for(const [source,filename,originKey,gateKey] of sources){
  const text=fs.readFileSync(source,'utf8');
  const from="const "+originKey+"='"+oldHost+"';";
  const to="const "+originKey+"='"+newHost+"';";
  const gate="const "+gateKey+"=false;";
  if(text.split(from).length!==2||text.split(gate).length!==2)
   throw Error('drift_or_hardlock_missing:'+filename);
  const updated=text.replace(from,to);
  if(updated.includes(from)||!updated.includes(gate)||
    updated.includes('vrypucmyrztxgiqhjspd')||updated.includes('sb_secret_'))
   throw Error('blocked_output:'+filename);
  outputFile.push({filename,updated,originKey,gateKey,source,
   sha256:crypto.createHash('sha256').update(updated).digest('hex')});
 }
 fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
 for(const item of outputFile){
  fs.writeFileSync(path.join(output,item.filename),
   "/* N10-A7.39-P3 / REVIEW ONLY / STAGING ORIGIN / AUTH GATES FALSE */\n"+item.updated);
 }
 const manifest={phase:'N10-A7.39-P3',state:'CLOSED_CLIENT_CANDIDATES_NOT_DEPLOYED',
  qaOrigin:newHost,previousOrigin:oldHost,stagingProject:'ldivswlhtgmznzwhzsoi',
  cloudWriteAllowed:false,realAuthAllowed:false,
  realUsernameOperationsPerformed:false,
  modules:outputFile.map(({filename,originKey,gateKey,source,sha256})=>({
   filename,originKey,hardgate:gateKey,source,sha256}))
 };
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 return {ok:true,modules:outputFile.length,output};
}
if(require.main===module)console.log(JSON.stringify(generate()));
module.exports={generate,sources,output,oldHost,newHost};
