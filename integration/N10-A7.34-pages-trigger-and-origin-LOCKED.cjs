'use strict';
/*
 * MMHVAULT · N10-A7.34 · read-only Pages push lineage and trusted-host review.
 * NO Cloudflare API client, no external side effects, no shared secret, no auth.
 * Caller-supplied observations are informational, never cloud attestations.
 */
const ALLOW_CLOUDFLARE_MUTATION=false;
const ALLOW_STAGING_ORIGIN_MIGRATION=false;
const ALLOW_REAL_G10_G11=false;
const LOCKED_QA='https://mmhvault-auth-qa-locked.pages.dev';
const OLD_QA='https://myintmoehein0115024.github.io';
const PRODUCTION=Object.freeze(['https://mmhvault.com','https://www.mmhvault.com']);
const PROJECT='mmhvault-auth-qa-locked';
const REPO='MMHVAULT-Auth-QA';
const BRANCH='n10-a7-3-staging-readonly-review';
const EDGE_STAGING='ldivswlhtgmznzwhzsoi';
const CLOSED='1970-01-01T00:00:00.000Z';
const FAILURE=Object.freeze([
 'cloudflare_config_mutation_not_authorized',
 'staging_origin_change_not_authorized',
 'real_g10_g11_not_authorized'
]);
function originOf(input){
 if(typeof input!=='string')return null;
 try{
  const url=new URL(input);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
   url.pathname!=='/'||url.port)return null;
  return url.origin;
 }catch{return null}
}
function pagesConfigReview(project){
 const blockers=[];
 const c=project?.source?.config;
 if(project?.name!==PROJECT)blockers.push('wrong_pages_project');
 if(project?.source?.type!=='github'||c?.repo_name!==REPO||
    project?.production_branch!==BRANCH||c?.production_branch!==BRANCH)
  blockers.push('wrong_pages_source');
 if(project?.subdomain!=='mmhvault-auth-qa-locked.pages.dev')
  blockers.push('unexpected_pages_domain');
 if(project?.build_config?.build_command!=='node hosting/N10-A7.32-build-quarantined-preview.cjs'||
   project?.build_config?.destination_dir!=='qa/n10a732-preview-dist')
  blockers.push('unsafe_build_command_or_output');
 if(c?.production_deployments_enabled!==false)blockers.push('production_auto_deploy_not_disabled');
 if(c?.preview_deployment_setting!=='none')blockers.push('preview_auto_deploy_not_disabled');
 if(c?.deployments_enabled!==false)blockers.push('legacy_deployments_enabled_not_false');
 const domains=project?.custom_domains;
 if(!Array.isArray(domains)||domains.length)blockers.push('custom_domain_not_empty');
 return Object.freeze({
  configCoherent:blockers.length===0,
  code:'read_only_pages_source_audit',
  blockers:Object.freeze(blockers),
  mutationPerformed:false,
  automaticDeployGuaranteedOff:false,
  recommendation: c?.deployments_enabled===true?
   'Review legacy deployments_enabled true before separately approved cloud config change':
   'Keep live deployments under observational review'
 });
}
function lineageReview(deployments=[],stableCommit){
 if(!Array.isArray(deployments)||!deployments.length||
  typeof stableCommit!=='string'||!/^[0-9a-f]{40}$/.test(stableCommit))
  return Object.freeze({ok:false,code:'missing_deployment_evidence',blockers:['missing_deployment_evidence']});
 const blockers=[],successful=[],queued=[];
 for(const d of deployments){
  if(d?.projectName!==PROJECT||d?.branch!==BRANCH)
   blockers.push('foreign_deployment_record');
  if(d?.stage==='deploy'&&d?.status==='success')successful.push(d);
  else if(d?.status==='idle'&&d?.stage==='queued'){
   queued.push(d);
   if(d?.trigger!=='github:push')blockers.push('unexpected_queued_trigger');
  }else blockers.push('unreviewed_deployment_stage');
 }
 if(successful.length!==1||successful[0]?.sha!==stableCommit||
    successful[0]?.trigger!=='ad_hoc')
  blockers.push('success_baseline_changed');
 if(queued.some(x=>x.sha===stableCommit))blockers.push('duplicate_success_baseline_queued');
 return Object.freeze({
  ok:blockers.length===0,code:blockers.length?'lineage_review_blocked':'observed_lineage_consistent',
  successfulCount:successful.length,queuedIdleCount:queued.length,
  blockers:Object.freeze([...new Set(blockers)]),
  // Observation is explicitly NOT a promise that queued jobs never transition.
  futureDeploymentPreventionProved:false,authAllowed:false,cloudMutationPerformed:false
 });
}
function migrationScope({hostingOrigin,edgeOrigin,turnstileHostname,sitekeyHostname,
 jsSdkOrigin,expectedAction,codeGate,windowStartUTC,windowEndUTC,
 secretEnabled,userApprovedStagingChange=false}={}){
 const blockers=[];
 const h=originOf(hostingOrigin),edge=originOf(edgeOrigin),sdk=originOf(jsSdkOrigin);
 if(!h||h!==LOCKED_QA)blockers.push('not_the_isolated_locked_qa_host');
 if(!edge||edge!==OLD_QA)blockers.push('staging_edge_origin_not_current');
 if(!sdk||sdk!==OLD_QA)blockers.push('sdk_origin_not_current');
 if(turnstileHostname!=='myintmoehein0115024.github.io'||
  sitekeyHostname!=='myintmoehein0115024.github.io')
  blockers.push('turnstile_hostname_not_current');
 if(!['mmh_n10a6_login','mmh_n10a6_bind'].includes(expectedAction))
  blockers.push('captcha_action_unexpected');
 if(codeGate!==false||windowStartUTC!==CLOSED||windowEndUTC!==CLOSED)
  blockers.push('staging_window_not_closed');
 if(secretEnabled!==false)blockers.push('staging_secret_not_confirmed_false');
 if(userApprovedStagingChange!==true)blockers.push('staging_change_approval_missing');
 // The staging + locked preview origin cannot work for real auth now by design.
 blockers.push(...FAILURE);
 return Object.freeze({
  ready:false,canRunRealAuth:false,canModifyCloud:false,
  code:'origin_migration_review_locked',
  blockers:Object.freeze([...new Set(blockers)]),
  hostingOrigin:h,edgeOrigin:edge,
  actionableAfterSeparateApproval:Object.freeze([
   'Choose a new isolated credential-safe QA host and independently validate HTTP CSP',
   'Explicitly review the Staging-only Edge allowed origin and SDK guard',
   'Review Turnstile sitekey hostname and server-side action/hostname verification',
   'Recheck HMAC replay defense, rate limits and existing account-only flow',
   'Approve at most 15 minutes UTC, close and reconcile afterward'
  ])
 });
}
module.exports={pagesConfigReview,lineageReview,migrationScope,originOf,
 LOCKED_QA,OLD_QA,PROJECT,REPO,BRANCH,EDGE_STAGING,CLOSED,FAILURE};
