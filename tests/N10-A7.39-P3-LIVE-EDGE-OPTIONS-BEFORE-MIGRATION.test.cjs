'use strict';
/* N10-A7.39-P3 real, non-authenticated OPTIONS only. No POST, passwords or JWT.
 * Asserts current v11 baseline is NOT YET migrated to new Access hostname.
 * Must be changed in the separate approved migration window, not here.
 */
const {test}=require('node:test'),assert=require('node:assert/strict'),https=require('node:https');
const endpoint='https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username';
function send(origin){
 return new Promise((resolve,reject)=>{
  const req=https.request(endpoint,{method:'OPTIONS',timeout:12000,
   headers:{Origin:origin,'Access-Control-Request-Method':'POST',
    'Access-Control-Request-Headers':'content-type,apikey,authorization,x-client-info,x-retry-count',
    'User-Agent':'MMHVAULT-N10A739P3-LIVE-OPTIONS-READONLY'}},res=>{
   let bytes=0;res.on('data',c=>{bytes+=c.length;if(bytes>2000)req.destroy(Error('preflight_overflow'))});
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bodyBytes:bytes}));
  });req.on('timeout',()=>req.destroy(Error('preflight_timed_out')));req.on('error',reject);req.end();
 });
}
test('old GitHub QA origin is still allowed on currently deployed v11',async()=>{
 const res=await send('https://myintmoehein0115024.github.io');
 assert.equal(res.status,204);
 assert.equal(res.headers['access-control-allow-origin'],'https://myintmoehein0115024.github.io');
 assert.equal(res.bodyBytes,0);
 assert.equal(res.headers['cache-control'],'no-store, private, max-age=0');
});
test('new dedicated Access QA host is NOT yet authorized by live Staging',async()=>{
 const res=await send('https://mmhvault-auth-g10g11-locked.pages.dev');
 assert.equal(res.status,204);
 assert.equal(res.headers['access-control-allow-origin'],undefined);
 assert.equal(res.bodyBytes,0);
});
test('formal production host must NOT be authorized to Staging',async()=>{
 const res=await send('https://mmhvault.com');
 assert.equal(res.status,204);
 assert.equal(res.headers['access-control-allow-origin'],undefined);
 assert.equal(res.bodyBytes,0);
});
test('current live v11 CORS does not include SDK x-client-info yet',async()=>{
 const res=await send('https://myintmoehein0115024.github.io');
 const allowed=String(res.headers['access-control-allow-headers']||'').split(',').map(x=>x.trim().toLowerCase());
 assert.ok(allowed.includes('content-type'));
 assert.ok(allowed.includes('apikey'));
 assert.ok(allowed.includes('authorization'));
 assert.equal(allowed.includes('x-client-info'),false);
 assert.equal(allowed.includes('x-retry-count'),false);
 assert.equal(res.headers['access-control-allow-credentials'],undefined);
});
