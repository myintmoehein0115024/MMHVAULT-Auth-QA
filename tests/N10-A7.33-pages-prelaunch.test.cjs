'use strict';
/* N10-A7.33 — deployment safety gate for a proposed project, NOT a deployer.
 * A manifest is neither user approval nor evidence that Cloudflare is configured.
 */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const MANIFEST='hosting/N10-A7.33-PAGES-PROJECT-LAUNCH-MANIFEST-NOT-APPLIED.json';
const m=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));
const input='hosting/n10a732-preview',out='qa/n10a732-preview-dist';
const expectedFiles=['_headers','index.html','robots.txt','assets/locked-preview.css','assets/locked-preview.js'];
function inspect(x){
 const errors=[];
 if(x.kind!=='REVIEW_ONLY_NOT_APPLIED')errors.push('plan_not_review_only');
 for(const key of ['user_explicit_create_approval','cloud_mutation_allowed','deploy_allowed','accounts_approved_for_login','real_auth_allowed']){
  if(x[key]!==false)errors.push(key+'_not_disabled');
 }
 if(x.proposed_project_name!=='mmhvault-auth-qa-locked')errors.push('unexpected_project_name');
 if(x.host_type!=='separate_cloudflare_pages_dev_domain')errors.push('custom_or_prod_host_detected');
 if(!Array.isArray(x.custom_domains)||x.custom_domains.length!==0||
    !Array.isArray(x.allowed_production_domains)||x.allowed_production_domains.length!==0)
    errors.push('domain_binding_forbidden');
 if(x.github_repository!=='myintmoehein0115024/MMHVAULT-Auth-QA'||
    x.github_ref!=='n10-a7-3-staging-readonly-review')errors.push('wrong_github_source');
 if(x.cloudflare_account_id!=='c864cb8b24ed8eb2def1dfcef2b588ca')errors.push('wrong_account');
 if(x.build?.command!=='node hosting/N10-A7.32-build-quarantined-preview.cjs'||
    x.build?.output_dir!==out||x.build?.root_dir!=='/'||
    x.build?.no_auth_bundle!==true||x.build?.no_cloud_api_calls!==true||
    x.build?.no_external_connectivity!==true)errors.push('unsafe_build');
 if(x.source_proposal?.type!=='github'||x.source_proposal?.repo_owner!=='myintmoehein0115024'||
    x.source_proposal?.repo_name!=='MMHVAULT-Auth-QA'||
    x.source_proposal?.production_branch!==x.github_ref||
    x.source_proposal?.automatic_production_deployments!==false||
    x.source_proposal?.preview_deployments!=='none')errors.push('auto_deployment_not_disabled');
 if(x.security_expectations?.csp_connect_src!=="'none'"||
    x.security_expectations?.csp_frame_ancestors!=="'none'"||
    x.security_expectations?.inputs_disabled!==true||
    x.security_expectations?.auth_results!=='NOT RUN'||
    x.security_expectations?.g10_g11_status!=='PENDING'||
    x.security_expectations?.staging_edge_code_gate!==false||
    x.security_expectations?.staging_edge_origin_must_remain!=='https://myintmoehein0115024.github.io')
    errors.push('authentication_separation_broken');
 if(x.security_expectations?.staging_secrets_must_not_be_copied!==true||
    x.security_expectations?.cloudflare_secret_key_must_not_be_embedded!==true||
    x.security_expectations?.production_site_must_remain_untouched!==true)
    errors.push('secret_or_production_handling_invalid');
 return errors;
}
test('proposed project manifest is non-executable and all cloud write gates are false',()=>{
 assert.deepEqual(inspect(m),[]);
});
test('proposal contains NO custom domain or production route',()=>{
 assert.deepEqual(m.custom_domains,[]);
 assert.deepEqual(m.allowed_production_domains,[]);
 assert.ok(m.outside_scope.includes('configure_mmhvault.com'));
});
test('Cloudflare Git deploys disabled even if GitHub project integration becomes available',()=>{
 assert.equal(m.source_proposal.automatic_production_deployments,false);
 assert.equal(m.source_proposal.preview_deployments,'none');
 assert.equal(m.source_proposal.require_cloudflare_github_app_verification,true);
});
test('build uses isolated Pages output dir and no secrets/runtime service bindings',()=>{
 assert.equal(m.build.command,'node hosting/N10-A7.32-build-quarantined-preview.cjs');
 assert.equal(m.build.output_dir,out);
 assert.equal(m.security_expectations.csp_connect_src,"'none'");
 assert.equal(m.security_expectations.g10_g11_status,'PENDING');
});
test('manifest cannot be considered consent to create/deploy',()=>{
 const doc=fs.readFileSync(MANIFEST,'utf8');
 assert.ok(!doc.includes('"user_explicit_create_approval": true'));
 assert.ok(!doc.includes('"cloud_mutation_allowed": true'));
 assert.ok(!doc.includes('"deploy_allowed": true'));
 assert.ok(doc.includes('next_actions_requires_separate_user_approval'));
});
for(const [name,patch,needle] of [
 ['user create approval flips',x=>{x.user_explicit_create_approval=true},'user_explicit_create_approval_not_disabled'],
 ['cloud write flips',x=>{x.cloud_mutation_allowed=true},'cloud_mutation_allowed_not_disabled'],
 ['deploy flips',x=>{x.deploy_allowed=true},'deploy_allowed_not_disabled'],
 ['real login flips',x=>{x.real_auth_allowed=true},'real_auth_allowed_not_disabled'],
 ['production hostname',x=>{x.custom_domains=['mmhvault.com']},'domain_binding_forbidden'],
 ['QA subdomain',x=>{x.custom_domains=['qa.mmhvault.com']},'domain_binding_forbidden'],
 ['production repo',x=>{x.github_repository='myintmoehein0115024/MMHVAULT'},'wrong_github_source'],
 ['production backend',x=>{x.security_expectations.staging_edge_origin_must_remain='https://mmhvault.com'},'authentication_separation_broken'],
 ['auto production deploy',x=>{x.source_proposal.automatic_production_deployments=true},'auto_deployment_not_disabled'],
 ['auto preview deploy',x=>{x.source_proposal.preview_deployments='all'},'auto_deployment_not_disabled'],
 ['SDK public network',x=>{x.security_expectations.csp_connect_src='https://ldivswlhtgmznzwhzsoi.supabase.co'},'authentication_separation_broken'],
 ['wrong Pages output',x=>{x.build.output_dir='.'},'unsafe_build']
]){
 test('manifest rejects '+name,()=>{
  const changed=JSON.parse(JSON.stringify(m));patch(changed);
  assert.ok(inspect(changed).includes(needle),JSON.stringify(inspect(changed)));
 });
}
test('actual Pages preview source excludes any SDK, Supabase API requests and live credentials',()=>{
 const html=fs.readFileSync(path.join(input,'index.html'),'utf8'),
  js=fs.readFileSync(path.join(input,'locked-preview.js'),'utf8'),
  headers=fs.readFileSync(path.join(input,'_headers'),'utf8');
 assert.match(html,/id="locked-password"[^>]+disabled/);
 assert.match(html,/id="real-run"[^>]+disabled/);
 assert.match(headers,/connect-src 'none'/);
 assert.match(headers,/frame-ancestors 'none'/);
 assert.doesNotMatch(js,/\bfetch\s*\(|\bcreateClient\s*\(|\bsignInWithPassword\s*\(|\bXMLHttpRequest\s*\(/);
 assert.doesNotMatch(html,/vrypucmyrztxgiqhjspd|sb_secret_|auth\/v1\/token/);
 assert.ok(!fs.existsSync('hosting/n10a732-preview/.env'));
});
test('build creates exactly the known locked static files and excludes hidden credential files',()=>{
 execFileSync(process.execPath,['hosting/N10-A7.32-build-quarantined-preview.cjs'],{stdio:'pipe'});
 const walk=(at,relative='')=>fs.readdirSync(at,{withFileTypes:true}).flatMap(ent=>{
  const target=path.join(at,ent.name),p=relative?relative+'/'+ent.name:ent.name;
  return ent.isDirectory()?walk(target,p):[p]
 }).sort();
 assert.deepEqual(walk(out),[...expectedFiles].sort());
});
test('existing GitHub workflow remains local-only and does not deploy Cloudflare Pages',()=>{
 const w=fs.readFileSync('.github/workflows/n10-a732-locked-hosting-https.yml','utf8');
 assert.match(w,/actions\/upload-artifact@v4/);
 assert.doesNotMatch(w,/\bwrangler\s+pages\s+deploy\b/);
 assert.doesNotMatch(w,/CLOUDFLARE_API_TOKEN/);
 assert.doesNotMatch(w,/cloudflare\.request\(/);
});
