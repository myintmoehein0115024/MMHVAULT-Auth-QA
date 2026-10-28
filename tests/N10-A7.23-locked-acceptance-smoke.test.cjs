'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const content=fs.readFileSync('integration/N10-A7.23-real-username-acceptance-LOCKED.cjs','utf8');
const BASE='https://ldivswlhtgmznzwhzsoi.supabase.co';
const cfg={project:'ldivswlhtgmznzwhzsoi',base:BASE,origin:'https://myintmoehein0115024.github.io',endpoint:BASE+'/functions/v1/mmh-n10a6-username'};
function load(open){
 const mod={exports:{}};
 const js=open?content.replace('const ALLOW_REAL_OPERATIONS=false','const ALLOW_REAL_OPERATIONS=true'):content;
 vm.runInNewContext(js,{module:mod},{timeout:1500});
 return mod.exports;
}
function fixture(){
 const seen=[],id='11111111-1111-4111-8111-111111111111';
 let current=null;
 const api={
  async preflight(){seen.push('preflight');return {status:200,code:'preflight_ok',enabled:true,registration_enabled:false,scope:'isolated_staging_only'}},
  async signInWithPassword(){seen.push('email');current=id},
  async getUser(){seen.push('remote');return current?{id:current,email_confirmed_at:'verified'}:null},
  async getSession(){seen.push('local');return current?{user:{id:current}}:null},
  async ownerProbe(){seen.push('rls');return [{user_id:current}]},
  async bindUsername(){seen.push('bind');return {status:200,code:'bind_success'}},
  async loginUsername(){seen.push('username');return {status:200,code:'login_success',access_token:'synthetic_access',refresh_token:'synthetic_refresh'}},
  async setSession(){seen.push('setSession');current=id},
  async signOutLocal(){seen.push('logout');current=null}
 };
 const captcha={async take(action){seen.push('widget:'+action);return 'synthetic-sample-token-long-enough'}};
 const args={cfg,api,captcha,credentials:{username:'qa_alpha',password:'synthetic-test'},options:{}};
 return {seen,args};
}
test('hard lock prevents any requests',async()=>{
 const f=fixture();const r=await load(false).runControlledAcceptance(f.args);
 assert.equal(r.code,'test_window_locked');assert.equal(f.seen.length,0);
});
test('wrong project rejected before requests',async()=>{
 const f=fixture();f.args.cfg={...cfg,project:'different-project'};
 const r=await load(true).runControlledAcceptance(f.args);
 assert.equal(r.code,'wrong_staging_project');assert.equal(f.seen.length,0);
});
test('successful mocked bind then login checks RLS twice',async()=>{
 const f=fixture();const r=await load(true).runControlledAcceptance(f.args);
 assert.equal(r.code,'staging_username_acceptance_pass');
 assert.equal(f.seen.filter(x=>x==='rls').length,2);
 assert.equal(f.seen.filter(x=>x==='logout').length,2);
 assert.ok(f.seen.includes('widget:mmh_n10a6_bind'));
 assert.ok(f.seen.includes('widget:mmh_n10a6_login'));
 assert.ok(!JSON.stringify(r).includes('synthetic-test'));
});
test('existing alias path does not bind again',async()=>{
 const f=fixture();f.args.options={mode:'login_existing_alias'};
 const r=await load(true).runControlledAcceptance(f.args);
 assert.equal(r.ok,true);assert.ok(!f.seen.includes('bind'));
});
test('invalid username rejected before requests',async()=>{
 const f=fixture();f.args.credentials.username='not allowed';
 const r=await load(true).runControlledAcceptance(f.args);
 assert.equal(r.code,'invalid_sample_username');assert.equal(f.seen.length,0);
});
test('closed preflight refuses login',async()=>{
 const f=fixture();f.args.api.preflight=async()=>({status:200,code:'preflight_ok',enabled:false,registration_enabled:false,scope:'isolated_staging_only'});
 const r=await load(true).runControlledAcceptance(f.args);
 assert.equal(r.code,'server_window_closed');assert.ok(!f.seen.includes('email'));
});
test('bind conflict aborts, no username login',async()=>{
 const f=fixture();f.args.api.bindUsername=async()=>({status:409,code:'username_unavailable'});
 const r=await load(true).runControlledAcceptance(f.args);
 assert.equal(r.code,'bind_not_accepted');assert.ok(!f.seen.includes('username'));
});
test('invalid RLS owner blocks bind and cleans local session',async()=>{
 const f=fixture();f.args.api.ownerProbe=async()=>[];
 const r=await load(true).runControlledAcceptance(f.args);
 assert.equal(r.code,'rls_owner_mismatch');assert.ok(f.seen.includes('logout'));
});
