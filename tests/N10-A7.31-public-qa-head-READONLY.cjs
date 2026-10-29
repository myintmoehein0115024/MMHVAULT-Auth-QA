'use strict';
/* READ-ONLY external HEAD of the already public locked QA page.
 * No SDK, tokens, CAPTCHA, credentials or POST. Missing headers are a BLOCKER,
 * but the job exits successfully because this is evidence collection, not approval.
 */
const https=require('node:https');
const assert=require('node:assert/strict');
const {headerAudit}=require('../integration/N10-A7.31-host-and-edge-evidence-LOCKED.cjs');
const HOST='myintmoehein0115024.github.io';
const PATH='/MMHVAULT-Auth-QA/n10a726-staging-acceptance-LOCKED.html';
function collect(){
 return new Promise((resolve)=>{
  const req=https.request({hostname:HOST,path:PATH,protocol:'https:',port:443,
   method:'HEAD',timeout:8000,headers:{'User-Agent':'MMHVAULT-QA-N10A731-READONLY',
   Accept:'text/html','Cache-Control':'no-cache'}},res=>{
    const safe={};for(const name of ['content-security-policy','x-frame-options',
    'referrer-policy','strict-transport-security','x-content-type-options',
    'cache-control','cross-origin-opener-policy','permissions-policy']){
     if(typeof res.headers[name]==='string')safe[name]=res.headers[name];
    }
    res.resume();
    resolve({status:res.statusCode,headers:safe});
   });
  req.on('timeout',()=>req.destroy(Error('head_timeout')));
  req.on('error',e=>resolve({error:['head_timeout','ECONNRESET','ENOTFOUND','EAI_AGAIN']
   .includes(e.message)||e.code==='ETIMEDOUT'?'network_probe_unavailable':'head_unavailable'}));
  req.end();
 });
}
collect().then(x=>{
 if(x.error){console.log('N10-A7.31 PUBLIC QA HEAD: INCONCLUSIVE '+x.error);return}
 assert.ok(Number.isInteger(x.status));
 const report=headerAudit(x.headers);
 console.log('N10-A7.31 READ-ONLY HEAD evidence: HTTP '+x.status+
  ', response-level hosting gate='+(report.ok?'CONFORM':'BLOCKED')+
  ', blocker_count='+report.blockers.length+
  ', present_header_names='+Object.keys(x.headers).sort().join(','));
 if(x.status!==200)console.log('N10-A7.31 WARNING: locked public QA response did not return HTTP 200');
 if(!report.ok)console.log('N10-A7.31 MISSING HEADERS (non-sensitive codes): '+report.blockers.join(','));
 console.log('N10-A7.31 IMPORTANT: this probe did not open cloud auth or approve any login.');
}).catch(e=>{console.log('N10-A7.31 HEAD unavailable; no sign-off performed: '+e.name)});
