// Interleave two revisions on the same thread to reduce CPU scheduling/thermal
// bias. Never benchmark separate processes concurrently on a user's busy PC.
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const baseline=process.argv[2]||'HEAD',steps=Number(process.argv[3]||40),pairs=Number(process.argv[4]||6);
const files=['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'];
const models=[];
vm.runInThisContext(await readFile(files[0],'utf8'),{filename:files[0]});
for(const revision of [baseline,null]){
  const source=async f=>revision?execFileSync('git',['show',revision+':'+f],{maxBuffer:16000000}):readFile(f);
  // Classes live in source IIFEs; existing instances retain the old methods.
  // Use the same ordinary JS realm: VM sandbox global lookups would otherwise
  // add a large overhead absent from production and skew the measurement.
  for(const file of files.slice(1))vm.runInThisContext((await source(file)).toString('utf8'),{filename:(revision||'current')+'/'+file});
  const module=await CellLabWasm.load(await source('build/cpm-kernel.wasm'));
  const s=new CellLab.Simulation({scene:'hot',seed:29,worldWidth:512,worldHeight:384,refinement:2,warmup:0});
  await CellLabWasm.install(s,module);s.advance(16);models.push(s);
}
const fingerprint=s=>{
  const hash=createHash('sha256');hash.update(s.C.grid._pixels);hash.update(new Uint32Array(s.C.mt.mt));
  hash.update(JSON.stringify({index:s.C.mt.mti,cells:s.snapshot().cells,counters:s.counters,borders:s.C.borderpixels.elements}));for(const f of Object.values(s.fields))hash.update(f.values);return hash.digest('hex');
};
const rows=[];
for(let pair=0;pair<pairs;pair++){
  const times=[];
  for(const index of pair%2?[1,0]:[0,1]){globalThis.gc?.();const start=performance.now();models[index].advance(steps);times[index]=performance.now()-start;}
  const hashes=models.map(fingerprint);if(hashes[0]!==hashes[1])throw Error('State divergence in pair '+pair);
  rows.push({pair:pair+1,time:models[0].C.time,before:steps*1000/times[0],after:steps*1000/times[1],gain:times[0]/times[1],stateHash:hashes[0]});
}
const totals=[0,1].map(i=>rows.reduce((sum,r)=>sum+steps*1000/(i?r.after:r.before),0));
const result={baseline,steps,pairs,lattice:[1024,768],cells:models[0].live().length,beforeMCS:steps*pairs*1000/totals[0],afterMCS:steps*pairs*1000/totals[1],gain:totals[0]/totals[1],rows};
await mkdir('output/performance',{recursive:true});await writeFile('output/performance/interleaved-kernel.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
