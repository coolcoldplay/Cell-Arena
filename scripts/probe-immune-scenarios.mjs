import vm from 'node:vm';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),label=process.argv[2]||'draft';
await mkdir('reports/immune-genetics',{recursive:true});
const result={revision:CellLab.MODEL_REVISION,codeHash:createHash('sha256').update(await readFile('src/immune-genetics.js')).update(await readFile('src/model.js')).digest('hex'),config:{worldWidth:240,worldHeight:180,refinement:1,boundary:'wrap'},runs:[]};
const scenes=process.argv.find(x=>x.startsWith('--scenes='))?.slice(9).split(',')||['hot','cold','oncogenesis','random'];
for(const scene of scenes)for(const seed of [17,31,77,101]){
  const s=new CellLab.Simulation({...result.config,scene,seed,warmup:35});await CellLabWasm.install(s,module);
  const run={scene,seed,settings:s.settings,initial:s.scenarioReport().initial,samples:[]},start=performance.now();
  for(const time of [0,500,1500,3000,6000,...(['oncogenesis','random'].includes(scene)?[12000]:[]),...(scene==='oncogenesis'?[24000]:[])]){
    s.advance(Math.max(0,time-s.C.time));const cells=s.live().filter(c=>!c.dying),tumors=cells.filter(c=>c.kind===2),im=s.immunity.report();
    run.samples.push({time:s.C.time,normal:cells.filter(c=>c.kind===1&&c.state==='normal'&&!c.vesselID).length,precancer:cells.filter(c=>c.state==='abnormal').length,tumor:tumors.length,immune:cells.filter(c=>c.kind===3).length,active:cells.filter(c=>c.kind===3&&c.activation>0).length,suppressive:cells.filter(c=>c.immunePhenotype==='suppressive').length,clones:new Set(tumors.map(m=>m.geneClone)).size,stem:tumors.filter(c=>c.isStem).length,counters:{...s.counters},immunity:im.metrics,coverage:im.coverage,scenario:s.scenarioReport()});
  }
  run.elapsedMs=performance.now()-start;result.runs.push(run);console.log(JSON.stringify({scene,seed,elapsedMs:run.elapsedMs,trajectory:run.samples.map(r=>[r.time,r.normal,r.precancer,r.tumor,r.immune,r.counters.kills])}));
  await writeFile(`reports/immune-genetics/scenarios-${label}.json`,JSON.stringify(result,null,2));
}
