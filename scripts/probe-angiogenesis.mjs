import vm from 'node:vm';import {readFile,writeFile,mkdir} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),out=process.argv[2]||'output/angiogenesis-controlled.json',runs=[];
for(const fraction of [null,0,.5,1]){
 const s=new CellLab.Simulation({width:160,height:128,scene:'empty',seed:31,warmup:0,vessels:[{x:80,y:64,radius:11}],settings:{metabolism:.25,supply:3,apoptosis:0,vesselLifespan:0,vesselImmuneRate:0,vesselDivisions:6,angiogenesis:1,angiogenicHalfLife:240,immuneLearning:0}});await CellLabWasm.install(s,module);const samples=[];
 for(let t=0;t<=6000;t+=100){if(t){if(fraction!==null){s.fields.angiogenicNormal.values.fill(2*(1-fraction));s.fields.angiogenicTumor.values.fill(2*fraction);}s.advance(100);}if(t%500===0)samples.push({time:t,vascular:s.vascular.report(),counters:{...s.counters}});}
 const valid=s.live().every(m=>s.section.fits(m,m.nucleusX,m.nucleusY)&&s.components(m.id).length===1),r={fraction,valid,samples};runs.push(r);console.log(JSON.stringify({fraction,valid,sprouts:s.counters.vascularSprouts,mature:s.counters.vascularMaturations,divisions:s.counters.endothelialDivisions,vascular:s.vascular.report()}));
}
await writeFile(out,JSON.stringify({revision:CellLab.MODEL_REVISION,description:'Controlled, externally replenished induction fields; normal tissue not pre-deleted.',runs},null,2)+'\n');
