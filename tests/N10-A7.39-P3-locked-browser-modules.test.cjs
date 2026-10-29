'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const builder=require('../review/N10-A7.39-P3-build-locked-browser-modules.cjs');
const base=path.resolve(builder.output);
const cfg={project:'ldivswlhtgmznzwhzsoi',base:'https://ldivswlhtgmznzwhzsoi.supabase.co',
 endpoint:'https://ldivswlhtgmznzwhzsoi.supabase.co/functions/v1/mmh-n10a6-username',
 origin:'https://mmhvault-auth-g10g11-locked.pages.dev',
 publishableKey:'sb_publishable_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456'};
let build;
test.before(()=>{build=builder.generate()});
test('builder emits five isolated host-matched modules and NO live deploy',()=>{
 assert.deepEqual(build,{ok:true,modules:5,output:builder.output});
 const items=fs.readdirSync(base).sort();
 assert.deepEqual(items,['acceptance.cjs','adapter.cjs','controller.cjs','manifest.json','sdk.cjs','turnstile.cjs']);
 const m=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
 assert.equal(m.qaOrigin,cfg.origin);assert.equal(m.cloudWriteAllowed,false);
 assert.equal(m.realAuthAllowed,false);assert.equal(m.realUsernameOperationsPerformed,false);
 assert.equal(m.stagingProject,cfg.project);assert.equal(m.modules.length,5);
});
test('five exact origin changes preserve original immutable hardlocks',()=>{
 for(const [source,file,origin,gate] of builder.sources){
  const original=fs.readFileSync(source,'utf8'),dest=fs.readFileSync(path.join(base,file),'utf8');
  const marker='/* N10-A7.39-P3 / REVIEW ONLY / STAGING ORIGIN / AUTH GATES FALSE */\n';
  const expect=original.replace("const "+origin+"='"+builder.oldHost+"';",
    "const "+origin+"='"+builder.newHost+"';");
  assert.equal(dest,marker+expect,file);
  assert.ok(dest.includes("const "+gate+"=false;"),file);
  assert.ok(!dest.includes("const "+origin+"='"+builder.oldHost+"';"),file);
 }
});
test('controller validates private QA host but refuses actual operations',async()=>{
 const x=require(path.join(base,'controller.cjs'));
 assert.equal(x.guardConfig(cfg),true);
 assert.equal(x.guardConfig({...cfg,origin:builder.oldHost}),false);
 const r=await x.runControlledAcceptance({cfg,api:{preflight(){throw Error('network_should_not_run')}},captcha:{},credentials:{}});
 assert.equal(r.ok,false);assert.equal(r.code,'test_window_locked');
});
test('adapter validates private host but does not initialize SDK',()=>{
 const a=require(path.join(base,'adapter.cjs'));
 assert.equal(a.isValidContext(cfg),true);
 assert.equal(a.isValidContext({...cfg,origin:'https://mmhvault.com'}),false);
 assert.equal(a.makeStagingAdapter({cfg,client:{get auth(){throw Error('must_not_call')}},transport(){throw Error('must_not_call')}}).code,'review_locked');
});
test('SDK bootstrap validates private host but never creates a live client',()=>{
 const sdk=require(path.join(base,'sdk.cjs'));
 assert.equal(sdk.validContext(cfg,cfg.origin),true);
 assert.equal(sdk.validContext({...cfg,origin:builder.oldHost},builder.oldHost),false);
 let invoked=0;
 const a=sdk.createIsolatedStagingSdk({cfg,origin:cfg.origin,
 createClient(){invoked++;throw Error('client_creation_forbidden')},
 fetcher(){invoked++;throw Error('fetch_forbidden')},
 randomUUID(){invoked++;throw Error('random_not_allowed')}});
 assert.equal(a.enabled,false);assert.equal(a.code,'staging_sdk_bootstrap_locked');
 assert.equal(invoked,0);
});
test('Turnstile action provider is locked even with the allowed private QA hostname',()=>{
 const t=require(path.join(base,'turnstile.cjs'));
 assert.equal(t.ORIGIN,cfg.origin);
 assert.deepEqual([...t.ACTIONS],['mmh_n10a6_login','mmh_n10a6_bind']);
 const v=t.createActionProvider({origin:cfg.origin,
 turnstile:{get render(){throw Error('widget_not_allowed')}}});
 assert.equal(v.enabled,false);assert.equal(v.code,'turnstile_review_locked');
});
test('acceptance orchestrator only recognizes the new isolated host and remains locked',()=>{
 const s=fs.readFileSync(path.join(base,'acceptance.cjs'),'utf8');
 assert.ok(s.includes("const ORIGIN='"+cfg.origin+"';"));
 assert.ok(s.includes('const ALLOW_BROWSER_ACCEPTANCE=false;'));
 assert.ok(!s.includes('https://mmhvault.com'));
});
test('current Pages artifact still has zero remote credential capabilities',()=>{
 const live=fs.readFileSync('review/n10a737-credential-qa-LOCKED/assets/auth-qa.js','utf8');
 const head=fs.readFileSync('review/n10a737-credential-qa-LOCKED/_headers','utf8');
 const build=fs.readFileSync('review/N10-A7.37-build-credential-ui-LOCKED.cjs','utf8');
 assert.match(head,/connect-src 'none'/);assert.match(head,/form-action 'none'/);
 for(const q of ['REAL_AUTH_ENABLED','REAL_REGISTRATION_ENABLED','REAL_RESET_ENABLED','GOOGLE_OAUTH_ENABLED'])
  assert.ok(live.includes('const '+q+'=false;'));
 assert.ok(!build.includes('n10a739p3-locked-browser-review'));
});
