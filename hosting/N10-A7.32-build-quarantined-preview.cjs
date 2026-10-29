'use strict';
/*
 * N10-A7.32 · Build an independent LOCKED-only Pages preview.
 * No deploy, no Cloudflare API, no GitHub Pages modification.
 * Creates output in qa/n10a732-preview-dist for CI inspection/artifact only.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const input='hosting/n10a732-preview',output='qa/n10a732-preview-dist';
const html=fs.readFileSync(path.join(input,'index.html'),'utf8');
const js=fs.readFileSync(path.join(input,'locked-preview.js'),'utf8');
const originalCss=fs.readFileSync('n10a726/staging-locked.css','utf8');
const headers=fs.readFileSync(path.join(input,'_headers'),'utf8');
assert.match(html,/id="locked-password"[^>]*disabled/);
assert.match(html,/id="real-run"[^>]*disabled/);
assert.match(headers,/connect-src 'none'/);
assert.match(headers,/frame-ancestors 'none'/);
assert.match(headers,/Cache-Control: no-store, private/);
assert.doesNotMatch(js,/\bfetch\s*\(|\bXMLHttpRequest\s*\(|\bWebSocket\s*\(|\bEventSource\s*\(|\bimport\s*\(/);
assert.doesNotMatch(js,/\bsetSession\s*\(|\bsignInWithPassword\s*\(|\bcreateClient\s*\(/);
assert.ok(!html.includes('vrypucmyrztxgiqhjspd'));
assert.ok(!html.includes('sb_secret_'));
fs.rmSync(output,{force:true,recursive:true});
fs.mkdirSync(path.join(output,'assets'),{recursive:true,mode:0o755});
fs.writeFileSync(path.join(output,'index.html'),html);
fs.writeFileSync(path.join(output,'_headers'),headers);
fs.copyFileSync(path.join(input,'robots.txt'),path.join(output,'robots.txt'));
fs.writeFileSync(path.join(output,'assets','locked-preview.js'),js);
fs.writeFileSync(path.join(output,'assets','locked-preview.css'),originalCss+
'\n/* N10-A7.32: extra long bilingual label safety */\n'+
'.shell,.panel,.result-item,.specs,.panel-top{min-width:0}\n'+
'.panel h2,.specs dd,.result-item span,.banner-copy,.flow-detail{overflow-wrap:anywhere}\n'+
'@media(max-width:380px){.shell{width:calc(100% - 24px)}.brand{font-size:12px}.status-pill{font-size:9px}}\n');
const paths=[];
for(const file of fs.readdirSync(output)){paths.push(file)}
console.log('N10-A7.32 locked preview files built into '+output);
console.log('N10-A7.32 generated top-level assets: '+paths.sort().join(', '));
console.log('N10-A7.32 no cloud calls or production changes were made.');
