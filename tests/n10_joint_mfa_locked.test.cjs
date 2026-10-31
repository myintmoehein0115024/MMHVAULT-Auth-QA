// Security contract for the public but intentionally LOCKED A-only Staging MFA UI.
// Offline only: no network, credentials, Auth, or Vault requests.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('n10-joint-mfa-bind-20261101.html','utf8');
const js=fs.readFileSync('n10-joint-mfa-bind-20261101.js','utf8');
const tests=[
['QA disabled and expired',()=>{
 assert.match(js,/const QA_RELEASED = false;/);
 assert.match(js,/const QA_WINDOW_END_UTC = '1970-01-01T00:00:00.000Z'/);
 assert.match(js,/const QA_OPEN = QA_RELEASED &&/);
 assert.match(js,/Date\.now\(\) < Date\.parse\(QA_WINDOW_END_UTC\)/);
 assert.match(js,/if\(QA_OPEN\)\{/);
 assert.match(js,/\$\('qaPassword'\)\.disabled=true/);
}],
['exact single synthetic A identity, isolated Staging project and QA path',()=>{
 assert.match(js,/https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co/);
 assert.match(js,/location\.origin === EXPECTED_ORIGIN/);
 assert.match(js,/location\.pathname === EXPECTED_PATH/);
 assert.match(js,/n10-joint-mfa-a-20261101@no-mail\.mmhvault\.invalid/);
 assert.match(js,/be5ec3b7-a35f-4a53-b2b7-0ff77a01fc4f/);
 assert.doesNotMatch(js,/vrypucmyrztxgiqhjspd|ccefb6d3-9ad1-4e3f-9d50-d9d54e826c11/);
}],
['no privileged secret, persistence or Vault API',()=>{
 assert.match(js,/const PUBLIC_KEY = 'sb_publishable_/);
 assert.doesNotMatch(js,/service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|console\.(?:log|error)|\.rpc\(/i);
 assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB|fetch\(/);
 assert.match(js,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
}],
['server-signed Auth identity, TOTP verification and AAL2 gates',()=>{
 for(const snippet of ['auth.signInWithPassword','auth.getUser','auth.mfa.listFactors','auth.mfa.enroll','auth.mfa.challenge','auth.mfa.verify','auth.mfa.getAuthenticatorAssuranceLevel',"currentLevel!=='aal2'",'auth.signOut']){
  assert.ok(js.includes(snippet),'missing '+snippet);
 }
 assert.match(js,/res\.data\?\.user\?\.id===ACCOUNT_UID/);
 assert.match(js,/String\(res\.data\.user\.email\|\|''\)\.toLowerCase\(\)===ACCOUNT_EMAIL/);
}],
['QR wiped on visibility change, navigation, cancel and timeout',()=>{
 assert.match(js,/totpQr'\)\.removeAttribute\('src'\)/);
 assert.match(js,/qrTimer=setTimeout\(/);
 assert.match(js,/document\.addEventListener\('visibilitychange'/);
 assert.match(js,/window\.addEventListener\('pagehide'/);
 assert.match(js,/flowVersion\+\+;hideQr\(\)/);
 assert.match(js,/function closeSession/);
}],
['public HTML has lock-safe defaults and strict QA-only CSP',()=>{
 assert.match(html,/<input id="qaPassword"[^>]* disabled>/);
 assert.match(html,/<button type="submit" id="loginButton" disabled>/);
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/connect-src https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co/);
 assert.match(html,/form-action 'none'/);
 assert.doesNotMatch(html,/vrypucmyrztxgiqhjspd|service_role/);
}]
];
let failures=0;for(const [name,fn] of tests){try{fn();process.stdout.write('PASS '+name+'\n')}catch(e){failures++;process.stderr.write('FAIL '+name+': '+e.message+'\n')}}
console.log((tests.length-failures)+'/'+tests.length+' locked QA security contracts');
if(failures)process.exitCode=1;
