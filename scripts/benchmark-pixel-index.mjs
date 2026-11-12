// Same-process, alternating baseline/prototype windows. Source from the named
// Git revision is the baseline; no biology parameters are disabled for speed.
import vm from 'node:vm';
import os from 'node:os';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {serialize,deserialize} from 'node:v8';
import {isDeepStrictEqual} from 'node:util';
import path from 'node:path';
const arg=(key,fallback)=>process.argv.find(x=>x.startsWith('--'+key+'='))?.split('=').slice(1).join('=')??fallback;
const revision=arg('baseline','2a55e9e4b16a408025ea05381359df58c032673c'),steps=Number(arg('steps','160')),pairs=Number(arg('pairs','6')),warmup=Number(arg('warmup','64'));
const cases={default:{worldWidth:240,worldHeight:180,refinement:1.5},maximum:{worldWidth:512,worldHeight:384,refinement:2},fine:{worldWidth:240,worldHeight:180,refinement:4}};
const digest=value=>createHash('sha256').update(value).digest('hex');
const quantile=(values,q)=>{const v=values.toSorted((a,b)=>a-b);return v[Math.max(0,Math.ceil(q*v.length)-1)]??null;};
const statistics=values=>({count:values.length,meanMs:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,p50Ms:quantile(values,.5),p95Ms:quantile(values,.95),p99Ms:quantile(values,.99),maxMs:values.length?Math.max(...values):null,over33ms:values.filter(x=>x>1000/30).length,over50ms:values.filter(x=>x>50).length,over100ms:values.filter(x=>x>100).length});
const child=arg('child','');
if(!child){
  const rows=[];
  for(const name of arg('case','default,maximum,fine').split(','))for(const seed of arg('seeds','29').split(',').map(Number)){
    if(!cases[name])throw Error('Unknown case '+name);
    const row=JSON.parse(execFileSync(process.execPath,['--expose-gc',process.argv[1],...process.argv.slice(2),'--child='+name+':'+seed],{encoding:'utf8',maxBuffer:32*1024*1024}));
    rows.push(row);console.log(JSON.stringify({case:name,seed,cells:row.cells,baseline:row.summary.baseline,prototype:row.summary.prototype,speedup:row.speedup,stateIdentical:row.stateIdentical}));
  }
  const output=arg('out','reports/pixel-index/node-results.json');await mkdir(path.dirname(output),{recursive:true});
  const report={date:'2026-11-13',baseline:revision,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),prototypeModelSHA256:digest(await readFile('src/model.js')),scriptSHA256:digest(await readFile(process.argv[1])),node:process.version,cpu:os.cpus()[0].model,platform:process.platform,command:process.argv,steps,pairs,warmup,method:'One subprocess per scenario/seed; both revisions in the same JS realm and thread. Alternate order each window. Full biology; no inspector. Per-MCS timers and divide/erase timers on BOTH versions. Forced GC before each window, never inside timed loops. State hashes outside timing. Continuous evolution, not independent replicates. Browser frame timing is a separate experiment.',rows};
  await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log('Saved '+output);
}else{
  const [name,seedText]=child.split(':'),seed=Number(seedText);
  for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
  vm.runInThisContext(execFileSync('git',['show',revision+':src/model.js'],{encoding:'utf8',maxBuffer:4*1024*1024}),{filename:'baseline/model.js'});const Baseline=CellLab.Simulation;
  vm.runInThisContext(await readFile('src/model.js','utf8'),{filename:'prototype/model.js'});const Prototype=CellLab.Simulation;
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
  const config={...cases[name],scene:'hot',seed,boundary:'wrap',warmup:0},models=[new Baseline(config),new Prototype({...config,pixelIndex:true})];
  for(const s of models){await CellLabWasm.install(s,module);s.advance(warmup);}
  const state=s=>({time:s.C.time,grid:s.C.grid._pixels,mt:s.C.mt.mt,mti:s.C.mt.mti,lastID:s.C.last_cell_id,cellKinds:s.C.t2k,volumes:s.C.cellvolume,degree:s.C._neighbours,borders:s.C.borderpixels.elements,perimeters:s.C.getConstraint('PerimeterConstraint').cellperimeters,act:s.act.cellpixelsact,cells:s.cells,contacts:s.contacts,occupancy:s.occupancy,fields:s.fields,counters:s.counters,events:s.events,history:s.history,histories:s.histories,lineage:s.lineage,deaths:s.deathHistory,patrol:s.patrol,immunity:Object.fromEntries(Object.entries(s.immunity).filter(([key])=>key!=='s'))});
  // V8 serialization is not canonical: equal arrays may have different internal
  // encodings. Hash actual typed-array bytes and ordered data, not heap layout.
  const canonical=(key,value)=>{
    if(ArrayBuffer.isView(value))return {type:value.constructor.name,sha256:digest(Buffer.from(value.buffer,value.byteOffset,value.byteLength))};
    if(value instanceof Map)return {map:[...value]};if(value instanceof Set)return {set:[...value]};
    if(typeof value==='number'&&(Object.is(value,-0)||!Number.isFinite(value)))return {number:Object.is(value,-0)?'-0':String(value)};
    return value===undefined?{undefined:true}:value;
  };
  const equal=()=>{
    const states=models.map(state),hashes=states.map(s=>digest(JSON.stringify(s,canonical)));
    if(hashes[0]!==hashes[1]){const [a,b]=states.map(s=>deserialize(serialize(s)));throw Error('State mismatch at MCS '+models[0].C.time+' differing keys: '+Object.keys(a).filter(k=>!isDeepStrictEqual(a[k],b[k])).join(', '));}
    return hashes[0];
  };
  equal();
  const events=[[],[]],windows=[];
  for(const [index,s]of models.entries())for(const method of ['divide','eraseCell']){const original=s[method];s[method]=function(id,...args){const time=s.C.time,start=performance.now();let result;try{return result=original.call(s,id,...args);}finally{events[index].push({method,time,id,child:result??null,ms:performance.now()-start});}};}
  for(let pair=0;pair<pairs;pair++){
    const timing=[],order=pair%2?[1,0]:[0,1];
    for(const index of order){global.gc?.();const s=models[index],durations=[],startMCS=s.C.time,eventStart=events[index].length,begin=performance.now();
      for(let i=0;i<steps;i++){const t=performance.now();s.advance(1);durations.push(performance.now()-t);}
      const ms=performance.now()-begin;timing[index]={startMCS,endMCS:s.C.time,ms,mcsPerSecond:steps*1000/ms,stepsMs:durations,events:events[index].slice(eventStart)};
    }
    const hash=equal(),eventKeys=timing.map(t=>t.events.map(({ms,...event})=>event));
    if(JSON.stringify(eventKeys[0])!==JSON.stringify(eventKeys[1]))throw Error('Event schedule differs');
    windows.push({pair:pair+1,order:order.map(i=>i?'prototype':'baseline'),baseline:timing[0],prototype:timing[1],stateHash:hash});
  }
  const summary={};
  for(const [index,key]of ['baseline','prototype'].entries()){
    const elapsed=windows.reduce((n,w)=>n+w[key].ms,0),durations=windows.flatMap(w=>w[key].stepsMs);
    summary[key]={mcsPerSecond:pairs*steps*1000/elapsed,steps:statistics(durations),events:Object.fromEntries(['divide','eraseCell'].map(method=>[method,statistics(events[index].filter(e=>e.method===method).map(e=>e.ms))])),windowRates:windows.map(w=>w[key].mcsPerSecond)};
  }
  const index=models[1].pixelIndex;
  console.log(JSON.stringify({case:name,seed,config,lattice:[models[0].width,models[0].height],cells:models.map(s=>s.live().length),summary,speedup:summary.prototype.mcsPerSecond/summary.baseline.mcsPerSecond,stateIdentical:true,indexStorage:{slotBytes:index.slots.byteLength,memberCount:index.members.reduce((n,m)=>n+(m?.length||0),0),cellLists:Object.keys(index.members).length,note:'Member arrays and JS metadata are additional to slotBytes.'},windows}));
}
