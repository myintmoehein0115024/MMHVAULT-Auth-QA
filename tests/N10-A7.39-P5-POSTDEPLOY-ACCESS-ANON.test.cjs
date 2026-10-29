'use strict';
/* N10-A7.39-P5: Anonymous HEAD/GET check every private QA page and static asset.
 * No login, Cookies, JWT, Cloudflare session, passwords or Supabase requests.
 */
const {test}=require('node:test'),assert=require('node:assert/strict');
const https=require('node:https');
const HOSTS=['mmhvault-auth-g10g11-locked.pages.dev','d83a56f3.mmhvault-auth-g10g11-locked.pages.dev'];
const ROUTES=['/','/staging-health','/staging-health.html','/assets/auth-qa.js','/assets/staging-health.js','/assets/staging-health.css'];
async function probe(host,route,method){
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:host,port:443,path:route,method,timeout:14000,
   headers:{'User-Agent':'MMHVAULT-P5-READONLY-ANON-ACCESS-AUDIT','Accept':'text/html','Cache-Control':'no-cache'}},res=>{
   let len=0;res.on('data',c=>{len+=c.length;if(len>200000)req.destroy(Error('oversized_redirect'))});
   res.on('end',()=>{let target=null;try{const u=new URL(res.headers.location||'','https://'+host+'/');target={host:u.host,path:u.pathname}}catch{}
    resolve({status:res.statusCode,location:target,bytes:len});
   });
  });req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',reject);req.end();
 });
}
for(const host of HOSTS){
 for(const route of ROUTES){
  for(const method of ['HEAD','GET']){
   test('no anonymous '+method+' '+host+route,async()=>{
    const x=await probe(host,route,method);
    assert.equal(x.status,302,JSON.stringify(x));
    assert.ok(x.location?.host?.endsWith('.cloudflareaccess.com'),JSON.stringify(x));
    assert.match(x.location.path,/^\/cdn-cgi\/access\/login\//);
   });
  }
 }
}
test('both hosts belong only to separate Access-protected QA',()=>{
 assert.ok(HOSTS[0].endsWith('.pages.dev'));
 assert.equal(HOSTS[1].split('.').slice(1).join('.'),HOSTS[0]);
 assert.notEqual(HOSTS[0],'mmhvault.com');
});
