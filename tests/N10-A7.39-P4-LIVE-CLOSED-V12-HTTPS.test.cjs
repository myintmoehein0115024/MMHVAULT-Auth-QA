'use strict';
/* N10-A7.39-P4 deployed CLOSED v12 Staging Edge HTTP acceptance.
 * Unauthenticated Origin CORS OPTIONS plus preflight and synthetic disabled calls only.
 * No password, real account, JWT, Turnstile token, Supabase secret or data mutation.
 */
const {test}=require('node:test'),assert=require('node:assert/strict'),https=require('node:https');
const endpoint='https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username';
const allowed='https://mmhvault-auth-g10g11-locked.pages.dev';
const old='https://myintmoehein0115024.github.io';
const prod='https://mmhvault.com';
function call(origin,method='OPTIONS',payload,extra={}){
 return new Promise((resolve,reject)=>{
  const headers={'Origin':origin,'User-Agent':'MMHVAULT-N10A739P4-CLOSED-POSTDEPLOY-READONLY',...extra};
  let body;
  if(method==='OPTIONS'){
   headers['Access-Control-Request-Method']='POST';
   headers['Access-Control-Request-Headers']='content-type,apikey,authorization,x-client-info,x-retry-count';
  } else {
   body=JSON.stringify(payload);
   headers['Content-Type']='application/json';
   headers['Content-Length']=Buffer.byteLength(body);
  }
  const req=https.request(endpoint,{method,headers,timeout:16000},res=>{
   const out=[];let total=0;
   res.on('data',x=>{total+=x.length;if(total>12000)req.destroy(Error('unbounded_edge_reply'));else out.push(x)});
   res.on('end',()=>{
    const raw=Buffer.concat(out).toString('utf8');
    let json=null;try{json=JSON.parse(raw)}catch{}
    resolve({status:res.statusCode,headers:res.headers,json,bodyLength:total});
   });
  });
  req.on('timeout',()=>req.destroy(Error('edge_request_timeout')));
  req.on('error',reject);
  if(body!==undefined)req.write(body);
  req.end();
 });
}
function secureHeaders(r){
 assert.equal(r.headers['cache-control'],'no-store, private, max-age=0');
 assert.equal(r.headers['x-content-type-options'],'nosniff');
 assert.equal(r.headers['vary'],'Origin');
 assert.equal(r.headers['access-control-allow-credentials'],undefined);
}
test('allowed private QA HTTPS OPTIONS returns 204 with x-client-info',async()=>{
 const r=await call(allowed);
 assert.equal(r.status,204,JSON.stringify(r));
 assert.equal(r.headers['access-control-allow-origin'],allowed);
 assert.deepEqual(r.headers['access-control-allow-headers'].split(','),[
  'content-type','apikey','authorization','x-client-info','x-retry-count']);
 assert.equal(r.bodyLength,0);
 secureHeaders(r);
});
for(const origin of [old,prod,'https://www.mmhvault.com',
 'https://mmhvault-auth-qa-locked.pages.dev',
 'https://8b29d612.mmhvault-auth-g10g11-locked.pages.dev',
 'https://evil.example']){
 test('unauthorized origin OPTIONS now rejects 403: '+origin,async()=>{
  const r=await call(origin);assert.equal(r.status,403,JSON.stringify(r));
  assert.equal(r.headers['access-control-allow-origin'],undefined);
  assert.equal(r.json?.code,'origin_not_allowed');
  secureHeaders(r);
 });
}
test('CLOSED preflight new private QA origin reports enabled=false and registration=false',async()=>{
 const r=await call(allowed,'POST',{action:'preflight'});
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(r.json?.code,'preflight_ok');
 assert.equal(r.json?.enabled,false);
 assert.equal(r.json?.registration_enabled,false);
 assert.equal(r.json?.scope,'isolated_staging_only');
 assert.equal(r.headers['access-control-allow-origin'],allowed);
 secureHeaders(r);
});
for(const action of ['login','bind']){
 test('SYNTHETIC '+action+' cannot reach auth or DB because gate is 503',async()=>{
  const r=await call(allowed,'POST',{action,username:'a739closedqa',password:'NON_ACCOUNT_FAKE',captcha_token:'NOT_A_REAL_CAPTCHA_TOKEN'});
  assert.equal(r.status,503,JSON.stringify(r));
  assert.equal(r.json?.code,'n10a6_disabled');
  assert.equal(r.headers['access-control-allow-origin'],allowed);
  secureHeaders(r);
 });
}
test('unauthorized origin POST never reveals preflight',async()=>{
 const r=await call(prod,'POST',{action:'preflight'});
 assert.equal(r.status,403,JSON.stringify(r));
 assert.equal(r.json?.code,'origin_not_allowed');
 assert.equal(r.headers['access-control-allow-origin'],undefined);
 secureHeaders(r);
});
test('registration remains forbidden on new private QA Origin',async()=>{
 const r=await call(allowed,'POST',{action:'register'});
 assert.equal(r.status,400,JSON.stringify(r));
 assert.equal(r.json?.code,'unsupported_action');
 secureHeaders(r);
});
