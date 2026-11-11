import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');
let html = await read('src/index.html');
const [css, engine, model, worker, app, license,fast,section,wasm,gpu,renderer] = await Promise.all(['src/style.css','vendor/artistoo.js','src/model.js','src/worker.js','src/app.js','vendor/LICENSE','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/gpu-fields.js','src/gpu-renderer.js'].map(read));
const binary=await readFile(path.join(root,'build/cpm-kernel.wasm'));
const display=await read('src/display-fields.js'),insertion=await read('src/insertion.js');
const experiment=await read('src/experiment.js'),recorder=await read('src/recorder.js'),i18n=await read('src/i18n.js'),aboutEnglish=await read('src/about.en.html'),mobile=await read('src/mobile-ui.js'),trajectories=await read('src/trajectories.js');
const mtLicense=await read('vendor/MT19937-LICENSE.txt');
const sidebarCapture=await read('src/sidebar-capture.js'),statistics=await read('src/statistics-panel.js'),adaptive=await read('src/adaptive-performance.js');
const historyChart=await read('src/history-chart.js');
const signalGesture=await read('src/signal-gesture.js');
const startSeed=await read('src/start-seed.js'),appearance=await read('src/cell-appearance.js'),autoRandom=await read('src/auto-random.js'),rounds=await read('src/round-history.js');
const wasmMeta=JSON.parse(await read('build/cpm-kernel.meta.json'));
const appearanceBinary=await readFile(path.join(root,'build/appearance-kernel.wasm')),appearanceMeta=JSON.parse(await read('build/appearance-kernel.meta.json'));
if(appearanceMeta.sourceSHA256!==createHash('sha256').update((await read('src/appearance-kernel.c')).replace(/\r\n/g,'\n')).digest('hex')||appearanceMeta.wasmSHA256!==createHash('sha256').update(appearanceBinary).digest('hex'))throw Error('Appearance WASM source/binary mismatch. Run npm run build:wasm.');
// Git stores LF while an editor may write CRLF; both are the same C source.
const wasmSource=(await read('src/cpm-kernel.c')).replace(/\r\n/g,'\n');
if(wasmMeta.sourceSHA256!==createHash('sha256').update(wasmSource).digest('hex')||wasmMeta.wasmSHA256!==createHash('sha256').update(binary).digest('hex'))throw Error('WASM source/binary mismatch. Run npm run build:wasm.');
for (const [slot, text] of Object.entries({ STYLE: css, WORKER: `globalThis.CELL_LAB_WASM='${binary.toString('base64')}';\n`+[engine,fast,section,wasm,gpu,insertion,model,experiment,worker].join('\n'), ABOUT_EN:aboutEnglish, APP: [i18n,display,renderer,experiment,sidebarCapture,recorder,mobile,statistics,app].join('\n'), LICENSE: license, MT_LICENSE: mtLicense })) {
  const source=slot==='APP'?`globalThis.CELL_LAB_APPEARANCE_WASM='${appearanceBinary.toString('base64')}';\n`+adaptive+'\n'+trajectories+'\n'+historyChart+'\n'+signalGesture+'\n'+startSeed+'\n'+appearance+'\n'+autoRandom+'\n'+rounds+'\n'+text:text;
  const safe = slot.endsWith('LICENSE') ? source.replaceAll('&','&amp;').replaceAll('<','&lt;') : source.replace(/<\/script/gi, '<\\/script');
  html = html.replace(`/* INLINE_${slot} */`, () => safe);
}
// Windows checkouts and Linux Pages builds must produce the same bytes/hash.
html = html.replace(/\r\n/g, '\n');
await mkdir(path.join(root,'dist'), { recursive: true });
await writeFile(path.join(root,'dist/index.html'), html);
await writeFile(path.join(root,'dist/artistoo-playground.html'), html);
await writeFile(path.join(root,'dist/.nojekyll'), '');
await mkdir(path.join(root,'dist/licenses'),{recursive:true});
await writeFile(path.join(root,'dist/licenses/Artistoo-MIT.txt'),license);
await writeFile(path.join(root,'dist/licenses/MT19937-BSD-3-Clause.txt'),mtLicense);
const manifest = { name: 'Cell-Arena', version: '4.0.0', engine: 'Artistoo', upstream: 'https://github.com/ingewortel/artistoo', commit: 'e997d81213a5dcdfc40ad976a18958f412f00cc9', engineLicense: 'MIT', thirdPartyLicenses:[{component:'Artistoo',license:'MIT',notice:'licenses/Artistoo-MIT.txt'},{component:'MT19937 / Mersenne Twister',license:'BSD-3-Clause',notice:'licenses/MT19937-BSD-3-Clause.txt'}], engineSHA256: createHash('sha256').update(engine).digest('hex'), wasmSHA256:createHash('sha256').update(binary).digest('hex'), htmlSHA256: createHash('sha256').update(html).digest('hex'), bytes: Buffer.byteLength(html) };
manifest.appearanceWasmSHA256=createHash('sha256').update(appearanceBinary).digest('hex');
await writeFile(path.join(root,'dist/manifest.json'), JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
