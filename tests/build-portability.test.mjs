import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, copyFile, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const repo=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const prefix=join(resolve(tmpdir()),'cell-arena-build-');
  const root=await mkdtemp(prefix);
  t.after(async()=>{
    const target=resolve(root);
    assert.ok(target.startsWith(prefix)&&!target.slice(prefix.length).includes(sep),'Cleanup must remain in the created build fixture');
    await rm(target,{recursive:true,force:true});
  });
  await Promise.all(['src','vendor'].map(name=>cp(join(repo,name),join(root,name),{recursive:true})));
  await mkdir(join(root,'scripts'));await mkdir(join(root,'build'));
  await copyFile(join(repo,'scripts/build.mjs'),join(root,'scripts/build.mjs'));
  await copyFile(join(repo,'build/cpm-kernel.wasm'),join(root,'build/cpm-kernel.wasm'));
  for(const ext of ['wasm','meta.json'])await copyFile(join(repo,'build/appearance-kernel.'+ext),join(root,'build/appearance-kernel.'+ext));
  const source=(await readFile(join(root,'src/cpm-kernel.c'),'utf8')).replace(/\r\n/g,'\n');
  const meta=JSON.parse(await readFile(join(repo,'build/cpm-kernel.meta.json'),'utf8'));
  meta.sourceSHA256=sha(source);
  await writeFile(join(root,'build/cpm-kernel.meta.json'),JSON.stringify(meta));
  await writeFile(join(root,'src/cpm-kernel.c'),source);
  return {root,source};
}
function build(root){return spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});}

test('Windows and Linux C source line endings produce the same verified website',async t=>{
  const {root,source}=await fixture(t);
  let result=build(root);assert.equal(result.status,0,result.stderr);
  const linux=await readFile(join(root,'dist/index.html'));
  await writeFile(join(root,'src/cpm-kernel.c'),source.replace(/\n/g,'\r\n'));
  result=build(root);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(await readFile(join(root,'dist/index.html')),linux);
  const manifest=JSON.parse(await readFile(join(root,'dist/manifest.json'),'utf8'));
  assert.equal(manifest.htmlSHA256,sha(linux));
});

test('Normalizing line endings still rejects a changed C source',async t=>{
  const {root,source}=await fixture(t);
  await writeFile(join(root,'src/cpm-kernel.c'),source+'\nconst int changed_kernel_source = 1;\n');
  const result=build(root);assert.notEqual(result.status,0);assert.match(result.stderr,/WASM source\/binary mismatch/);
});

test('Normalizing line endings still rejects a mismatched WASM artifact',async t=>{
  const {root}=await fixture(t),file=join(root,'build/cpm-kernel.wasm'),binary=await readFile(file);
  binary[binary.length-1]^=1;await writeFile(file,binary);
  const result=build(root);assert.notEqual(result.status,0);assert.match(result.stderr,/WASM source\/binary mismatch/);
});

test('Appearance kernel must match its source before publication',async t=>{
  const {root}=await fixture(t),file=join(root,'src/appearance-kernel.c'),source=await readFile(file,'utf8');
  await writeFile(file,source.replace(/\r?\n/g,'\r\n'));assert.equal(build(root).status,0);
  await writeFile(file,source+'\n/* changed */\n');const result=build(root);
  assert.notEqual(result.status,0);assert.match(result.stderr,/Appearance WASM source\/binary mismatch/);
});
