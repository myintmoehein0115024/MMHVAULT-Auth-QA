'use strict';
/* N10-A7.39-P8: private Google Staging OAuth static page on existing QA Pages only.
 * Built on P6; never modifies proven email/username login, locked landing,
 * Cloudflare Access policies, Supabase users, Google providers, or prod.
 */
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const DIST='qa/n10a737-preview-dist',SRC='review/n10a739-google-oauth';
const STAGING='https://ldivswlhtgmznzwhzsoi.supabase.co';
cp.execFileSync(process.execPath,['review/N10-A7.39-P6-build-staging-auth-ACCESS-ONLY.cjs'],{timeout:16000,stdio:'inherit'});
const preserving=['index.html','assets/auth-qa.js','assets/auth-qa.css','staging-health.html','assets/staging-health.js','assets/staging-health.css','staging-auth.html','assets/staging-auth.js','assets/staging-auth.css'];
const before=new Map(preserving.map(p=>[p,fs.readFileSync(path.join(DIST,p))]));
const googleHtml=fs.readFileSync(path.join(SRC,'staging-google.html'),'utf8');
const googleJS=fs.readFileSync(path.join(SRC,'assets/staging-google.js'),'utf8');
assert.match(googleJS,/const CALLBACK=ORIGIN\+'\/staging-google'/);
assert.match(googleJS,/const PKCE_SLOT='mmhv-p8-staging-google-pkce-v1'/);
assert.match(googleJS,/const MAX_AGE=300000/);
assert.match(googleJS,/challengeFor\(verifier\)/);
assert.match(googleJS,/grant_type=pkce/);
assert.match(googleJS,/auth_code:code,code_verifier:pending\.verifier/);
assert.match(googleJS,/history\.replaceState\(null,'',CALLBACK\)/);
assert.match(googleJS,/credentials:'omit'/);
assert.match(googleJS,/s\?\.disable_signup===true/);
assert.match(googleJS,/localLogout\(access\)/);
assert.doesNotMatch(googleJS,/\/auth\/v1\/signup|\/auth\/v1\/admin|vrypucmyrztxgiqhjspd|sb_secret_|service_role|localStorage/);
assert.doesNotMatch(googleHtml,/<input\b|<form\b|type="password"/);
for(const [src,dst] of [
 ['staging-google.html','staging-google.html'],
 ['assets/staging-google.js','assets/staging-google.js']
]){
 const target=path.join(DIST,dst);fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(path.join(SRC,src),target);
}
const beforeHeaders=fs.readFileSync(path.join(DIST,'_headers'),'utf8');
assert.match(beforeHeaders,/\/\*\n  Content-Security-Policy:.*connect-src 'none'/);
assert.ok(!beforeHeaders.includes('/staging-google'));
const policy="default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'none'; connect-src "+STAGING+"; frame-src 'none'; upgrade-insecure-requests";
const routes=['/staging-google','/staging-google.html'];
const appended=routes.map(r=>r+'\n  ! Content-Security-Policy\n  Content-Security-Policy: '+policy+'\n').join('\n');
fs.writeFileSync(path.join(DIST,'_headers'),beforeHeaders.trimEnd()+'\n\n'+appended);
for(const [p,contents] of before)assert.deepEqual(fs.readFileSync(path.join(DIST,p)),contents,p);
assert.match(fs.readFileSync(path.join(DIST,'_headers'),'utf8'),/\/staging-google\.html\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'/);
console.log('N10-A7.39-P8: private Staging Google PKCE QA page ready, old 3 acceptance paths preserved, no account mutations.');
