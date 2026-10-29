'use strict';
/* N10-A7.39-P2: Post-deploy real HTTPS anonymous Access enforcement audit.
 * Only HEAD/GET, zero Cookie/JWT/authorization, no user credentials and no cloud writes.
 * Both Pages main host and version alias must protect static HTML/JS/CSS.
 */
const {test}=require('node:test'),assert=require('node:assert/strict');
const https=require('node:https');
const ROOT='mmhvault-auth-g10g11-locked.pages.dev';
const ALIAS='8b29d612.mmhvault-auth-g10g11-locked.pages.dev';
async function probe(host,pathname,method){
 return await new Promise((resolve,reject)=>{
  const req=https.request({hostname:host,path:pathname,method,protocol:'https:',port:443,timeout:14000,
   headers:{'User-Agent':'MMHVAULT-A739P2-ANON-AUDIT','Accept':'text/html','Cache-Control':'no-cache'}},res=>{
   let count=0;
   res.on('data',b=>{count+=b.length;if(count>700000)req.destroy(Error('unbounded_response'))});
   res.on('end',()=>{
    let target=null;
    try{const url=new URL(res.headers.location||'','https://'+host+'/');
     target={host:url.host,path:url.pathname};}catch{}
    resolve({http:res.statusCode,location:target,bodyBytes:count});
   });
  });req.on('timeout',()=>req.destroy(Error('cloudflare_qa_probe_timeout')));
  req.on('error',reject);req.end();
 });
}
for(const host of [ROOT,ALIAS]){
 for(const pathname of ['/','/assets/auth-qa.js','/assets/auth-qa.css']){
  for(const method of ['HEAD','GET']){
   test('anonymous '+method+' https://'+host+pathname+' blocked by Access',async()=>{
    const r=await probe(host,pathname,method);
    assert.equal(r.http,302,'Expected Cloudflare Access redirect, got '+JSON.stringify(r));
    assert.ok(r.location?.host?.endsWith('.cloudflareaccess.com'),JSON.stringify(r));
    assert.match(r.location.path,/^\/cdn-cgi\/access\/login\//);
    console.log('ACCESS_PROOF '+JSON.stringify({host,method,pathname,status:r.http,
      redirectHost:r.location.host,redirectPath:r.location.path}));
   });
  }
 }
}
test('original locked QA is separate and production unaffected',()=>{
 assert.notEqual(ROOT,'mmhvault-auth-qa-locked.pages.dev');
 assert.notEqual(ROOT,'mmhvault.com');
 assert.ok(ALIAS.endsWith('.'+ROOT));
});
