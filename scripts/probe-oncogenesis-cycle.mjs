import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const mod=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),rows=[];
for(const metabolism of [.85,.95,1.05])for(const seed of [17,77]){
 const s=new CellLab.Simulation({scene:'oncogenesis',worldWidth:240,worldHeight:180,refinement:1,boundary:'wrap',seed,settings:{metabolism}});await CellLabWasm.install(s,mod);
 const row={seed,metabolism,samples:[]};
 for(const time of [3000,6000,12000]){s.advance(time-s.C.time);const tumors=s.live().filter(m=>m.kind===2&&!m.dying);row.samples.push({time,normal:s.normalLivingCount(),tumor:tumors.length,counters:{...s.counters},immunity:s.immunity.report().metrics,tumors:tumors.slice(0,24).map(m=>({id:m.id,age:m.age,antigen:m.antigen,fitness:m.fitness,stress:m.stress,oxygen:m.oxygen,glucose:m.glucose,acid:m.acid,reserve:{...m.resources},cycle:{...m.cycle}}))});}
 rows.push(row);await writeFile('reports/immune-genetics/oncogenesis-cycle-calibration.json',JSON.stringify(rows,null,2));console.log(JSON.stringify({seed,metabolism,samples:row.samples.map(p=>({time:p.time,tumor:p.tumor,normal:p.normal,div:p.counters.divisions,kill:p.counters.kills,env:p.counters.environment}))}));
}
