// Run in fresh processes with --expose-gc, after all other probes have stopped.
import vm from 'node:vm';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import os from 'node:os';
const label=process.argv[2]||'after',revision=process.argv.find(x=>x.startsWith('--baseline='))?.slice(11),size=384,steps=160;
const source=async f=>revision?execFileSync('git',['show',revision+':'+f],{maxBuffer:20*1024*1024}):readFile(f);
const files=['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js',...(revision?[]:['src/immune-genetics.js']),'src/model.js'];
const hash=createHash('sha256');for(const file of files){const data=await source(file);hash.update(data);vm.runInThisContext(data.toString(),{filename:file});}
const module=await CellLabWasm.load(await source('build/cpm-kernel.wasm')),rows=[];
for(let repeat=0;repeat<3;repeat++){
 let s=new CellLab.Simulation({scene:'hot',seed:29,worldWidth:size,worldHeight:size*.75,refinement:2,warmup:0,settings:{growth:0,immuneGrowth:0,normalRepair:0,apoptosis:0,kill:0,stressMutation:0,immuneKillLimit:0,vesselImmuneRate:0,vesselLifespan:0}});await CellLabWasm.install(s,module);s.advance(32);
 const cells=s.live().length;global.gc?.();const memoryBefore=process.memoryUsage(),start=performance.now();s.advance(steps);const elapsed=performance.now()-start;
 const snapshots=[];for(let i=0;i<8;i++){const begin=performance.now();s.snapshot();snapshots.push(performance.now()-begin);}global.gc?.();const memory=process.memoryUsage();
 if(cells!==s.live().length)throw Error('Fixed-population benchmark changed population');
 rows.push({repeat,cells,lattice:[s.width,s.height],steps,elapsedMs:elapsed,stepMs:elapsed/steps,mcsPerSecond:steps*1000/elapsed,snapshotMs:snapshots.reduce((a,b)=>a+b)/snapshots.length,heapMiB:memory.heapUsed/1048576,arrayBufferMiB:memory.arrayBuffers/1048576,heapDeltaMiB:(memory.heapUsed-memoryBefore.heapUsed)/1048576});s=null;global.gc?.();
}
const result={label,revision:revision||CellLab.MODEL_REVISION,codeHash:hash.digest('hex'),node:process.version,cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,notes:'Fixed population: growth, killing, apoptosis and vascular arrivals disabled identically in both versions. Mechanics, geometry/contact scans, nutrient fields and recognition remain active. Fresh process; three repeats; heap is process JS memory, not whole-browser/GPU RAM.',rows};await mkdir('reports/immune-genetics',{recursive:true});await writeFile(`reports/immune-genetics/performance-${label}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
