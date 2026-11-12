import {ParallelCPM,exportSimulation,stats} from './backend.js';
import {ResidentReference} from './resident-reference.js';
import {makeRenderer} from './render.js';
export {ParallelCPM,exportSimulation,stats};
let wasm;
export async function makeSimulation(config={}){
  wasm??=await CellLabWasm.load(await(await fetch('/build/cpm-kernel.wasm')).arrayBuffer());
  const s=new CellLab.Simulation({worldWidth:256,worldHeight:192,refinement:1.5,scene:'hot',seed:17,boundary:'wrap',warmup:0,pixelIndex:true,...config});
  await CellLabWasm.install(s,wasm);return s;
}
export async function smoke(){
  const s=await makeSimulation();s.advance(8);const f=exportSimulation(s),gpu=await ParallelCPM.create(f);
  const before=await gpu.snapshot(),timing=await gpu.step(),after=await gpu.snapshot();
  const report={adapter:gpu.adapterInfo,cells:s.live().length,width:s.width,height:s.height,allocatedBytes:gpu.allocatedBytes,timing:{...timing,copies:timing.copies?.length},changed:after.grid.reduce((n,v,i)=>n+(v!==before.grid[i]),0),errors:gpu.errors};
  gpu.destroy();return report;
}
export function checkState(f,snapshot,{nuclei=true}={}){
  const {width:w,height:h,wrap,cellCapacity:cap}=f,n=w*h,g=snapshot.grid;
  const volumes=new Int32Array(cap),perimeters=new Int32Array(cap),seen=new Uint8Array(n),queue=new Uint32Array(n),components=new Uint16Array(cap),errors=[];
  const at=(x,y)=>wrap?((y+h)%h)*w+(x+w)%w:(x<0||y<0||x>=w||y>=h?-1:y*w+x);
  let walls=0,nuclearLosses=0;
  for(let i=0;i<n;i++){
    const id=g[i],x=i%w,y=Math.floor(i/w);volumes[id]++;
    if(f.cells[f.grid[i]*32+1]===4&&id!==f.grid[i])walls++;
    if(id)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const j=at(x+dx,y+dy);if(j>=0&&g[j]!==id)perimeters[id]++;}
    if(!id||seen[i])continue;components[id]++;let head=0,tail=1;queue[0]=i;seen[i]=1;
    while(head<tail){const j=queue[head++],xx=j%w,yy=Math.floor(j/w);for(const [dx,dy]of [[0,1],[1,0],[0,-1],[-1,0]]){const k=at(xx+dx,yy+dy);if(k>=0&&g[k]===id&&!seen[k]){seen[k]=1;queue[tail++]=k;}}}
  }
  let disconnected=0,minAreaViolations=0,volumeMismatches=0,perimeterMismatches=0;
  for(let id=1;id<cap;id++){
    const p=id*32,live=f.cells[p]!==0,dying=f.cells[p+2]!==0;
    if(volumes[id]!==snapshot.state[id*2])volumeMismatches++;
    if(volumes[id]&&perimeters[id]!==snapshot.state[id*2+1])perimeterMismatches++;
    if(live&&!dying){if(components[id]>1)disconnected++;if(f.state[id*2]>0&&volumes[id]<Math.floor(f.cells[p+21]))minAreaViolations++;}
    if(nuclei&&live&&!dying&&f.cells[p+15]){
      const nx=f.cells[p+16],ny=f.cells[p+17],r=f.cells[p+18];
      for(let y=Math.floor(ny-r);y<=Math.ceil(ny+r);y++)for(let x=Math.floor(nx-r);x<=Math.ceil(nx+r);x++)if((x-nx)**2+(y-ny)**2<=r*r){const i=at(x,y);if(i>=0&&f.grid[i]===id&&g[i]!==id)nuclearLosses++;}
    }
  }
  const result={volumeMismatches,perimeterMismatches,disconnected,minAreaViolations,nuclearLosses,walls};
  for(const [key,value]of Object.entries(result))if(value)errors.push(`${key}: ${value}`);
  return {...result,ok:!errors.length,errors};
}
export async function validateFrozen(config={},count=4096,{tile=4,batch=4,scheduler='dense'}={}){
  const s=await makeSimulation(config);s.advance(24);const f=exportSimulation(s),gpu=await ParallelCPM.create(f,{tile,batch,scheduler,seed:s.seedValue});
  const pairs=[],expected=[];let x=39193;const rand=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
  const border=s.C.borderpixels.elements;
  for(let q=0;q<count;q++){
    const tgt=border[rand()%border.length],neighbors=s.neighbors[tgt],src=neighbors[rand()%neighbors.length],a=s.C.pixti(src),b=s.C.pixti(tgt),ps=s.C.grid.i2p(src),pt=s.C.grid.i2p(tgt);
    pairs.push(ps[1]*s.width+ps[0],pt[1]*s.width+pt[0]);
    expected.push([s.wasm.e.energy(src,tgt,a,b),s.section.allowed(src,tgt,a,b)?1:0,s.topology.fulfilled(src,tgt,a,b)?1:0,s.vascular.allowed(src,tgt,a,b)?1:0]);
  }
  const values=await gpu.probe(pairs);let energyFailures=0,maxAbsoluteError=0,maxRelativeError=0,hardFailures=[0,0,0];const examples=[];
  for(let q=0;q<count;q++){
    const want=expected[q][0],got=values.f32[q*4],error=Math.abs(want-got);maxAbsoluteError=Math.max(maxAbsoluteError,error);maxRelativeError=Math.max(maxRelativeError,error/Math.max(1,Math.abs(want)));
    if(!Number.isFinite(got)||error>.05+1e-5*Math.abs(want)){energyFailures++;if(examples.length<5)examples.push({q,want,got});}
    for(let k=1;k<4;k++)if(expected[q][k]!==values.u32[q*4+k]){hardFailures[k-1]++;if(examples.length<5)examples.push({q,k,want:expected[q][k],got:values.u32[q*4+k]});}
  }
  const baseline=checkState(f,await gpu.snapshot());const timing=[];for(let k=0;k<12;k++)timing.push(await gpu.step({readLog:false}));const after=checkState(f,await gpu.snapshot());
  const result={config,count,tile,batch,scheduler,energyTolerance:'abs <= 0.05 + 1e-5 * abs(reference)',energyFailures,maxAbsoluteError,maxRelativeError,hardFailures,examples,baseline,after,accepted:timing.reduce((n,t)=>n+t.accepted,0),bfs:timing.reduce((n,t)=>n+t.bfs,0),ok:energyFailures===0&&hardFailures.every(x=>x===0)&&baseline.ok&&after.ok};gpu.destroy();return result;
}
export async function microBenchmark({batches=[1,4,16,64],tile=8,scheduler='dense',steps=24,config={}}={}){
  const s=await makeSimulation(config);s.advance(32);const f=exportSimulation(s),rows=[];
  for(const batch of batches){const gpu=await ParallelCPM.create(f,{tile,batch,scheduler,seed:s.seedValue,log:false});for(let i=0;i<6;i++)await gpu.step({readLog:false});
    const times=[];for(let i=0;i<steps;i++)times.push(await gpu.step({readLog:false}));
    rows.push({tile,batch,scheduler,phases:gpu.phaseCount,cells:s.live().length,lattice:[s.width,s.height],wall:stats(times.map(t=>t.wallMs)),gpu:stats(times.map(t=>t.gpuMs)),accepted:stats(times.map(t=>t.accepted)),bfs:stats(times.map(t=>t.bfs)),invariants:checkState(f,await gpu.snapshot()),bytes:gpu.allocatedBytes});gpu.destroy();}
  return rows;
}
export async function hybridStep(s,gpu,fixture,{verify=false,biology=true}={}){
  const start=performance.now();exportSimulation(s,fixture);gpu.upload(fixture);const packed=performance.now();
  if(s.patrol.needsSeed){for(const i of s.positions){const m=s.cells[s.C.pixti(i)];if(m?.kind===3&&!m.dying)s.patrol.visited[i]=1;}s.patrol.needsSeed=false;}
  const result=await gpu.step(),computed=performance.now();s.trackPatrol=true;
  try{for(let k=0;k<(result.copies?.length||0);k+=2){const q=result.copies[k],i=((q%s.width)<<s.C.grid.Y_BITS)+Math.floor(q/s.width);s.C.setpixi(i,result.copies[k+1]);}}
  finally{s.trackPatrol=false;}
  s.C.time++;s.C.stat_values={};for(const listener of s.C.post_mcs_listeners)listener();
  const replayed=performance.now();let validation;
  if(verify){const snap=await gpu.snapshot();validation=checkState(fixture,snap);let mismatches=0,activityMismatches=0;for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const q=y*s.width+x,i=(x<<s.C.grid.Y_BITS)+y;if(s.C.pixti(i)!==snap.grid[q])mismatches++;if(s.act.cellpixelsact[i]!==snap.activity[q])activityMismatches++;}validation.replayMismatches=mismatches;validation.activityMismatches=activityMismatches;validation.ok&&=mismatches===0&&activityMismatches===0;if(!validation.ok)throw Error('Hybrid state mismatch: '+JSON.stringify(validation));}
  s.cleanup();s.refreshPositions();s.scanContacts();if(s.section)s.section.update(1);s.vascular.tick(1);
  if(biology){if(s.C.time%4===0)s.updateEnvironment(4);s.biologicalStep();}
  return {wallMs:performance.now()-start,packingMs:packed-start,computeReadbackMs:computed-packed,replayMs:replayed-computed,biologyMs:performance.now()-replayed,gpuMs:result.gpuMs,accepted:result.accepted,deferred:result.deferred,bfs:result.bfs,validation};
}
export function biologyMetrics(s,initial){
  const live=s.live(),groups={};
  for(const kind of [1,2,3]){const group=live.filter(m=>m.kind===kind&&!m.dying),areas=[],perimeters=[],displacements=[];
    for(const m of group){areas.push(s.C.getVolume(m.id));perimeters.push(s.C.getConstraint('PerimeterConstraint').cellperimeters[m.id]||0);const p=initial.get(m.id);if(p){let dx=m.x-p[0],dy=m.y-p[1];if(s.wrap){if(dx>s.width/2)dx-=s.width;if(dx< -s.width/2)dx+=s.width;if(dy>s.height/2)dy-=s.height;if(dy< -s.height/2)dy+=s.height;}displacements.push(dx*dx+dy*dy);}}
    const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;groups[kind]={count:group.length,area:avg(areas),perimeter:avg(perimeters),msd:avg(displacements)};
  }
  return {time:s.C.time,cells:live.length,groups,counters:{...s.counters},contactLength:[...s.contacts.values()].reduce((sum,map)=>sum+[...map.values()].reduce((n,c)=>n+c.length,0),0),vascular:s.vascular.report().meanPerfusion};
}
export async function compareFull({seeds=[17,29,77],steps=240,warmup=24,batch=4,tile=4,scheduler='dense',config={}}={}){
  const rows=[];
  for(const seed of seeds){
    const baseline=await makeSimulation({...config,seed}),candidate=await makeSimulation({...config,seed});baseline.advance(warmup);candidate.advance(warmup);
    const initial=new Map(baseline.live().map(m=>[m.id,[m.x,m.y]])),f=exportSimulation(candidate),gpu=await ParallelCPM.create(f,{batch,tile,scheduler,seed});
    const baselineTimes=[],candidateTimes=[],series=[];
    for(let step=0;step<steps;step++){
      const cpu=()=>{const start=performance.now();baseline.mechanicalStep();const after=performance.now();if(baseline.C.time%4===0)baseline.updateEnvironment(4);baseline.biologicalStep();baselineTimes.push({wallMs:performance.now()-start,mechanicalMs:after-start});};
      if(step%2===0){cpu();candidateTimes.push(await hybridStep(candidate,gpu,f,{verify:step===0||step===steps-1}));}
      else{candidateTimes.push(await hybridStep(candidate,gpu,f,{verify:step===steps-1}));cpu();}
      if((step+1)%60===0||step===steps-1)series.push({baseline:biologyMetrics(baseline,initial),candidate:biologyMetrics(candidate,initial)});
      if(globalThis.job)globalThis.job.progress={kind:'full',seed,batch,step:step+1,steps};
    }
    const summarize=times=>Object.fromEntries(['wallMs','mechanicalMs','packingMs','computeReadbackMs','replayMs','biologyMs','gpuMs','accepted','deferred','bfs'].filter(k=>times[0][k]!==undefined).map(k=>[k,stats(times.map(t=>t[k]))]));
    // Exclude invariant-audit readbacks from timing; do not report audit cost as backend cost.
    const filtered=candidateTimes.filter(t=>!t.validation),base=summarize(baselineTimes.slice(1,-1)),cand=summarize(filtered);
    rows.push({seed,batch,tile,scheduler,steps,warmup,config,lattice:[candidate.width,candidate.height],adapter:gpu.adapterInfo,baseline:base,candidate:cand,speedup:base.wallMs.mean/cand.wallMs.mean,invariantAudits:candidateTimes.filter(t=>t.validation).map(t=>t.validation),series,raw:{baseline:baselineTimes,candidate:candidateTimes}});gpu.destroy();
  }
  return rows;
}
// Lift a periodic tissue onto a larger periodic lattice. A cell that crosses
// the source seam belongs to its nearest nucleus replica, not the tile where
// its pixel happens to land. This preserves whole cells, areas and perimeters.
export function repeatTissue(f,copiesX,copiesY){
  if(!f.wrap)throw Error('Tissue replication requires a periodic source');
  if(f.data[31])throw Error('This capacity fixture does not replicate junction hashes');
  const ids=[];for(let id=1;id<f.cellCapacity;id++)if(f.state[id*2]>0)ids.push(id);
  const count=ids.length,cap=count*copiesX*copiesY+1;if(cap>65536)throw Error('Cell IDs exceed original 16-bit range');
  const compact=new Int32Array(f.cellCapacity).fill(-1);ids.forEach((id,i)=>compact[id]=i);
  const w=f.width*copiesX,h=f.height*copiesY,n=w*h,grid=new Uint32Array(n*2),activity=new Uint32Array(n),cells=new Float32Array(cap*32),state=new Int32Array(cap*2),data=f.data.slice();
  const vesselIDs=[];for(let id=1;id<=64;id++)if(f.data[320+id*8])vesselIDs.push(id);
  const vessels=vesselIDs.length;if(vessels*copiesX*copiesY>64)throw Error('Vessel replication exceeds original 64-vessel range');
  const vesselCompact=new Int32Array(65);vesselIDs.forEach((id,i)=>vesselCompact[id]=i+1);data.fill(0,320,840);
  const tile=(x,y)=>((y+copiesY)%copiesY)*copiesX+(x+copiesX)%copiesX;
  const closest=(x,y,nx,ny,tx,ty)=>tile(tx+(x-nx>f.width/2?1:x-nx< -f.width/2?-1:0),ty+(y-ny>f.height/2?1:y-ny< -f.height/2?-1:0));
  for(let ty=0;ty<copiesY;ty++)for(let tx=0;tx<copiesX;tx++){
    const t=tile(tx,ty);
    for(const old of vesselIDs){const id=t*vessels+vesselCompact[old],source=320+old*8,destination=320+id*8;data.set(f.data.subarray(source,source+8),destination);data[destination+1]+=tx*f.width;data[destination+2]+=ty*f.height;}
    for(let k=0;k<count;k++){
      const old=ids[k],id=t*count+k+1,a=old*32,b=id*32;cells.set(f.cells.subarray(a,a+32),b);cells[b+16]+=tx*f.width;cells[b+17]+=ty*f.height;state[id*2]=f.state[old*2];state[id*2+1]=f.state[old*2+1];
      const target=f.cells[a+13];if(target){const owner=closest(f.cells[a+16],f.cells[a+17],f.cells[target*32+16],f.cells[target*32+17],tx,ty);cells[b+13]=owner*count+compact[target]+1;}
      for(const field of [29,30]){const oldV=f.cells[a+field];if(oldV){const at=320+oldV*8,owner=closest(f.cells[a+16],f.cells[a+17],f.data[at+1],f.data[at+2],tx,ty);cells[b+field]=owner*vessels+vesselCompact[oldV];}}
    }
    for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){
      const p=y*f.width+x,q=(ty*f.height+y)*w+tx*f.width+x,old=f.grid[p];
      if(old){const owner=closest(x,y,f.cells[old*32+16],f.cells[old*32+17],tx,ty);grid[q]=owner*count+compact[old]+1;}
      activity[q]=f.activity[p];const oldV=f.grid[f.width*f.height+p];if(oldV){const at=320+oldV*8,owner=closest(x,y,f.data[at+1],f.data[at+2],tx,ty);grid[n+q]=owner*vessels+vesselCompact[oldV];}
    }
  }
  return {width:w,height:h,wrap:true,section:f.section,cellCapacity:cap,grid,activity,cells,state,data,sourceCells:count,cellsCount:cap-1,replicas:[copiesX,copiesY]};
}
export async function capacityBenchmark({steps=24,warmup=6,tile=4,batch=4,scheduler='dense',replicas=[[1,1],[2,2],[4,3]]}={}){
  const s=await makeSimulation({worldWidth:512,worldHeight:384,refinement:2,seed:17});s.advance(32);const source=exportSimulation(s),rows=[];
  for(const [rx,ry]of replicas){
    if(globalThis.job)globalThis.job.progress={kind:'capacity',replicas:[rx,ry],stage:'fixture'};
    const f=repeatTissue(source,rx,ry),initial=checkState(f,{grid:f.grid.subarray(0,f.width*f.height),state:f.state});if(!initial.ok)throw Error('Replicated tissue invariant failure: '+JSON.stringify(initial));
    const gpu=await ParallelCPM.create(f,{tile,batch,scheduler,seed:17,log:false}),cpu=rx===1&&ry===1?await ResidentReference.create(f):null;
    for(let i=0;i<warmup;i++){await gpu.step({readLog:false});cpu?.step();}
    const times=[],cpuTimes=[];for(let i=0;i<steps;i++){
      if(i%2===0){if(cpu)cpuTimes.push(cpu.step());times.push(await gpu.step({readLog:false}));}else{times.push(await gpu.step({readLog:false}));if(cpu)cpuTimes.push(cpu.step());}
      if(globalThis.job)globalThis.job.progress={kind:'capacity',replicas:[rx,ry],step:i+1,steps};
    }
    const after=checkState(f,await gpu.snapshot());const summarize=ts=>Object.fromEntries(['wallMs','gpuMs','kernelMs','accepted','bfs'].filter(k=>ts[0]?.[k]!==undefined).map(k=>[k,stats(ts.map(t=>t[k]))]));
    rows.push({cells:f.cellsCount,lattice:[f.width,f.height],sites:f.width*f.height,occupiedPixels:f.state.reduce((n,v,i)=>n+(i%2===0?v:0),0),replicas:[rx,ry],tile,batch,scheduler,steps,warmup,allocatedBytes:gpu.allocatedBytes,adapter:gpu.adapterInfo,gpu:summarize(times),cpu:cpu?summarize(cpuTimes):null,cpuUnavailable:cpu?null:'Original WASM raw-site capacity exceeded; no extrapolated CPU speed is reported',initial,after,cpuAfter:cpu?checkState(f,cpu.snapshot()):null,raw:{gpu:times,cpu:cpuTimes}});gpu.destroy();
  }
  return rows;
}
export async function targetedChecks({scheduler='dense',batch=4}={}){
  const results=[];
  const create=()=>makeSimulation({width:128,height:96,refinement:1,scene:'empty',vessels:[],warmup:0,settings:{growth:0,apoptosis:0,metabolism:0,immuneGrowth:0}});
  const fill=(s,points,kind=2)=>{const id=s.C.makeNewCellID(kind);for(const p of points)s.C.setpix(p,id);const m=s.cells[id];m.target=s.C.getVolume(id);m.base=m.target;s.refreshPositions();s.section.initialize(m,points.map(p=>s.C.grid.p2i(p)));s.updateMechanics(m);return id;};
  const rect=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>[x+i%w,y+Math.floor(i/w)]);
  for(const name of ['remote-path','bridge-cut','nucleus-and-wall']){
    const s=await create();let src,tgt,want,field;
    if(name==='remote-path'){
      const points=[];for(let x=20;x<=40;x++){points.push([x,20],[x,40]);}for(let y=21;y<40;y++)points.push([20,y],[40,y]);
      const id=fill(s,points);s.cells[id].hasNucleus=false;s.cells[id].minVisibleArea=1;src=[30,19];tgt=[30,20];want=1;field=2;
    }else if(name==='bridge-cut'){
      const id=fill(s,[...rect(20,20,5,5),...rect(35,20,5,5),...Array.from({length:10},(_,i)=>[25+i,22])]);s.cells[id].hasNucleus=false;s.cells[id].minVisibleArea=1;src=[30,21];tgt=[30,22];want=0;field=2;
    }else{
      const id=fill(s,rect(20,20,12,12),3),m=s.cells[id];s.paint(90,48,5);src=[19,20];tgt=[Math.round(m.nucleusX),Math.round(m.nucleusY)];want=0;field=1;
    }
    const f=exportSimulation(s),gpu=await ParallelCPM.create(f,{scheduler,batch,tile:4}),p=await gpu.probe([src[1]*s.width+src[0],tgt[1]*s.width+tgt[0]]);
    const row={name,got:p.u32[field],expected:want,ok:p.u32[field]===want};
    if(name==='nucleus-and-wall'){for(let i=0;i<12;i++)await gpu.step({readLog:false});row.invariants=checkState(f,await gpu.snapshot());row.ok&&=row.invariants.ok;}
    gpu.destroy();results.push(row);
  }
  const s=await create(),id=fill(s,rect(25,25,18,12)),m=s.cells[id];m.sectionFraction=.72;m.target=300;s.updateMechanics(m);const target=m.target,hidden=m.offPlaneTarget,child=s.divide(id);
  const division={name:'division conservation then GPU replay',child,ok:!!child&&m.target+s.cells[child].target===target&&Math.abs(m.offPlaneTarget+s.cells[child].offPlaneTarget-hidden)<1e-10};
  if(child){const f=exportSimulation(s),gpu=await ParallelCPM.create(f,{scheduler,batch,tile:4});await hybridStep(s,gpu,f,{verify:true});s.eraseCell(child,{manual:true});await hybridStep(s,gpu,f,{verify:true});division.erasedPixels=s.C.getVolume(child)||0;division.ok&&=division.erasedPixels===0;gpu.destroy();}results.push(division);
  return {scheduler,batch,results,ok:results.every(r=>r.ok)};
}
export async function motilityAssay({seeds=[17,29,77],steps=600,scheduler='dense',batch=4}={}){
  const rows=[];
  for(const seed of seeds){
    const options={width:384,height:288,refinement:1.5,scene:'empty',vessels:[],seed,warmup:0,settings:{growth:0,apoptosis:0,metabolism:0,immuneGrowth:0,recruitment:0}},models=[await makeSimulation(options),await makeSimulation(options)];
    for(const s of models){for(const [x,y]of [[80,70],[270,70],[80,210],[270,210]])s.seed(3,x,y,7.5);s.refreshPositions();}
    const initialIDs=models[0].live().map(m=>m.id),trajectories=models.map(s=>Object.fromEntries(initialIDs.map(id=>[id,[[s.cells[id].x,s.cells[id].y]]]))),f=exportSimulation(models[1]),gpu=await ParallelCPM.create(f,{scheduler,batch,tile:4,seed});
    for(let step=0;step<steps;step++){
      // Component assay: no external direction, division, death or fields;
      // Act, volume, perimeter, topology, nuclei and section updates remain.
      for(const s of models)for(const m of s.live())m.drive=0;
      models[0].mechanicalStep();await hybridStep(models[1],gpu,f,{biology:false});
      if((step+1)%4===0)for(let index=0;index<2;index++)for(const id of initialIDs){const s=models[index],a=trajectories[index][id],previous=a.at(-1),m=s.cells[id];let dx=m.x-((previous[0]%s.width+s.width)%s.width),dy=m.y-((previous[1]%s.height+s.height)%s.height);if(dx>s.width/2)dx-=s.width;if(dx< -s.width/2)dx+=s.width;if(dy>s.height/2)dy-=s.height;if(dy< -s.height/2)dy+=s.height;a.push([previous[0]+dx,previous[1]+dy]);}
      if(globalThis.job)globalThis.job.progress={kind:'motility',seed,scheduler,batch,step:step+1,steps};
    }
    const summarize=tracks=>{
      const points=Object.values(tracks),msd={};for(const lag of [1,5,25,75]){let sum=0,n=0;for(const a of points)for(let i=0;i+lag<a.length;i++){sum+=(a[i+lag][0]-a[i][0])**2+(a[i+lag][1]-a[i][1])**2;n++;}msd[lag*4]=sum/n;}
      const velocities=points.map(a=>a.slice(1).map((p,i)=>[p[0]-a[i][0],p[1]-a[i][1]])),correlations={};
      for(const lag of [1,5]){let dot=0,normA=0,normB=0;for(const v of velocities)for(let i=0;i+lag<v.length;i++){const a=v[i],b=v[i+lag];dot+=a[0]*b[0]+a[1]*b[1];normA+=a[0]**2+a[1]**2;normB+=b[0]**2+b[1]**2;}correlations[lag*4]=dot/Math.sqrt(normA*normB);}
      return {msd,velocityCorrelation:correlations};
    };
    rows.push({seed,steps,scheduler,batch,sampleEveryMCS:4,cells:initialIDs.length,baseline:summarize(trajectories[0]),candidate:summarize(trajectories[1]),trajectories});gpu.destroy();
  }
  return rows;
}
export async function manifest(){
  const files=['vendor/artistoo.js','src/model.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','build/cpm-kernel.wasm','experiments/parallel-cpm/kernel.wgsl','experiments/parallel-cpm/backend.js','experiments/parallel-cpm/harness.js','experiments/parallel-cpm/resident-reference.js','experiments/parallel-cpm/render.js','experiments/parallel-cpm/index.html'];
  const hashes={};for(const f of files){const b=await(await fetch('/'+f)).arrayBuffer();hashes[f]={bytes:b.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('')};}
  return {at:new Date().toISOString(),userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,files:hashes};
}
export async function profileStages(){
  const s=await makeSimulation({worldWidth:512,worldHeight:384,refinement:2,seed:17});s.advance(32);const source=exportSimulation(s),rows=[];
  for(const scheduler of ['dense','boundary'])for(const copies of [[1,1],[4,3]]){
    const f=repeatTissue(source,...copies),gpu=await ParallelCPM.create(f,{scheduler,batch:scheduler==='dense'?4:16,tile:4,log:false});for(let i=0;i<6;i++)await gpu.step({readLog:false});const times=[];for(let i=0;i<4;i++)times.push(await gpu.profileStep());rows.push({scheduler,cells:f.cellsCount,stages:times});gpu.destroy();
  }
  return rows;
}
export async function runSuite({onProgress=()=>{}}={}){
  const report={manifest:await manifest(),validation:[],targeted:[]};const progress=name=>{onProgress(name);document.querySelector('#status').textContent=name;};
  for(const scheduler of ['dense','boundary']){
    for(const config of [{scene:'hot'},{scene:'network'},{scene:'cold',boundary:'solid'}]){progress(`Checking ${scheduler}: ${config.scene}`);report.validation.push(await validateFrozen(config,4096,{scheduler,batch:scheduler==='dense'?4:16}));}
    report.targeted.push(await targetedChecks({scheduler,batch:scheduler==='dense'?4:16}));
  }
  progress('Full model, small tissue, 3 seeds');report.fullSmall=await compareFull({steps:360});
  progress('Full model, maximum original lattice, 3 seeds');report.fullMaximum=await compareFull({steps:360,config:{worldWidth:512,worldHeight:384,refinement:2}});
  progress('Capacity through 10,308 cells');report.capacity=await capacityBenchmark({steps:60,warmup:12});
  progress('Act-only component assay');report.motility=await motilityAssay();
  progress('GPU stage profile');report.profile=await profileStages();
  report.finishedAt=new Date().toISOString();window.lastReport=report;progress('Complete. Results available for download.');return report;
}
export async function demo({steps=120,replicas=[4,3]}={}){
  const status=document.querySelector('#status'),canvas=document.querySelector('#view');status.textContent='正在准备组织副本；像素分辨率保持不变。';
  const s=await makeSimulation({worldWidth:512,worldHeight:384,refinement:2,seed:17});s.advance(32);const f=repeatTissue(exportSimulation(s),...replicas),gpu=await ParallelCPM.create(f,{tile:4,batch:4,log:false});
  canvas.width=1600;canvas.height=Math.round(1600*f.height/f.width);const draw=await makeRenderer(gpu,canvas),times=[];
  try{for(let step=0;step<steps;step++){times.push(await gpu.step({readLog:false}));draw();status.textContent=`${f.cellsCount.toLocaleString()} 个细胞 · ${f.width} × ${f.height} 格点 · MCS ${step+1}/${steps}\n仅机械演示，生物学参数冻结。计算速率 ${(1000/stats(times.slice(-20).map(t=>t.wallMs)).mean).toFixed(1)} MCS/s（不是显示 FPS）。`;}
    await gpu.device.queue.onSubmittedWorkDone();return {cells:f.cellsCount,steps,lattice:[f.width,f.height],compute:stats(times.map(t=>t.wallMs)),visibility:document.visibilityState,focused:document.hasFocus(),note:'Visual inspection only; no claim about presented frame rate'};
  }finally{gpu.destroy();}
}
