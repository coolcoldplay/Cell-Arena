import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const mod=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),rows=[];
for(const seed of [17,77]){
 const settings={metabolism:.95,progression:4,normalMotility:.25,cohesion:.4,sectionYield:.4,tumorMotility:1.5,tumorMorphology:1,escape:4,chemotaxis:2.5};
 const s=new CellLab.Simulation({scene:'oncogenesis',worldWidth:240,worldHeight:180,refinement:1,boundary:'wrap',seed,settings});await CellLabWasm.install(s,mod);const row={seed,settings,samples:[]};
 for(const time of [3000,6000,12000]){s.advance(time-s.C.time);row.samples.push({time,normal:s.normalLivingCount(),tumor:s.live().filter(m=>m.kind===2&&!m.dying).length,counters:{...s.counters}});}rows.push(row);await writeFile('reports/immune-genetics/initiation-invasion.json',JSON.stringify(rows,null,2));console.log(JSON.stringify({seed,samples:row.samples.map(p=>({time:p.time,tumor:p.tumor,normal:p.normal,init:p.counters.abnormalInitiations,div:p.counters.divisions,kill:p.counters.kills,env:p.counters.environment}))}));
}
