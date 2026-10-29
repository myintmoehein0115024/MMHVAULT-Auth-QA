'use strict';
/*
 N10-A7.37 - builds a REVIEW-ONLY, hard-locked credential UI page.
 This build is NEVER connected to Cloudflare Pages automatic deployment.
 The existing A7.32 locked homepage remains untouched.
*/
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const SOURCE='review/n10a737-credential-qa-LOCKED';
const DEST='qa/n10a737-preview-dist';
const names=['_headers','index.html','robots.txt','assets/auth-qa.css','assets/auth-qa.js'];
const contents=new Map(names.map(file=>[file,fs.readFileSync(path.join(SOURCE,file))]));
const html=contents.get('index.html').toString('utf8');
const js=contents.get('assets/auth-qa.js').toString('utf8');
const csp=contents.get('_headers').toString('utf8');
for(const x of ['REAL_AUTH_ENABLED=false','REAL_REGISTRATION_ENABLED=false',
  'REAL_RESET_ENABLED=false','GOOGLE_OAUTH_ENABLED=false'])
 assert.ok(js.includes(x),'no public preview without disabled hardgate '+x);
assert.match(csp,/connect-src 'none'/);
assert.match(csp,/frame-ancestors 'none'/);
assert.match(csp,/form-action 'none'/);
assert.match(csp,/script-src 'self'/);
assert.match(csp,/Cache-Control: no-store/);
assert.match(csp,/X-Frame-Options: DENY/);
for(const id of ['login-identity','login-password','register-username','register-email',
  'register-password','register-confirm','recovery-email','login-submit',
  'register-submit','recovery-submit']){
 const re=new RegExp('<(?:input|button)[^>]*id="'+id+'"[^>]*disabled');
 assert.match(html,re,'credential input / real submit MUST be disabled: '+id);
}
assert.doesNotMatch(html,/https:\/\/(?:mmhvault\.com|.*supabase\.co)/i);
assert.doesNotMatch(js,/\bfetch\s*\(|\bXMLHttpRequest\s*\(|\bWebSocket\s*\(|\bEventSource\s*\(|\bimport\s*\(/);
assert.doesNotMatch(js,/\b(createClient|signInWithPassword|setSession|signUp|resetPasswordForEmail)\s*\(/);
assert.doesNotMatch(js,/vrypucmyrztxgiqhjspd|sb_secret_|sb_publishable_/i);
assert.ok(!fs.existsSync(path.join(SOURCE,'.env')));
const css=contents.get('assets/auth-qa.css').toString('utf8');
assert.match(css,/@media\(max-width:620px\)/);
fs.rmSync(DEST,{recursive:true,force:true});
fs.mkdirSync(DEST,{recursive:true});
for(const [name,bytes] of contents){
 const p=path.join(DEST,name);
 fs.mkdirSync(path.dirname(p),{recursive:true});
 fs.writeFileSync(p,bytes);
}
const collect=(dir,prefix='')=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(ent=>{
 const p=prefix?prefix+'/'+ent.name:ent.name;
 return ent.isDirectory()?collect(path.join(dir,ent.name),p):[p];
}).sort();
assert.deepEqual(collect(DEST),[...names].sort());
console.log('N10-A7.37 built 5 isolated hardlocked QA preview assets in '+DEST);
console.log('No Cloudflare Pages or Supabase mutations were executed.');
