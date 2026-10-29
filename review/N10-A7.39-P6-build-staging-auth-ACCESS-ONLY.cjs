'use strict';
/* N10-A7.39 P6: Add Staging ONLY authenticated email/username QA behind existing
 * Cloudflare Access exact-email policy, while keeping the root login UI LOCKED.
 * No production, no Edge gate opening, no registration or Google OAuth.
 */
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const assert=require('node:assert/strict');
const dir='qa/n10a737-preview-dist';
const src='review/n10a739-live-staging-qa';
const base='https://ldivswlhtgmznzwhzsoi.supabase.co';
const turn='https://challenges.cloudflare.com';
cp.execFileSync(process.execPath,['review/N10-A7.39-P5-build-locked-staging-health.cjs'],{timeout:14000,stdio:'inherit'});
const untouched=['index.html','assets/auth-qa.js','assets/auth-qa.css'];
const preserved=new Map(untouched.map(f=>[f,fs.readFileSync(path.join(dir,f))]));
const js=fs.readFileSync(path.join(src,'assets/staging-auth.js'),'utf8');
const html=fs.readFileSync(path.join(src,'staging-auth.html'),'utf8');
const css=fs.readFileSync(path.join(src,'assets/staging-auth.css'),'utf8');
for(const x of ['https://ldivswlhtgmznzwhzsoi.supabase.co','https://mmhvault-auth-g10g11-locked.pages.dev','mmh-n10a6-username'])assert.ok(js.includes(x));
assert.match(js,/const TURNSTILE_SITEKEY='0x4AAAAAAFq1yWQ26zasvyxh'/);
assert.match(js,/const CAPTCHA_ACTION='mmh_n10a6_login'/);
assert.match(js,/credentials:'omit'/);
assert.match(js,/redirect:'error'/);
assert.match(js,/pathAllowed\(path\)/);
assert.match(js,/signOutLocal\(secret\)/);
assert.match(js,/v\?\.enabled===true/);
assert.doesNotMatch(js,/localStorage|sessionStorage|service_role|sb_secret_|vrypucmyrztxgiqhjspd/);
assert.doesNotMatch(js,/auth\/v1\/signup|\/auth\/v1\/admin|https:\/\/mmhvault\.com/);
assert.doesNotMatch(html,/register-submit|resetPasswordForEmail|action="https:\/\/|Google.*<button[^>]*[^ ]disabled=/);
for(const [f,contents] of [
 ['staging-auth.html',html],
 ['assets/staging-auth.js',js],
 ['assets/staging-auth.css',css]
]){
 const target=path.join(dir,f);fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,contents);
}
const orig=fs.readFileSync(path.join(dir,'_headers'),'utf8');
assert.match(orig,/\/\*\n  Content-Security-Policy:.*connect-src 'none'/);
assert.ok(!orig.includes('/staging-auth'));
const allowed="default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'; script-src 'self' "+turn+"; style-src 'self'; img-src 'self' data: "+turn+"; font-src 'none'; connect-src "+base+" "+turn+"; frame-src "+turn+"; upgrade-insecure-requests";
assert.ok(allowed.length<1700);
const p=['/staging-auth','/staging-auth.html'].map(f=>
 f+'\n  ! Content-Security-Policy\n  Content-Security-Policy: '+allowed+'\n').join('\n');
fs.writeFileSync(path.join(dir,'_headers'),orig.trimEnd()+'\n\n'+p);
for(const [f,bytes] of preserved)assert.deepEqual(fs.readFileSync(path.join(dir,f)),bytes);
const list=fs.readdirSync(dir,{recursive:true}).map(x=>String(x));
assert.ok(list.includes('staging-auth.html')&&list.includes('assets/staging-auth.js'));
console.log('N10-A7.39: PRIVATE STAGING LIVE EMAIL QA build, root unchanged, username Edge gate still CLOSED.');
