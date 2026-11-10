// Descriptive multi-seed observation; never screens seeds used by the website.
import vm from 'node:vm';import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js','src/start-seed.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const out='output/visit-seeds';await mkdir(out,{recursive:true});
const result={modelSHA256:createHash('sha256').update(await readFile('src/model.js')).digest('hex'),config:{scene:'oncogenesis',worldWidth:240,worldHeight:180,refinement:1.5,boundary:'wrap'},runs:[]};
for(let i=0;i<4;i++){
 const seed=CellLabStartSeed.createGenerator({now:()=>1794300000123+i*1973,precise:()=>14.567+i*.071,random:()=>Math.imul(i+1,0x9e3779b9)>>>0})();
 const sim=new CellLab.Simulation({...result.config,seed});await CellLabWasm.install(sim,module);
 const row={seed,samples:[]};const started=performance.now();
 for(let t=0;t<=6000;t+=1000){
  if(t)sim.advance(1000);const live=sim.live().filter(m=>!m.dying),immune=live.filter(m=>m.kind===3);
  row.samples.push({time:sim.C.time,normal:live.filter(m=>m.kind===1&&m.state==='normal').length,abnormal:live.filter(m=>m.state==='abnormal').length,tumor:live.filter(m=>m.kind===2).length,immune:immune.length,active:immune.filter(m=>m.activation>0&&m.immunePhenotype!=='suppressive').length,suppressive:immune.filter(m=>m.immunePhenotype==='suppressive').length,counters:{...sim.counters}});
  console.log(JSON.stringify({seed,...row.samples.at(-1)}));
 }
 row.elapsedMs=Math.round(performance.now()-started);row.orphans=sim.snapshot().orphans;result.runs.push(row);
 await writeFile(out+'/evolution.json',JSON.stringify(result,null,2));
}
