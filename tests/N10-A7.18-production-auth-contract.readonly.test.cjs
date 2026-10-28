'use strict';
/**
 * N10-A7.18 production-auth read-only contract verifier.
 * Downloads ONLY public production HTML; no API keys used for requests,
 * no login, no cloud data, no file modification to production.
 */
const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const base='https://raw.githubusercontent.com/myintmoehein0115024/MMHVAULT/main/';
const EXPECTED={
 'login.html':'1183791db8cfad73ff740e96e157785f49a679b3',
 'app.html':'e4072fca7cc7a4096887be5feff9a78c92fb8346'
};
const sources={};
function sha(bytes){return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')}
before(async()=>{
  for(const file of Object.keys(EXPECTED)){
    const response=await fetch(base+file,{signal:AbortSignal.timeout(35000),headers:{'User-Agent':'MMHVAULT-QA-ReadOnly-Audit'}});
    assert.equal(response.status,200,'Could not obtain production '+file);
    const data=Buffer.from(await response.arrayBuffer());
    assert.ok(data.length>5000&&data.length<5000000,'Bad source size for '+file);
    sources[file]={text:data.toString('utf8'),blob:sha(data),size:data.length};
  }
});
test('production HTML blobs unchanged since read-only review',()=>{
  for(const [file,hash] of Object.entries(EXPECTED))assert.equal(sources[file].blob,hash, file+' changed: re-review before compatibility release');
});
test('two production HTML files use SAME real Supabase project and publishable key',()=>{
  for(const file of Object.keys(EXPECTED)){
    const t=sources[file].text;
    assert.ok(t.includes('https://vrypucmyrztxgiqhjspd.supabase.co'));
    assert.match(t,/sb_publishable_[a-zA-Z0-9_-]+/);
    assert.ok(!t.includes('ldivswlhtgmznzwhzsoi.supabase.co'),file+' must never point at QA');
    assert.ok(!t.includes('SERVICE_ROLE_KEY')&&!t.includes('sb_secret_'));
  }
});
test('signup, email password, and Google OAuth methods remain in production login',()=>{
  const t=sources['login.html'].text;
  for(const method of ['auth.signUp({','auth.signInWithPassword({email,password})',"auth.signInWithOAuth({provider:'google'"])
    assert.ok(t.includes(method),'Missing '+method);
});
test('Google callback and redirect require verified remote UID and cached session UID',()=>{
  const t=sources['login.html'].text;
  const functionText=t.slice(t.indexOf('async function verifiedRedirectV946('),t.indexOf('function openForm('));
  assert.ok(t.includes('loginCallbackUrlV160()'));
  assert.ok(t.includes("if(authCallbackPendingV945){"));
  assert.ok(functionText.includes('db.auth.getUser()')&&functionText.includes('db.auth.getSession()'));
  assert.ok(functionText.includes('remote.user.id!==expectedUserId'));
  assert.ok(functionText.includes('cached?.session?.user?.id!==expectedUserId'));
  assert.ok(functionText.includes('recoveryModeV943'));
  assert.ok(functionText.includes('location.replace(appUrl())'));
});
test('password recovery gated by actual PASSWORD_RECOVERY event and live identity',()=>{
  const t=sources['login.html'].text;
  assert.ok(t.includes("event==='PASSWORD_RECOVERY'"));
  assert.ok(t.includes('recoveryVerifiedV944')&&t.includes('recoveryUserIdV944'));
  assert.ok(t.includes('sessionData.session.user?.id!==recoveryUserIdV944'));
  assert.ok(t.includes('userData.user.id!==recoveryUserIdV944'));
  assert.ok(t.includes("auth.updateUser({password})"));
});
test('detected password policy differences remain P1 pre-release alignment work',()=>{
  const login=sources['login.html'].text,app=sources['app.html'].text;
  assert.match(login,/<input id="signupPassword"[^>]*minlength="6"/);
  assert.match(login,/<input id="recoveryPassword"[^>]*minlength="10"/);
  assert.match(app,/if\(next\.length<8\)/);
  console.log('AUDIT_P1_PASSWORD_MINS: signup 6 / reset 10 / settings 8; NO PRODUCTION EDIT');
});
test('main financial app validates remote user identity BEFORE showing protected content',()=>{
  const t=sources['app.html'].text;
  assert.ok(t.includes('mmhvaultFinishAuthBootV3285(session)'));
  assert.ok(t.includes('await db.auth.getUser()'));
  assert.ok(t.includes("verified.user.id!==session.user?.id"));
  assert.ok(t.includes("return enter({...session,user:verified.user})"));
  assert.ok(t.includes("mmhP947GuardV947('switch')"));
});
test('account switching hides old finance data and compares UID twice before loading',()=>{
  const t=sources['app.html'].text;
  const a=t.indexOf('window.mmhVaultSwitchSessionV1239=async function(session)');
  const b=t.indexOf('async function mmhVaultReconcileSessionV1239(',a);
  assert.ok(a>0&&b>a);
  const sw=t.slice(a,b);
  for(const signal of ["mmhP947GuardV947('switch')",'await db.auth.getUser()','await db.auth.getSession()','remote?.user?.id!==nextOwner','cache?.session?.user?.id!==nextOwner',"mmhVaultResetDataLifecycleV1239('account-switch')"])
    assert.ok(sw.includes(signal),'Missing account-switch guard '+signal);
});
test('global signout, other sessions signout, independent password proof preserved',()=>{
  const t=sources['app.html'].text;
  assert.ok(t.includes('db.auth.signOut({scope:\'others\'})'));
  assert.ok(t.includes('db.auth.signOut()'));
  assert.ok(t.includes("persistSession:false,autoRefreshToken:false,detectSessionInUrl:false"));
  assert.ok(t.includes('checked.data?.user?.id!==owner'));
  assert.ok(t.includes('db.auth.updateUser({password:next})'));
});
test('username must be a NEW staged auth choice: production does not yet call QA edge',()=>{
  for(const file of Object.keys(EXPECTED)){
    const t=sources[file].text;
    assert.ok(!t.includes('mmh-n10a6-username'),'Production unexpectedly references staging username API');
    assert.ok(!t.includes('mmh-n10a15-siteverify-qa'),'Production unexpectedly references QA service');
  }
  const t=sources['login.html'].text;
  assert.ok(!t.includes('auth.setSession('),'No username token handoff is implemented in production (expected)');
});
test('bilingual infrastructure exists and is preserved at login',()=>{
  const t=sources['login.html'].text;
  for(const k of ['window.getMMHVAULTLanguage','window.translateMMHVAULTMessage','window.applyMMHVAULTLanguage','data-lang="en"','data-lang="zh"'])
    assert.ok(t.includes(k));
});
test('formal and staging must use separate auth clients; do not bind financial data by email',()=>{
  const login=sources['login.html'].text,app=sources['app.html'].text;
  assert.match(login,/supabase\.createClient\(SUPABASE_URL,SUPABASE_KEY\)/);
  assert.match(app,/supabase\.createClient\(SUPABASE_URL,SUPABASE_KEY\)/);
  assert.match(app,/currentSessionUser\?\.id/);
  console.log('RELEASE_CONTRACT: setSession only with matching production project tokens, getUser UID and getSession UID verified before app navigation; no Staging tokens');
});
test('live official code is large and sensitive: migration MUST be isolated and incremental',()=>{
  assert.ok(sources['app.html'].size>2000000);
  assert.ok(sources['login.html'].size>10000);
  console.log('AUDIT_SOURCE_BYTES',Object.entries(sources).map(([k,v])=>k+':'+v.size).join(' / '));
});
