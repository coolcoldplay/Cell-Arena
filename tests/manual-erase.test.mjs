import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(boundary='solid')=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,boundary,settings:{growth:0,immuneGrowth:0,metabolism:0,apoptosis:0}});
test('a swept eraser removes whole touched cells once, preserves walls and signals, and records manual removals separately',()=>{
  const s=make(),ids=[s.seed(1,20,30,4),s.seed(2,40,30,4),s.seed(3,60,30,3)],survivor=s.seed(1,80,55,4);s.paint(40,15,2);s.pulse(40,40,'trail');
  const walls=s.snapshot().walls,signal=s.fields.trail.values.slice(),rng=s.C.mt.mt.slice(),time=s.C.time;
  const result=s.eraseCells([[20,30],[40,30],[60,30],[40,15],[20,30]],5);
  assert.equal(result.removed,3);assert.deepEqual(s.live().map(m=>m.id),[survivor]);assert.equal(s.counters.manualRemoved,3);assert.equal(s.C.time,time);assert.deepEqual(s.C.mt.mt,rng);
  for(const key of ['kills','apoptosis','environment','killStarted','apoptosisStarted','environmentStarted'])assert.equal(s.counters[key],0);
  assert.deepEqual(s.snapshot().walls,walls);assert.deepEqual(s.fields.trail.values,signal);assert.equal(s.snapshot().orphans,0);assert.ok(ids.every(id=>!s.contacts.has(id)));assert.equal(s.events.filter(e=>e.type==='manual-remove').length,3);
  assert.equal(s.eraseCells([[20,30]],5).removed,0);assert.equal(s.counters.manualRemoved,3);assert.equal(s.populationHistory().at(-1).normal,1);
});
test('manually erased pending deaths are cancelled in the death ledger, not falsely counted as biological clearance',()=>{
  const s=make();for(const [cause,x] of [['spontaneous',20],['kill',45],['environment',70]]){const id=s.seed(2,x,30,4);s.beginDeath(id,cause);}
  s.eraseCells([[20,30],[45,30],[70,30]],5);assert.equal(s.counters.manualRemoved,3);assert.equal(s.deathEffects.length,0);
  for(const cause of ['spontaneous','kill','environment'])assert.deepEqual(s.deathSummary()[cause],{started:1,clearing:0,cleared:0});
  assert.ok(s.deathHistory.every(d=>d.manuallyRemovedAt===0&&d.clearedAt===null));assert.equal(s.recentClearances.length,0);s.cleanup();s.advance(10);assert.equal(s.counters.kills+s.counters.apoptosis+s.counters.environment,0);
});
test('eraser respects periodic selection and leaves a valid JS/WASM simulation after bulk removal',async()=>{
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),runs=[];
  for(const kernel of ['fast','wasm']){const s=make('wrap'),edge=s.seed(1,3,35,3);s.seed(2,50,35,4);if(kernel==='wasm')await CellLabWasm.install(s,module);assert.equal(s.eraseCells([[95,35]],5).removed,1);assert.ok(!s.cells[edge]);s.advance(30);runs.push(s);}
  assert.deepEqual(runs[0].snapshot().grid,runs[1].snapshot().grid);assert.deepEqual(runs[0].snapshot().cells,runs[1].snapshot().cells);assert.equal(runs[1].snapshot().orphans,0);
});
