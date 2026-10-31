const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..','n10-edge-integration');
const stage='ldivswlhtgmznzwhzsoi';
const PROD='vrypucmyrztxgiqhjspd';
const read=(folder,name='index.ts')=>fs.readFileSync(path.join(base,folder,name),'utf8');
const cases=[
  ['mmh-financial-assistant','financial-ai','const transactions = await readRows(','return json({code:"MFA_ALLOWED"'],
  ['mmh-push-test','push-test','const subs = await sql','return json({code:"MFA_ALLOWED"'],
  ['mmh-n10a783-phrase-verify','recovery-phrase',"admin.from('mmh_n10a740_username_links')","return out(origin,200,'MFA_ALLOWED'"],
];
test('Actual production-candidate auth checks are isolated in staging before private work',async t=>{
  for(const [folder,label,privateMarker,qaMarker] of cases){
    await t.test(folder,()=>{
      const source=read(folder);
      assert.ok(source.includes(stage),'Explicit staging project boundary is required');
      assert.ok(!source.includes(PROD),'Never call a production project from isolated QA');
      assert.ok(source.includes('qa_only:true'),'Only an authorized QA decision may be returned');
      assert.ok(source.indexOf(qaMarker)>source.indexOf('MFA_REQUIRED')||
        (folder==='mmh-n10a783-phrase-verify'&&source.indexOf(qaMarker)>source.indexOf("'mfa_required'")));
      assert.ok(source.indexOf(qaMarker)<source.indexOf(privateMarker),
        'QA must return before first side-effectful or private-data operation');
      assert.ok(source.includes('getUser')||source.includes('authUser'),
        'Supabase Auth must verify caller before testing MFA');
      assert.ok(!source.includes('console.log('),'Never log credentials or bearer tokens');
    });
  }
});
test('Staging dependencies are pinned and MFA helpers cannot be skipped',async()=>{
  const ai=read('mmh-financial-assistant');
  const push=read('mmh-push-test');
  const phrase=read('mmh-n10a783-phrase-verify');
  assert.ok(ai.includes('npm:@supabase/supabase-js@2.57.4'));
  assert.ok(phrase.includes('npm:@supabase/supabase-js@2.57.4'));
  assert.ok(push.includes('npm:postgres@3.4.7'));
  assert.ok(ai.includes('evaluateMfaAssurance(assurance, hasVerifiedFactor)'));
  assert.ok(push.includes('evaluatePushMfa(mfaRequired, user.id, jwtClaims)'));
  assert.ok(phrase.includes('evaluateMfaAssurance(data,hasVerifiedFactor)'));
  assert.ok(ai.includes('if (!Array.isArray(user.factors))'));
  assert.ok(phrase.includes('if(!Array.isArray(user?.factors))'));
  assert.ok(!push.includes(String.raw`/^Bearer\\s+`));
  assert.ok(push.includes('parseVerifiedBearerClaims'));
  assert.ok(read('mmh-financial-assistant','mfa-assurance.mjs')===
            read('mmh-n10a783-phrase-verify','mfa-assurance.mjs'));
});
