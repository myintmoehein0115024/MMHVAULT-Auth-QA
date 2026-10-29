'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../integration/N10-A7.41-production-username-session-handoff-REVIEW-ONLY.cjs');
const PROD='https://vrypucmyrztxgiqhjspd.supabase.co';
const A='123e4567-e89b-42d3-a456-426614174000',B='123e4567-e89b-42d3-a456-426614174001';
const grant={code:'login_success',access_token:'A'.repeat(120),refresh_token:'R'.repeat(80)};
function fixture(opts={}){
 const calls=[];
 let current=opts.existing?{user:{id:A}}:null;
 let resultRedirect=opts.redirectOk!==false;
 const db={supabaseUrl:opts.clientUrl||PROD,auth:{
  async getSession(){calls.push('getSession');return{data:{session:current}}},
  async setSession(s){calls.push('setSession');current=opts.noSession?null:{user:{id:A}};
    return opts.setError?{error:{code:'invalid'}}:{data:{session:current}}},
  async getUser(){calls.push('getUser');return{data:{user:{
    id:opts.wrongId?B:A,email_confirmed_at:'2026-10-01',is_anonymous:false}}}},
  async signOut(v){calls.push('signOut:'+v.scope);current=null;return{error:null}}
 }};
 return{db,calls,redirect:async(uid)=>{calls.push('verifiedRedirect');return resultRedirect}};
}
test('production username adapter hardlocked by default, no live requests',async()=>{
 assert.equal(M.ENABLE_PRODUCTION_USERNAME_LOGIN,false);
 assert.deepEqual(await M.invokeProductionUsernameLogin(),{ok:false,code:'not_released'});
});
test('reject any Staging host or mismatched SDK before session mutation',async()=>{
 for(const bad of [PROD.replace('vrypucmyrztxgiqhjspd','ldivswlhtgmznzwhzsoi'),'https://mmhvault.com']){
  const f=fixture();
  const out=await M.verifySessionAndHandoff({db:f.db,grant,verifiedRedirect:f.redirect,clientUrl:bad});
  assert.equal(out.code,'prod_project_or_client_invalid');
  assert.equal(f.calls.length,0);
 }
});
test('reject missing or unverified username server grant',async()=>{
 for(const g of [null,{}, {...grant,code:'wrong'}, {...grant,refresh_token:''}, {...grant,access_token:'a'}]){
  const f=fixture();const res=await M.verifySessionAndHandoff({db:f.db,grant:g,verifiedRedirect:f.redirect,clientUrl:PROD});
  assert.equal(res.ok,false);assert.equal(f.calls.length,0);
 }
});
test('verified original Auth UID goes through existing verifiedRedirect only after 2 UID checks',async()=>{
 const f=fixture();const out=await M.verifySessionAndHandoff({db:f.db,grant,verifiedRedirect:f.redirect,clientUrl:PROD});
 assert.equal(out.ok,true);assert.equal(out.user_id,A);
 assert.deepEqual(f.calls,['getSession','setSession','getUser','getSession','verifiedRedirect']);
});
test('existing logged-in user cannot be silently replaced by username flow',async()=>{
 const f=fixture({existing:true});const out=await M.verifySessionAndHandoff({db:f.db,grant,verifiedRedirect:f.redirect,clientUrl:PROD});
 assert.equal(out.code,'existing_session_requires_logout');assert.deepEqual(f.calls,['getSession']);
});
test('wrong UID always revokes newly installed local session',async()=>{
 const f=fixture({wrongId:true});const out=await M.verifySessionAndHandoff({db:f.db,grant,verifiedRedirect:f.redirect,clientUrl:PROD});
 assert.equal(out.ok,false);assert.equal(out.code,'uid_or_redirect_check_failed');
 assert.equal(f.calls.at(-1),'signOut:local');assert.ok(!f.calls.includes('verifiedRedirect'));
});
test('verifiedRedirect refusal revokes local session',async()=>{
 const f=fixture({redirectOk:false});const out=await M.verifySessionAndHandoff({db:f.db,grant,verifiedRedirect:f.redirect,clientUrl:PROD});
 assert.equal(out.ok,false);assert.equal(f.calls.at(-1),'signOut:local');
});
test('session install failure revokes local state if setSession partially mutated',async()=>{
 const f=fixture({setError:true});const out=await M.verifySessionAndHandoff({db:f.db,grant,verifiedRedirect:f.redirect,clientUrl:PROD});
 assert.equal(out.code,'session_install_failed');assert.equal(f.calls.at(-1),'signOut:local');
});
test('client SDK wrong Supabase project blocked even when clientUrl argument looks correct',async()=>{
 const f=fixture({clientUrl:'https://ldivswlhtgmznzwhzsoi.supabase.co'});
 const out=await M.verifySessionAndHandoff({db:f.db,grant,verifiedRedirect:f.redirect,clientUrl:PROD});
 assert.equal(out.code,'prod_project_or_client_invalid');assert.equal(f.calls.length,0);
});
test('existing prod app and private Staging projects are not mutated by adapter review',()=>{
 const fs=require('node:fs'),s=fs.readFileSync('integration/N10-A7.41-production-username-session-handoff-REVIEW-ONLY.cjs','utf8');
 assert.match(s,/const ENABLE_PRODUCTION_USERNAME_LOGIN=false/);
 assert.doesNotMatch(s,/fetch\s*\(|deploy_edge_function|createClient\(|sb_secret_|service_role/);
 assert.doesNotMatch(s,/https:\/\/ldivswlhtgmznzwhzsoi\.supabase\.co/);
});
