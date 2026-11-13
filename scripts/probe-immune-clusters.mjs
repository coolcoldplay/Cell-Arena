// Observe nuclear motion and membrane turnover without changing simulation RNG.
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const revision=arg('revision',''),out=arg('out','output/immune-clusters'),label=arg('label','current'),until=+arg('steps','6000'),hashes={};
const load=file=>revision?execFileSync('git',['show',revision+':'+file],{maxBuffer:8*1024*1024}):readFile(file);
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js']){const b=await load(file);hashes[file]=createHash('sha256').update(b).digest('hex');vm.runInThisContext(b.toString(),{filename:file});}
const wasm=await load('build/cpm-kernel.wasm'),module=await CellLabWasm.load(wasm);hashes['build/cpm-kernel.wasm']=createHash('sha256').update(wasm).digest('hex');
const config={scene:arg('scene','hot'),worldWidth:+arg('width','320'),worldHeight:+arg('height','240'),refinement:+arg('refinement','1.5'),boundary:'wrap',warmup:35,settings:JSON.parse(arg('settings','{}'))};
await mkdir(out,{recursive:true});
const median=values=>values.length?values.sort((a,b)=>a-b)[Math.floor(values.length/2)]:null;
for(const seed of arg('seeds','17,31,77').split(',').map(Number)){
 const s=new CellLab.Simulation({...config,seed});await CellLabWasm.install(s,module);const frames=[],began=performance.now();
 const immune=()=>s.live().filter(m=>m.kind===3&&!m.dying),delta=(v,size)=>s.section.delta(v,size)/s.scale;
 for(let t=0;t<until;t+=250){
  const before=s.C.grid._pixels.slice(),tracks=new Map(immune().map(m=>[m.birth,{id:m.id,birth:m.birth,x:m.nucleusX,y:m.nucleusY,ox:m.nucleusX,oy:m.nucleusY,path:0,span:0,searchTime:0,healthyTime:0,turnover:0}]));
  const duration=Math.min(250,until-t);
  for(let step=0;step<duration;step+=10){const dt=Math.min(10,duration-step);s.advance(dt);for(const m of immune()){const p=tracks.get(m.birth);if(!p)continue;p.path+=Math.hypot(delta(m.nucleusX-p.x,s.width),delta(m.nucleusY-p.y,s.height));p.span=Math.max(p.span,Math.hypot(delta(m.nucleusX-p.ox,s.width),delta(m.nucleusY-p.oy,s.height)));p.x=m.nucleusX;p.y=m.nucleusY;if(m.phase==='search'&&!m.targetID)p.searchTime+=dt;if(m.fitness>.5)p.healthyTime+=dt;}}
  const living=new Map(immune().map(m=>[m.id,m]));for(const i of s.positions)if(before[i]!==s.C.grid._pixels[i])for(const id of [before[i],s.C.grid._pixels[i]]){const m=living.get(id),p=m&&tracks.get(m.birth);if(p&&p.id===id)p.turnover++;}
  const cells=immune().map(m=>{const p=tracks.get(m.birth),edges=[...(s.contacts.get(m.id)?.values()||[])],perimeter=edges.reduce((n,e)=>n+e.length,0),peer=edges.filter(e=>s.cells[e.id]?.kind===3).reduce((n,e)=>n+e.length,0);return {id:m.id,birth:m.birth,x:m.x/s.scale,y:m.y/s.scale,phase:m.phase,targetID:m.targetID,cycle:m.cycle.phase,arrest:m.cycle.arrest,fitness:m.fitness,activation:m.activation,exhaustion:m.exhaustion,energy:m.resources.energy,pressure:m.sectionPressure,fraction:m.sectionFraction,area:s.C.getVolume(m.id)/s.scale**2,target:m.target/s.scale**2,minArea:m.minVisibleArea/s.scale**2,drive:m.drive,activity:m.activity,cue:m.immuneCue,peerFraction:peer/Math.max(1,perimeter),peerNeighbors:edges.filter(e=>s.cells[e.id]?.kind===3).length,trail:s.fieldOnCell(m,'trail'),danger:s.fieldOnCell(m,'danger'),...(p?{path:p.path,span:p.span,searchTime:p.searchTime,healthyTime:p.healthyTime,turnover:p.turnover/s.scale**2}:{})};});
  const eligible=cells.filter(c=>c.searchTime>=duration*.8&&c.healthyTime>=duration*.8),frozen=eligible.filter(c=>c.path===0),stalled=eligible.filter(c=>c.span<1),summary={time:s.C.time,tumor:s.live().filter(m=>m.kind===2&&!m.dying).length,immune:cells.length,kills:s.counters.kills,immuneDivisions:s.counters.immuneDivisions,eligible:eligible.length,frozen:frozen.length,stalled:stalled.length,medianSpan:median(eligible.map(c=>c.span)),medianPath:median(eligible.map(c=>c.path)),frozenIds:frozen.map(c=>c.id)};
  frames.push({summary,cells});if(s.C.time%1000===35)console.log(JSON.stringify({label,seed,...summary}));
 }
 const result={revision:CellLab.MODEL_REVISION,sourceRevision:revision||'working-tree',hashes,config:{...config,seed},settings:s.settings,window:250,motionSample:10,elapsedMs:performance.now()-began,frames,valid:s.live().filter(m=>!m.dying).every(m=>s.components(m.id).length===1&&s.section.fits(m,m.nucleusX,m.nucleusY)),population:s.populationRow()};
 await writeFile(`${out}/${label}-${seed}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({label,seed,valid:result.valid,elapsedMs:result.elapsedMs}));
}
