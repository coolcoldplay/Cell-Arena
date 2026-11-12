import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const mod=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),rows=[];
for(const [size,metabolism,supply]of [[192,.85,2.8],[240,.85,2.8],[192,1,2.7],[192,1.1,2.7],[240,1,2.7]]){
 const s=new CellLab.Simulation({scene:'oncogenesis',worldWidth:size,worldHeight:size*.75,refinement:1,boundary:'wrap',seed:17,settings:{metabolism,supply}});await CellLabWasm.install(s,mod);const row={size,metabolism,supply,initial:s.normalLivingCount(),samples:[]};
 for(let n=0;n<6;n++){s.advance(1000);const tissue=s.live().filter(m=>m.kind===1&&!m.vesselID&&!m.dying);row.samples.push({time:s.C.time,normal:s.normalLivingCount(),tumor:s.live().filter(m=>m.kind===2&&!m.dying).length,initiations:s.counters.abnormalInitiations,deaths:s.counters.environment,maxStress:Math.max(...tissue.map(m=>m.stress)),maxAdversity:Math.max(...tissue.map(m=>m.adversity)),maxInflammation:Math.max(...tissue.map(m=>m.inflammatoryExposure))});}
 rows.push(row);console.log(JSON.stringify(row));await writeFile('reports/immune-genetics/initiation-balance.json',JSON.stringify(rows,null,2));
}
