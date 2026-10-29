'use strict';
/*
 * MMHVAULT N10-A7.31 — REVIEW-ONLY hosting/security evidence gate.
 * This module audits supplied data. It cannot deploy, change secrets, touch
 * Supabase, authorize accounts, or open a test window.
 */
const ALLOW_REAL_STAGING_SIGNOFF=false;
const PROJECT='ldivswlhtgmznzwhzsoi';
const EDGE='mmh-n10a6-username';
const ALLOWED_ORIGIN='https://myintmoehein0115024.github.io';
const PROD_ORIGINS=Object.freeze(['https://mmhvault.com','https://www.mmhvault.com']);
const STAGING_BASE='https://'+PROJECT+'.supabase.co';
const MAIN_SHA='0352514a17a62da58fbebea97ac0c570d6cf4bfcc50dc78bb7bdedc3774479e7';
const SITEVERIFY_SHA='bfef2e85f48f2c3a296d376fa78130a4b112c7e39da783a81541968d67f9318c';
const SITEVERIFY_EXPIRY='2026-10-30T17:00:00.000Z';
const CLOSED='1970-01-01T00:00:00.000Z';
const FAIL_FLAGS=Object.freeze(['release_not_approved','real_staging_signoff_locked']);
function normalizedHeaders(source){
 const h=Object.create(null);
 if(source===null||typeof source!=='object')return h;
 for(const [k,value] of Object.entries(source)){
  const name=String(k).trim().toLowerCase();
  if(!/^[a-z0-9-]{1,90}$/.test(name)||typeof value!=='string'||/[\r\n]/.test(value))continue;
  h[name]=value.trim();
 }
 return h;
}
function parseCSP(policy){
 const directives=Object.create(null);
 if(typeof policy!=='string'||policy.length>3000)return directives;
 for(const part of policy.split(';')){
  const tokens=part.trim().split(/\s+/).filter(Boolean);
  if(!tokens.length)continue;
  const name=tokens.shift().toLowerCase();
  if(!/^[a-z][a-z-]*$/.test(name)||Object.hasOwn(directives,name))return Object.create(null);
  directives[name]=tokens;
 }
 return directives;
}
function headerAudit(headers){
 const h=normalizedHeaders(headers),faults=[];
 const flag=(bad,code)=>{if(bad)faults.push(code)};
 const csp=parseCSP(h['content-security-policy']);
 const values=(n)=>csp[n]||[];
 const equals=(n,t)=>values(n).length===1&&values(n)[0]===t;
 flag(!Object.keys(csp).length,'csp_missing_or_invalid');
 for(const n of ['default-src','base-uri','object-src','form-action','frame-ancestors','worker-src'])
  flag(!equals(n,"'none'"),'csp_'+n.replaceAll('-','_')+'_not_none');
 const fixed={
  'script-src':["'self'",'https://challenges.cloudflare.com'],
  'style-src':["'self'"],
  'connect-src':["'self'",STAGING_BASE,'https://challenges.cloudflare.com'],
  'frame-src':['https://challenges.cloudflare.com'],
  'img-src':["'self'",'data:','https://challenges.cloudflare.com']
 };
 for(const [name,required] of Object.entries(fixed)){
  const actual=values(name);
  flag(actual.length!==required.length||actual.some(x=>!required.includes(x))||
   required.some(x=>!actual.includes(x)), 'csp_'+name.replaceAll('-','_')+'_unsafe');
 }
 flag(!Object.hasOwn(csp,'upgrade-insecure-requests')||values('upgrade-insecure-requests').length,
  'csp_https_upgrade_missing');
 flag(h['x-frame-options']!=='DENY','iframe_header_missing');
 flag(h['x-content-type-options']!=='nosniff','nosniff_header_missing');
 flag(h['referrer-policy']!=='no-referrer','referrer_header_missing');
 flag(!/^\s*no-store(?:\s*,|$)/i.test(h['cache-control']||''),'no_store_header_missing');
 flag(h['cross-origin-opener-policy']!=='same-origin','coop_header_missing');
 const hsts=h['strict-transport-security']||'';
 const max=/^max-age=(\d+)(?:;.*)?$/i.exec(hsts)?.[1];
 flag(!max||!Number.isSafeInteger(Number(max))||Number(max)<31536000,'hsts_header_missing_or_short');
 const permissions=h['permissions-policy']||'';
 for(const rule of ['camera=()','microphone=()','geolocation=()','payment=()'])
  flag(!permissions.split(',').some(x=>x.trim()===rule),'permissions_'+rule.split('=')[0]+'_missing');
 return Object.freeze({ok:faults.length===0,code:faults.length?'hosting_headers_blocked':'hosting_headers_conform',
  blockers:Object.freeze([...new Set(faults)])});
}
function verifyStaticEdge({project,origin,slug,edgeSha,siteverifySha,edgeSource,siteverifySource,nowUTC}={}){
 const faults=[];
 if(project!==PROJECT||slug!==EDGE||origin!==ALLOWED_ORIGIN)faults.push('staging_identity_mismatch');
 if(edgeSha!==MAIN_SHA||siteverifySha!==SITEVERIFY_SHA)faults.push('cloud_sha_not_baselined');
 if(typeof edgeSource!=='string'||!edgeSource.includes('const CODE_GATE_OPEN = false;')||
    !edgeSource.includes("const WINDOW_START_UTC = '"+CLOSED+"';")||
    !edgeSource.includes("const WINDOW_END_UTC = '"+CLOSED+"';"))
  faults.push('staging_edge_not_hard_closed');
 if(typeof edgeSource!=='string'||!edgeSource.includes("const ORIGIN = '"+ALLOWED_ORIGIN+"';")||
    !edgeSource.includes("const HOSTNAME = 'myintmoehein0115024.github.io';")||
    !edgeSource.includes("env('N10A6_STAGING_ENABLED') === 'true'"))
  faults.push('edge_origin_or_secret_gate_changed');
 if(typeof siteverifySource!=='string'||
    !siteverifySource.includes("const ORIGIN='"+ALLOWED_ORIGIN+"';")||
    !siteverifySource.includes("const HOSTNAME='myintmoehein0115024.github.io';")||
    !siteverifySource.includes("const DEADLINE='"+SITEVERIFY_EXPIRY+"';"))
  faults.push('siteverify_scope_or_expiry_changed');
 const iso=typeof nowUTC==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(nowUTC)
  &&Number.isFinite(Date.parse(nowUTC))&&new Date(nowUTC).toISOString()===nowUTC;
 if(!iso)faults.push('clock_evidence_missing');
 else if(Date.parse(nowUTC)>=Date.parse(SITEVERIFY_EXPIRY))faults.push('siteverify_qa_expired');
 return Object.freeze({ok:faults.length===0,code:faults.length?'edge_review_blocked':'edge_closed_baseline_verified',
  blockers:Object.freeze(faults)});
}
function auditAcceptanceReadiness({headers,server,sitekeyHostnameVerified=false,
 sitekeyActionVerified=false,secretStateManuallyAttested=false,
 namedExistingAccountsApproved=false,userApprovedSpecificWindow=false,
 rollbackRunnerTested=false,authCallbackOriginReviewed=false}={}){
 const report=headerAudit(headers),edge=verifyStaticEdge(server);
 const blockers=[...report.blockers,...edge.blockers];
 const manual={
  sitekeyHostnameVerified,sitekeyActionVerified,secretStateManuallyAttested,
  namedExistingAccountsApproved,userApprovedSpecificWindow,rollbackRunnerTested,
  authCallbackOriginReviewed
 };
 for(const [name,value] of Object.entries(manual))if(value!==true)blockers.push('requires_'+name);
 // Even a fully populated synthetic report cannot permit real traffic.
 blockers.push(...FAIL_FLAGS);
 return Object.freeze({
  ok:false,releaseReady:false,allowedToOpen:false,cloudMutationPerformed:false,
  code:'real_staging_still_locked',
  hosting:report.code,edge:edge.code,blockers:Object.freeze([...new Set(blockers)])
 });
}
function allowedTargetOrigin(origin){
 if(PROD_ORIGINS.includes(origin))return false;
 return origin===ALLOWED_ORIGIN;
}
module.exports={headerAudit,parseCSP,verifyStaticEdge,auditAcceptanceReadiness,
 allowedTargetOrigin,STAGING_BASE,MAIN_SHA,SITEVERIFY_SHA,SITEVERIFY_EXPIRY,
 ALLOWED_ORIGIN,PROD_ORIGINS,CLOSED};
