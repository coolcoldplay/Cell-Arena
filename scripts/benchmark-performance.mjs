// Dense, fixed-seed cultures: timings are separate from deterministic state checks.
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector/promises';
import {execFileSync} from 'node:child_process';
const label=process.argv[2]||'current',size=Number(process.argv[3]||384),steps=Number(process.argv[4]||120);
const revision=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11);
const source=async file=>revision?execFileSync('git',['show',revision+':'+file],{maxBuffer:16*1024*1024}):readFile(file);
await mkdir('output/performance',{recursive:true});
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js',...(revision?[]:['src/immune-genetics.js']),'src/model.js'])vm.runInThisContext((await source(f)).toString('utf8'),{filename:f});
const module=await CellLabWasm.load(await source('build/cpm-kernel.wasm'));
const start=performance.now(),s=new CellLab.Simulation({scene:'hot',seed:29,worldWidth:size,worldHeight:size*.75,refinement:2,warmup:0});
await CellLabWasm.install(s,module);s.advance(16);
const startupMs=performance.now()-start,timing={},stack=[];
function track(object,key,name=key){const fn=object[key];object[key]=function(...args){const entry=timing[name]??={calls:0,ms:0,selfMs:0},frame={start:performance.now(),nested:0};stack.push(frame);try{return fn.apply(this,args);}finally{const elapsed=performance.now()-frame.start;stack.pop();if(stack.length)stack.at(-1).nested+=elapsed;entry.calls++;entry.ms+=elapsed;entry.selfMs+=elapsed-frame.nested;}};}
for(const key of ['mechanicalStep','biologicalStep','refreshPositions','scanContacts','updateEnvironment','prepareEnvironment','integrateEnvironment','updateMetabolism','immuneInteractions','biology','updateSignals','updatePolarity','updateScenarioState','cleanup','snapshot','snapshotRaster','scenarioReport','populationHistory','cycleReport','patrolReport','observationReport','deathSummary'])if(s[key])track(s,key);
for(const key of ['update','updateNucleusShape','updateProtrusions','updateJunctions'])if(typeof s.section[key]==='function')track(s.section,key,'section.'+key);
for(const key of ['step','sync','contacts','raster'])if(s.wasm[key])track(s.wasm,key,'wasm.'+key);
s.wasm.e={...s.wasm.e};for(const key of ['run','contacts'])track(s.wasm.e,key,'kernel.'+key);
const inspector=process.argv.includes('--profile')?new Session():null;if(inspector){inspector.connect();await inspector.post('Profiler.enable');await inspector.post('Profiler.start');}
const t=performance.now();s.advance(steps);const elapsed=performance.now()-t;
if(inspector){const {profile}=await inspector.post('Profiler.stop');inspector.disconnect();await writeFile(`output/performance/${label}-${size}.cpuprofile`,JSON.stringify(profile));}
const shots=[];for(let i=0;i<12;i++){const t=performance.now();s.snapshot();shots.push(performance.now()-t);}
const hash=createHash('sha256');hash.update(s.C.grid._pixels);hash.update(new Uint32Array(s.C.mt.mt));hash.update(JSON.stringify({index:s.C.mt.mti,cells:s.snapshot().cells,counters:s.counters}));for(const f of Object.values(s.fields))hash.update(f.values);
const row={label,size,steps,lattice:[s.width,s.height],cells:s.live().length,startupMs,elapsedMs:elapsed,mcsPerSecond:steps*1000/elapsed,snapshotMs:shots.reduce((a,b)=>a+b)/shots.length,stateHash:hash.digest('hex'),timing};
await writeFile(`output/performance/${label}-${size}.json`,JSON.stringify(row,null,2));
console.log(JSON.stringify(row,null,2));
