import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const mod=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),rows=[];
for(const [floor,extent]of [[.32,1],[.42,1],[.22,.65],[.32,.65]]){
 const s=new CellLab.Simulation({scene:'oncogenesis',worldWidth:240,worldHeight:180,refinement:1,boundary:'wrap',seed:17,warmup:0});await CellLabWasm.install(s,mod);
 for(let i=0;i<s.supplyMap.length;i++){const x=(i%s.fields.oxygen.width+.5)/s.fields.oxygen.width,y=(Math.floor(i/s.fields.oxygen.width)+.5)/s.fields.oxygen.height;let supply=1;for(const n of s.ecology.niches){const r=Math.hypot((x-n.x)/(n.rx*extent),(y-n.y)/(n.ry*extent));supply=Math.min(supply,floor+(1-floor)*Math.max(0,Math.min(1,(r-.55)/.65)));}s.supplyMap[i]=supply;}
 const row={floor,extent,samples:[]};for(const time of [3000,6000,12000]){s.advance(time-s.C.time);row.samples.push({time,normal:s.normalLivingCount(),tumor:s.live().filter(m=>m.kind===2&&!m.dying).length,counters:{...s.counters}});}rows.push(row);await writeFile('reports/immune-genetics/niche-calibration.json',JSON.stringify(rows,null,2));console.log(JSON.stringify({floor,extent,samples:row.samples.map(p=>({time:p.time,tumor:p.tumor,normal:p.normal,init:p.counters.abnormalInitiations,div:p.counters.divisions,kill:p.counters.kills,env:p.counters.environment}))}));
}
