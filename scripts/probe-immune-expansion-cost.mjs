import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const wasm=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),runs=[];
for(const growth of [0,.65]){
 const s=new CellLab.Simulation({scene:'hot',seed:77,worldWidth:240,worldHeight:180,refinement:1,boundary:'wrap',settings:{immuneGrowth:growth}});await CellLabWasm.install(s,wasm);
 const summary=()=>{const a=s.live().filter(c=>!c.dying);return {time:s.C.time,cells:a.length,immune:a.filter(c=>c.kind===3).length,tumor:a.filter(c=>c.kind===2).length,immuneDivisions:s.counters.immuneDivisions,kills:s.counters.kills};};
 const run={immuneGrowth:growth,initial:summary(),windows:[]};
 for(const checkpoint of [100,6000]){
  s.advance(Math.max(0,checkpoint-s.C.time));global.gc?.();const before=summary(),times=[];
  for(let n=0;n<3;n++){const start=performance.now();s.advance(64);times.push((performance.now()-start)/64);}global.gc?.();
  run.windows.push({before,after:summary(),stepMs:times,heapMiB:process.memoryUsage().heapUsed/1048576});
 }runs.push(run);console.log(JSON.stringify(run));
}
await writeFile('reports/immune-genetics/expansion-cost.json',JSON.stringify({protocol:'Hot scene seed 77, 240x180 lattice, identical settings except immuneGrowth 0 vs 0.65. 3x64-step timing windows near start and 6000 MCS. This observes indirect ecosystem workload: changed immune expansion also changes tumor survival, contacts and lineage; it is not a per-immune-cell microbenchmark.',runs},null,2));
