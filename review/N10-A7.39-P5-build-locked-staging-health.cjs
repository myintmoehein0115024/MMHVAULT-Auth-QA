'use strict';
/*
 N10-A7.39-P5: compose the existing locked auth preview and a separate
 preflight-only diagnostic route. Never enable sign-in or real credentials.
 NOT THE PRODUCTION MMHVAULT BUILD.
*/
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const DIST='qa/n10a737-preview-dist';
const SRC='review/n10a739p5-connectivity-LOCKED';
const STAGING='https://ldivswlhtgmznzwhzsoi.supabase.co';
const policy="default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'none'; connect-src "+STAGING+"; frame-src 'none'; upgrade-insecure-requests";
const rootBuild='review/N10-A7.37-build-credential-ui-LOCKED.cjs';
assert.ok(fs.existsSync(rootBuild));
cp.execFileSync(process.execPath,[rootBuild],{stdio:'inherit',timeout:12000});
const lockedBefore=new Map(['index.html','assets/auth-qa.js','assets/auth-qa.css'].map(x=>[x,fs.readFileSync(path.join(DIST,x))]));
const js=fs.readFileSync(path.join(SRC,'assets/staging-health.js'),'utf8');
const html=fs.readFileSync(path.join(SRC,'staging-health.html'),'utf8');
const css=fs.readFileSync(path.join(SRC,'assets/staging-health.css'),'utf8');
for(const gate of ['REAL_AUTH_ENABLED = false;','STAGING_WRITES_ALLOWED = false;','TURNSTILE_ACTIONS_ENABLED = false;'])assert.ok(js.includes('const '+gate),'closed gate: '+gate);
assert.match(js,/const REQUIRED_ORIGIN = 'https:\/\/mmhvault-auth-g10g11-locked\.pages\.dev'/);
assert.match(js,/const STAGING_EDGE = 'https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co\/functions\/v1\/mmh-n10a6-username'/);
assert.match(js,/body: '\{"action":"preflight"\}'/);
assert.match(js,/credentials: 'omit'/);
assert.match(js,/if \(busy\) return/);
assert.doesNotMatch(js,/\bsignInWithPassword\b|\bsignUp\s*\(|\bresetPassword\b|\bcreateClient\s*\(|\blocalStorage\b|\bsessionStorage\b|service_role|sb_secret_/);
assert.doesNotMatch(html,/<input\b|type="password"|https:\/\/mmhvault\.com/);
assert.match(html,/href="\/assets\/staging-health.css"/);
assert.match(html,/src="\/assets\/staging-health.js"/);
assert.match(css,/@media\(max-width:760px\)/);
const p=fs.readFileSync(path.join(DIST,'_headers'),'utf8');
assert.match(p,/\/\*\n  Content-Security-Policy: .*connect-src 'none'/);
const scoped=['/staging-health','/staging-health.html'];
const extra=scoped.map(x=>x+'\n  ! Content-Security-Policy\n  Content-Security-Policy: '+policy+'\n').join('\n');
assert.ok(!p.includes('/staging-health'));
assert.ok(!p.includes(STAGING));
const combined=p.trimEnd()+'\n\n'+extra;
assert.equal((combined.match(/! Content-Security-Policy/g)||[]).length,2);
assert.equal((combined.match(/connect-src https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co/g)||[]).length,2);
assert.equal((combined.match(/connect-src 'none'/g)||[]).length,1);
fs.writeFileSync(path.join(DIST,'_headers'),combined);
for(const [src,dest] of [
 ['staging-health.html','staging-health.html'],
 ['assets/staging-health.js','assets/staging-health.js'],
 ['assets/staging-health.css','assets/staging-health.css']
]){
 const target=path.join(DIST,dest);fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(path.join(SRC,src),target);
}
for(const [key,bytes] of lockedBefore)assert.deepEqual(fs.readFileSync(path.join(DIST,key)),bytes);
const list=fs.readdirSync(DIST,{recursive:true}).map(x=>String(x)).sort();
assert.ok(list.includes('staging-health.html'));
console.log('N10-A7.39-P5: closed auth homepage unchanged, preflight-only path added, exact path CSP overrides added. No cloud calls.');
