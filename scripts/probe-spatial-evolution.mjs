// Read-only per-cell observations. No spatial labels feed back into the model.
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const revision=arg('source-revision',''),hashes={};
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js']){
  const source=revision?execFileSync('git',['show',revision+':'+file],{encoding:'utf8',maxBuffer:8*1024*1024}):await readFile(file,'utf8');
  hashes[file]=createHash('sha256').update(source).digest('hex');vm.runInThisContext(source,{filename:file});
}
const wasm=await readFile('build/cpm-kernel.wasm'),module=await CellLabWasm.load(wasm);
hashes['build/cpm-kernel.wasm']=createHash('sha256').update(wasm).digest('hex');
const out=arg('out','output/spatial-evolution'),label=arg('label','baseline'),until=+arg('until','12000'),seeds=arg('seeds','17,31,77').split(',').map(Number);
await mkdir(out,{recursive:true});
const config={worldWidth:+arg('width','240'),worldHeight:+arg('height','180'),refinement:+arg('refinement','1.5'),boundary:'wrap',warmup:35,scene:arg('scene','oncogenesis'),settings:JSON.parse(arg('settings','{}'))};
const profile=JSON.parse(arg('profile','{}'));
Object.assign(CellLab.PRESETS[config.scene],profile);
const result={revision:CellLab.MODEL_REVISION,sourceRevision:revision,hashes,config,profile,until,runs:[]};
const mean=(rows,key)=>rows.length?rows.reduce((n,r)=>n+(r[key]||0),0)/rows.length:null;
for(const seed of seeds){
  const s=new CellLab.Simulation({...config,seed});await CellLabWasm.install(s,module);
  const run={seed,settings:{...s.settings},samples:[],events:[],integrity:null},started=performance.now();
  const log=s.log.bind(s);s.log=(type,id,target,detail={})=>{if(['malignant','divide','death-start','bloodstream-export'].includes(type))run.events.push({time:s.C.time,type,id,target,...detail});return log(type,id,target,detail);};
  const sample=()=>{
    const live=s.live().filter(m=>!m.dying),tumors=live.filter(m=>m.kind===2),ids=new Set(tumors.map(m=>m.id));
    const cells=tumors.map(m=>{
      const genes=s.immunity.genes(m),p=genes.peptides[0],edges=[...(s.contacts.get(m.id)?.values()||[])];
      const perimeter=edges.reduce((n,e)=>n+e.length,0),tumorContact=edges.filter(e=>ids.has(e.id)).reduce((n,e)=>n+e.length,0);
      return {id:m.id,birth:m.birth,clone:m.geneClone,antigenBranch:s.immunity.clones.get(m.geneClone).antigenBranch,generation:m.generation,x:m.x/s.scale,y:m.y/s.scale,transformedAt:m.transformedAt,...genes.traits,repair:m.repairTrait,peptide:p.sequence,present:p.present,channel:p.channel,expression:m.expression.peptides[0],presentation:m.expression.presentation[p.channel],antigenLevel:m.antigenLevel,oxygen:m.oxygen,glucose:m.glucose,acid:m.acid,stress:m.stress,fitness:m.fitness,adversity:m.adversity,energy:m.resources.energy,precursor:m.resources.precursor,phase:m.cycle.phase,arrest:m.cycle.arrest,target:m.target/(s.scale*s.scale),area:s.C.getVolume(m.id)/(s.scale*s.scale),tumorContact:perimeter?tumorContact/perimeter:0,immuneContact:edges.filter(e=>s.cells[e.id]?.kind===3).reduce((n,e)=>n+e.length,0)/s.scale};
    });
    const row={time:s.C.time,tumor:cells.length,normal:live.filter(m=>m.kind===1&&!m.vesselID).length,immune:live.filter(m=>m.kind===3).length,counters:{...s.counters},tumorDivisions:s.scenarioReport().tumorDivisions,clones:new Set(cells.map(m=>m.clone)).size,antigenBranches:new Set(cells.map(m=>m.antigenBranch)).size,mean:Object.fromEntries(['tolerance','proliferation','invasion','repair','antigenLevel','oxygen','glucose','acid','stress','energy'].map(k=>[k,mean(cells,k)])),arrests:Object.fromEntries([...new Set(cells.map(m=>m.arrest))].map(k=>[k,cells.filter(m=>m.arrest===k).length])),vascular:s.vascular.report(),cells};
    run.samples.push(row);
    console.log(JSON.stringify({label,seed,...Object.fromEntries(['time','tumor','tumorDivisions','clones','antigenBranches','mean','arrests'].map(k=>[k,row[k]]))}));
  };
  sample();for(let t=1000;t<=until;t+=1000){s.advance(t-s.C.time);sample();}
  run.integrity={disconnected:s.live().filter(m=>s.components(m.id).length!==1).map(m=>({id:m.id,kind:m.kind,dying:m.dying,cause:m.deathCause})),connected:s.live().filter(m=>!m.dying).every(m=>s.components(m.id).length===1),nuclei:s.live().filter(m=>!m.dying).every(m=>s.section.fits(m,m.nucleusX,m.nucleusY))};
  run.elapsedMs=performance.now()-started;result.runs.push(run);await writeFile(`${out}/${label}.json`,JSON.stringify(result,null,2)+'\n');
}
