import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),runs=[];
for(const name of ['01-specific-recognition','02-reversible-hiding','03-heritable-escape','03-control-kill-off','04-clonal-replacement']){
 const data=JSON.parse(await readFile('experiments/immune-genetics/'+name+'.json','utf8')),s=new CellLab.Simulation(CellLabExperiment.parse(data).config);await CellLabWasm.install(s,module);const run={name,samples:[]};
 for(const time of [0,200,600,1500,4000]){s.advance(time-s.C.time);const cells=s.live().filter(m=>!m.dying),tumors=cells.filter(m=>m.kind===2);run.samples.push({time,tumor:tumors.length,immune:cells.filter(m=>m.kind===3).length,counters:{...s.counters},immunity:s.immunity.report().metrics,geneticCounts:turmCounts(tumors),tumors:tumors.slice(0,32).map(m=>({id:m.id,geneClone:m.geneClone,expression:[...m.expression.peptides],damage:m.damage}))});if(name==='02-reversible-hiding'&&time===200){s.set('antigenStressGain',0);run.intervention='At 200 MCS, set antigenStressGain=0; same gene remains.';}}
 runs.push(run);console.log(JSON.stringify({name,samples:run.samples.map(x=>({time:x.time,tumor:x.tumor,kills:x.counters.kills,clones:x.geneticCounts,primed:x.immunity.primed,arrivals:x.immunity.reinforcements}))}));await writeFile('reports/immune-genetics/demo-results.json',JSON.stringify(runs,null,2));
}
function turmCounts(cells){const counts={};for(const c of cells)counts[c.geneClone]=(counts[c.geneClone]||0)+1;return counts;}
