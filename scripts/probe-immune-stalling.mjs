import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const out='output/immune-stalling';await mkdir(out,{recursive:true});
const seed=Number(args.seed||17),steps=Number(args.steps||10000),refinement=Number(args.refinement||1.5),window=Number(args.window||250);
const settings={growth:1.65,tumorMotility:.35,immuneMotility:1.5,apoptosis:7,antigen:95};
const s=new CellLab.Simulation({scene:'hot',seed,refinement,settings});await CellLabWasm.install(s,module);
const mean=arr=>arr.reduce((n,v)=>n+v,0)/(arr.length||1),median=arr=>arr.length?arr.sort((a,b)=>a-b)[Math.floor(arr.length/2)]:0;
function row(m){return {id:m.id,birth:m.birth,kind:m.kind,x:m.x/s.scale,y:m.y/s.scale,nx:m.nucleusX/s.scale,ny:m.nucleusY/s.scale,phase:m.phase,targetID:m.targetID,activation:m.activation,fitness:m.fitness,stress:m.stress,oxygen:m.oxygen,glucose:m.glucose,acid:m.acid,area:s.C.getVolume(m.id)/s.scale**2,target:m.target/s.scale**2,fraction:m.sectionFraction,pressure:m.sectionPressure,drive:m.drive,activity:m.activity,hasNucleus:m.hasNucleus};}
const frames=[];
for(let at=0;at<steps;at+=window){
  const before=new Map(s.live().filter(m=>!m.dying).map(m=>[m.birth,row(m)]));s.advance(Math.min(window,steps-at));
  const cells=s.live().filter(m=>!m.dying).map(m=>{const r=row(m),a=before.get(m.birth);return {...r,displacement:a?Math.hypot(r.x-a.x,r.y-a.y):null,nuclearDisplacement:a?Math.hypot(r.nx-a.nx,r.ny-a.ny):null};});
  const metrics={time:s.C.time,coverage:1-s.positions.reduce((n,i)=>n+(s.C.grid._pixels[i]===0),0)/s.positions.length,counters:{...s.counters}};
  for(const [kind,name] of [[1,'normal'],[2,'tumor'],[3,'immune']]){const c=cells.filter(c=>c.kind===kind),moving=c.filter(c=>c.displacement!==null);metrics[name]={n:c.length,fitness:mean(c.map(m=>m.fitness)),drive:mean(c.map(m=>m.drive)),move:median(moving.map(m=>m.displacement)),immobile:moving.filter(m=>m.nuclearDisplacement===0).length,search:c.filter(m=>m.phase==='search').length,scan:c.filter(m=>m.phase==='scan').length,kill:c.filter(m=>m.phase==='kill').length};}
  frames.push({metrics,cells});console.log(JSON.stringify(metrics));
}
const result={settings:s.settings,seed,refinement,window,modelSHA256:createHash('sha256').update(await readFile('src/model.js')).digest('hex'),frames};
await writeFile(`${out}/${args.tag||'baseline'}-${seed}-${refinement}.json`,JSON.stringify(result,null,2));
// Measure admissible local changes without altering the grid or consuming RNG.
const diagnostics=[];
for(const m of s.live().filter(m=>m.kind===3&&!m.dying)){
  const d={...row(m),attempts:0,nucleus:0,minArea:0,reach:0,shape:0,topology:0,allowed:0,sumAcceptance:0};
  for(const tgt of s.C.borderpixels.elements)for(const src of s.neighbors[tgt]){
    const a=s.C.pixti(src),b=s.C.pixti(tgt);if(a===b||(a!==m.id&&b!==m.id))continue;const source=s.cells[a],target=s.cells[b];if(s.C.cellKind(a)===4||s.C.cellKind(b)===4)continue;d.attempts++;
    if(target&&!target.dying&&s.C.getVolume(b)<=target.minVisibleArea){d.minArea++;continue;}
    if(target&&!target.dying&&target.hasNucleus&&s.section.distance2(s.xs[tgt],s.ys[tgt],target)<=target.nucleusRadius**2){d.nucleus++;continue;}
    if(source&&!source.dying&&source.hasNucleus&&s.section.distance2(s.xs[tgt],s.ys[tgt],source)>source.maxReach**2){d.reach++;continue;}
    if(!s.section.allowed(src,tgt,a,b)){d.shape++;continue;}
    if(!s.topology.fulfilled(src,tgt,a,b)){d.topology++;continue;}
    d.allowed++;d.sumAcceptance+=Math.min(1,Math.exp(-s.C.deltaH(src,tgt,a,b)/s.C.conf.T));
  }
  diagnostics.push(d);
}
await writeFile(`${out}/${args.tag||'baseline'}-${seed}-${refinement}-constraints.json`,JSON.stringify(diagnostics,null,2));
