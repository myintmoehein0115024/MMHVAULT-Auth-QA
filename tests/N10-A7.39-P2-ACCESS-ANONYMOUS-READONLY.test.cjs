'use strict';
/* N10-A7.39-P2: ANONYMOUS HEAD/GET ONLY, no secrets, no POST or credentials.
 * The domain intentionally has zero Pages deployments; HTTP tests should
 * distinguish "no public site" from proven Access authentication enforcement.
 */
const {test}=require('node:test'),assert=require('node:assert/strict');
const https=require('node:https');
const fs=require('node:fs');
const m=JSON.parse(fs.readFileSync('review/N10-A7.39-P2-ACCESS-DENY-ALL-NO-DEPLOY.json','utf8'));
const HOST='mmhvault-auth-g10g11-locked.pages.dev';
const KNOWN_PROD='mmhvault.com';
function request(method,p){
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:HOST,path:p,port:443,protocol:'https:',method,timeout:15000,
   headers:{'User-Agent':'MMHVAULT-A739P2-Anonymous-Access-ReadOnly','Accept':'text/html',
    'Cache-Control':'no-cache'}},res=>{
   let length=0;res.on('data',c=>{length+=c.length;if(length>750000)req.destroy(Error('unbounded response'));});
   res.on('end',()=>{
    const loc=res.headers.location||'';
    const safeLocation=loc?(()=>{try{const u=new URL(loc,'https://'+HOST);return {host:u.host,path:u.pathname}}catch{return {host:'invalid',path:'invalid'}}})():null;
    resolve({status:res.statusCode,headers:{'cf-ray':res.headers['cf-ray']||null,
      'location':safeLocation,'content-type':res.headers['content-type']||null,
      'cache-control':res.headers['cache-control']||null},
     bodyBytes:length});
   });
  });req.on('timeout',()=>req.destroy(Error('anonymous_probe_timeout')));
  req.on('error',reject);req.end();
 });
}
test('Access application is exact QA host with zero Allow rules',()=>{
 assert.equal(m.access.domain,HOST);assert.equal(m.access.appId,'e0debc2e-8637-4db0-ac4a-c25beabde850');
 assert.equal(m.access.policyCount,0);assert.equal(m.access.approvedUserCount,0);
 assert.equal(m.access.optionsPreflightBypass,false);
 assert.equal(m.pages.deployCount,0);assert.equal(m.pages.successfulDeploymentCount,0);
 assert.equal(m.pages.credentialPageDeployed,false);
 assert.equal(m.access.firstRealUserEmail,'NOT_PROVIDED');
});
test('precise staging Turnstile hostname is nonproduction',()=>{
 assert.deepEqual(m.turnstile.domains,[HOST]);
 assert.equal(m.turnstile.secretTransferredToStaging,false);
 assert.notEqual(m.turnstile.domains[0],KNOWN_PROD);
});
test('all real account and production mutation gates stay false',()=>{
 for(const x of ['allowProdDeploy','allowRealAuth','allowEdgeGateOpen',
  'allowCredentialsInput','allowStagingSecretChange','allowCloudflarePageDeploy'])
   assert.equal(m.operations[x],false,x);
});
test('real anonymous HTTPS HEAD to independent Pages is not credential UI success',async()=>{
 const r=await request('HEAD','/');
 assert.notEqual(r.status,200,'unauthenticated page unexpectedly accessible');
 assert.ok(r.status>=300&&r.status<=499,JSON.stringify(r));
 const next=r.headers.location;
 const accessRedirect=next?.host?.endsWith('.cloudflareaccess.com')||
    next?.path?.includes('/cdn-cgi/access/');
 const deny=r.status===401||r.status===403;
 const cannotConclude=r.status===404||r.status===405;
 assert.ok(accessRedirect||deny||cannotConclude,'unexpected anonymous host behavior: '+JSON.stringify(r));
 console.log('ANONYMOUS_HEAD_PROBE '+JSON.stringify({status:r.status,accessRedirect:!!accessRedirect,explicitDeny:deny,unavailableEndpoint:cannotConclude,location:next}));
});
test('real anonymous HTTPS GET cannot reveal credential page or assets',async()=>{
 const r=await request('GET','/');
 assert.notEqual(r.status,200,'unauthenticated GET unexpectedly accessed site');
 const next=r.headers.location;
 const accessRedirect=next?.host?.endsWith('.cloudflareaccess.com')||
    next?.path?.includes('/cdn-cgi/access/');
 const deny=r.status===401||r.status===403;
 const cannotConclude=r.status===404||r.status===405;
 assert.ok(accessRedirect||deny||cannotConclude,'unexpected real GET behavior: '+JSON.stringify(r));
 console.log('ANONYMOUS_GET_PROBE '+JSON.stringify({status:r.status,accessRedirect:!!accessRedirect,explicitDeny:deny,unavailableEndpoint:cannotConclude,location:next}));
});
