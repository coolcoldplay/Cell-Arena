import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const index=await readFile('dist/index.html'),legacy=await readFile('dist/artistoo-playground.html');
const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
assert.ok(index.equals(legacy),'Hosted entry and offline entry must use the same model');
assert.equal(createHash('sha256').update(index).digest('hex'),manifest.htmlSHA256);
assert.equal(index.length,manifest.bytes);
const html=index.toString('utf8');
assert.match(html,/<title>Cell-Arena/);
assert.match(html,/id="worker-source"/);
assert.match(html,/globalThis.CELL_LAB_WASM=/);
assert.match(html,/id="history-range"/);
assert.match(html,/Copyright \(c\) 2019 Johannes Textor &amp; Inge Wortel/);
const escaped=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;');
for(const [source,id,notice] of [['vendor/LICENSE','license-artistoo','licenses/Artistoo-MIT.txt'],['vendor/MT19937-LICENSE.txt','license-mt19937','licenses/MT19937-BSD-3-Clause.txt']]){
  const license=await readFile(source,'utf8');
  assert.ok(html.includes(`<pre id="${id}">${escaped(license)}</pre>`),'The complete license must appear in the visible page markup: '+source);
  assert.equal(await readFile('dist/'+notice,'utf8'),license,'Standalone license download must preserve the original text');
  assert.ok(manifest.thirdPartyLicenses.some(entry=>entry.notice===notice),'Manifest must list each bundled license');
}
assert.doesNotMatch(html,/\/\* INLINE_/,'No unresolved build placeholders');
// Skip inline script bodies: upstream API documentation contains inert HTML examples.
const scripts=[...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)];
assert.equal(scripts.length,3,'The Worker source, app entry and optional analytics loader must be present');
assert.ok(scripts.some(match=>/id="cloudflare-analytics"/.test(match[1])),'The production-only analytics loader must be present');
assert.ok(scripts.every(match=>!(/\bsrc\s*=/i.test(match[1]))),'Runtime scripts must be self-contained');
const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
assert.ok(!(/<link\b(?=[^>]*\brel=["']stylesheet["'])/i.test(markup)),'Styles must be self-contained');
console.log(JSON.stringify({name:manifest.name,entry:'dist/index.html',bytes:index.length,htmlSHA256:manifest.htmlSHA256,verified:true},null,2));
