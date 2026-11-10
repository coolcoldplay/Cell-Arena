import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile('src/round-history.js','utf8').catch(()=> 'globalThis.CellLabRounds={};');vm.runInThisContext(source);
const snapshot=()=>({scene:'random',revision:1,seed:4294967295,time:35,playing:true,worldWidth:240,worldHeight:180,refinement:1.5,boundary:'wrap',settings:{growth:1,kill:2,immuneKillLimit:10},counters:{kills:0},cells:[{id:1,birth:1,kind:1,state:'normal'},{id:2,birth:2,kind:2,antigen:true},{id:3,birth:3,kind:3,activation:20},{id:4,birth:4,kind:3,immunePhenotype:'suppressive'}]});
test('locks preserve only selected current values and ignore unrecognized keys',()=>{
  assert.ok(CellLabRounds.Locks,'parameter locks are available');const locks=new CellLabRounds.Locks(['growth','kill'],{growth:true,bogus:true});
  assert.deepEqual(locks.pick({growth:0,kill:2}),{growth:0});locks.toggle('kill');assert.deepEqual(locks.pick({growth:0,kill:1.8}),{growth:0,kill:1.8});
  locks.all(false);assert.deepEqual(locks.pick({growth:0,kill:2}),{});locks.all(true);assert.deepEqual(locks.toJSON(),{growth:true,kill:true});
});

test('unlocked setup dimensions and boundaries vary within supported bounds, while locks preserve exact geometry',()=>{
 const current={worldWidth:256,worldHeight:192,refinement:4,boundary:'wrap'},locked={'world-size':true,refinement:true,boundary:true};
 assert.deepEqual(CellLabRounds.randomGeometry(17,current,locked),current);
 const seen=new Set();for(let seed=1;seed<50;seed++){const g=CellLabRounds.randomGeometry(seed,current,{});assert.ok(g.worldWidth*g.refinement<=1024&&g.worldHeight*g.refinement<=768);seen.add(JSON.stringify(g));}
 assert.ok(seen.size>5);for(let seed=1;seed<50;seed++){const g=CellLabRounds.randomGeometry(seed,current,{refinement:true});assert.equal(g.refinement,4);assert.ok(g.worldWidth<=256);}
});
test('round records keep initial and final parameters, active duration, states and the actual termination reason',()=>{
  assert.ok(CellLabRounds.Journal,'round history is available');const log=new CellLabRounds.Journal(),s=snapshot();log.begin(s,0,'2026-11-11T00:00:00.000Z',{growth:true});
  log.observe(s,1000,true);s.time=120;s.settings.growth=1.5;s.cells[2].activation=0;log.observe(s,2000,true);
  log.observe(s,2000,false);log.observe(s,9000,false);log.observe(s,10000,true);log.observe(s,11000,true);
  const r=log.finish('auto-no-normal',11000,'2026-11-11T00:00:11.000Z',{growth:false});
  assert.equal(r.seed,4294967295);assert.equal(r.simulatedMCS,120);assert.equal(r.runningMs,3000);assert.equal(r.reason,'auto-no-normal');
  assert.equal(r.initialSettings.growth,1);assert.equal(r.finalSettings.growth,1.5);assert.deepEqual(r.parameterChanges,[{mcs:120,key:'growth',value:1.5}]);
  assert.equal(r.population.immuneResting,1);assert.equal(r.population.immuneSuppressive,1);assert.equal(r.population.tumorAntigenPositive,1);
  s.settings.growth=8;s.cells.length=0;assert.equal(r.finalSettings.growth,1.5);assert.equal(r.population.total,4);assert.equal(log.finish('again',12000),null);
});
test('lifespan and other dying bodies are separated from the final living state counts',()=>{
  assert.ok(CellLabRounds.population);const s=snapshot();s.cells[2].dying=true;s.cells[2].deathCause='lifespan';const p=CellLabRounds.population(s);
  assert.equal(p.immune,1);assert.equal(p.immuneActive,0);assert.equal(p.clearing,1);assert.equal(p.lifespanClearing,1);assert.equal(p.total,3);
});
test('CSV includes every parameter and counter, keeps quotes safe and includes an explicit in-progress row',()=>{
  assert.ok(CellLabRounds.Journal);const log=new CellLabRounds.Journal(),s=snapshot();log.begin(s,0,'2026-11-11T00:00:00Z');log.observe(s,1000,true);const r=log.finish('manual-random',1000,'2026-11-11T00:00:01Z');
  log.begin({...s,revision:2,seed:32},2000,'2026-11-11T00:00:02Z');const csv=CellLabRounds.csv([r,log.current()]);
  assert.ok(csv.startsWith('\uFEFF'));for(const field of ['initial.growth','final.growth','final.immuneKillLimit','event.kills','manual-random','running','4294967295','parameter_changes','cycle_states','field_sources'])assert.ok(csv.includes(field),field);
  assert.equal(csv.trim().split('\r\n').length,3);assert.match(csv,/""mcs""|parameter_changes/);
});
test('lock import validates booleans and all model parameters survive a fixed random seed override',async()=>{
  for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
  const data={scene:'random',seed:17,boundary:'wrap',refinement:1,worldWidth:96,worldHeight:72,settings:{},display:{parameterLocks:{growth:true,kill:false}}};
  assert.deepEqual(CellLabExperiment.parse(data).display.parameterLocks,{growth:true,kill:false});assert.throws(()=>CellLabExperiment.parse({...data,display:{parameterLocks:{growth:'true'}}}),/parameterLocks/);
  const locks=new CellLabRounds.Locks(Object.keys(CellLabExperiment.ranges));locks.all(true);const original=new CellLab.Simulation({scene:'hot',width:240,height:180,warmup:0});
  const next=new CellLab.Simulation({scene:'random',width:240,height:180,warmup:0,seed:999,settings:locks.pick(original.settings)});assert.deepEqual(next.settings,original.settings);
});
