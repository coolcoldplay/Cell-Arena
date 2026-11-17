import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import os from 'node:os';
import vm from 'node:vm';
import {MessageChannel,receiveMessageOnPort} from 'node:worker_threads';

const baseline='14b818034c94746b1a1db5a878ec620c2649b0d2';
const presets={maximum:[512,384,2],default:[240,180,1.5],small:[96,72,1]};
const [name='maximum',seedText='17',countText='96']=process.argv.slice(2);
const seed=Number(seedText),count=Number(countText),[worldWidth,worldHeight,refinement]=presets[name];
assert.ok(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(seed));
const config={worldWidth,worldHeight,refinement,seed,scene:'hot',boundary:'wrap'};
const fromBaseline=file=>execFileSync('git',['show',baseline+':'+file],{encoding:'utf8',maxBuffer:4*1024*1024});
const startup=process.argv.find(arg=>arg.startsWith('--startup='))?.slice(10);
if(startup){
  assert.ok(['before','after'].includes(startup)&&global.gc,'Use --expose-gc and --startup=before or --startup=after');
  const kernel=process.argv.includes('--js')?'fast':'wasm';
  for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])
    vm.runInThisContext(startup==='before'?fromBaseline(file):await readFile(file,'utf8'),{filename:file});
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
  global.gc();const start=performance.now(),sim=new CellLab.Simulation(config);
  if(kernel==='wasm')await CellLabWasm.install(sim,module);
  const startupMs=performance.now()-start;sim.advance(32);global.gc();
  const {rss,heapUsed,arrayBuffers}=process.memoryUsage(),steps=[];
  for(let i=0;i<count;i++){const t=performance.now();sim.advance(1);steps.push(performance.now()-t);}
  const sorted=steps.toSorted((a,b)=>a-b);
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const canonical=(_,v)=>{
    if(ArrayBuffer.isView(v))return [v.constructor.name,hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))];
    if(v instanceof Map)return {map:[...v]};if(v instanceof Set)return {set:[...v]};
    if(v&&typeof v==='object'&&!Array.isArray(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]]));
    return v===undefined?{undefined:true}:typeof v==='number'&&(Object.is(v,-0)||!Number.isFinite(v))?{number:Object.is(v,-0)?'-0':String(v)}:v;
  };
  const stateSHA256=hash(JSON.stringify({snapshot:sim.snapshot(),cells:sim.cells,contacts:sim.contacts,occupancy:sim.occupancy,lineage:sim.lineage,
    cpmRng:[sim.C.mt.mti,sim.C.mt.mt],immuneRng:[sim.immunity.rng.mti,sim.immunity.rng.mt],borders:sim.C.borderpixels.elements,
    degree:sim.C._neighbours,volumes:sim.C.cellvolume,act:sim.act.cellpixelsact},canonical));
  console.log(JSON.stringify({baseline,cpu:os.cpus()[0].model,node:process.version,name,seed,kernel,startup,count,startupMs,rss,heapUsed,arrayBuffers,
    cells:sim.live().length,time:sim.C.time,stateSHA256,mcsPerSecond:1000*count/steps.reduce((a,b)=>a+b),p95:sorted[Math.ceil(count*.95)-1],p99:sorted[Math.ceil(count*.99)-1]},null,2));
  process.exit(0);
}
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/presentation-frames.js'])
  vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
vm.runInThisContext(fromBaseline('src/model.js'));
const original=CellLab.Simulation.prototype.snapshot;
vm.runInThisContext(await readFile('src/model.js','utf8'));
const sim=new CellLab.Simulation({...config,warmup:0});
await CellLabWasm.install(sim,await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')));
sim.advance(32);
const {port1,port2}=new MessageChannel(),codec=CellLabPresentation,measurements={before:[],after:[]};
let frame=0,previous=null,field=-1,terrain=-1,verified=0;
function measure(current){
  const baseFrame=current?frame:0,start=performance.now();
  const data=current?sim.snapshot({terrain:!frame||terrain!==sim.terrainRevision,includeFields:!frame||field!==sim.fieldRevision,packDetails:frame?codec.packDetails:null}):original.call(sim);
  const packed=performance.now(),transfer=codec.transfers(data),bytes=transfer.reduce((n,b)=>n+b.byteLength,0);
  port1.postMessage({data,frame:frame+1,baseFrame},transfer);
  const message=receiveMessageOnPort(port2).message;
  const result=current?codec.receive(message,previous,frame):message.data;
  if(current){previous=result;frame++;field=sim.fieldRevision;terrain=sim.terrainRevision;}
  return {result,row:{packMs:packed-start,deliveryMs:performance.now()-start,transferBytes:bytes}};
}
try{
  for(let i=-16;i<count;i++){
    sim.advance(1);
    const pair={};
    for(const mode of (i%2===0?['before','after']:['after','before'])){
      const {result,row}=measure(mode==='after');pair[mode]=result;if(i>=0)measurements[mode].push(row);
    }
    if(i===-1||i>=0&&(i%8===0||i===count-1)){assert.deepEqual(codec.complete(pair.after),pair.before);verified++;}
  }
}finally{port1.close();port2.close();}
function stats(rows){
  return Object.fromEntries(Object.keys(rows[0]).map(k=>{
    const values=rows.map(r=>r[k]).sort((a,b)=>a-b);
    return [k,{mean:values.reduce((a,b)=>a+b)/values.length,p50:values[Math.ceil(values.length*.5)-1],p95:values[Math.ceil(values.length*.95)-1]}];
  }));
}
console.log(JSON.stringify({baseline,cpu:os.cpus()[0].model,node:process.version,name,seed,count,lattice:[sim.width,sim.height],cells:sim.live().length,verified,
  before:stats(measurements.before),after:stats(measurements.after)},null,2));
