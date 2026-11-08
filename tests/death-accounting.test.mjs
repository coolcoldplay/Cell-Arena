import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=()=>new CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0,seed:17,settings:{growth:0,immuneGrowth:0,metabolism:0,apoptosis:0}});

test('spontaneous clearance records completion as well as onset, without waiting to report onset',()=>{
  const s=make(),id=s.seed(2,24,24,4),birth=s.cells[id].birth;
  s.beginDeath(id,'spontaneous');
  assert.equal(s.counters.apoptosis,0,'existing completion count still means fully cleared');
  assert.equal(s.counters.apoptosisStarted,1,'onset is available immediately');
  assert.deepEqual(s.snapshot().deaths.spontaneous,{started:1,clearing:1,cleared:0});
  assert.equal(s.beginDeath(id,'kill'),false,'a later mechanism cannot replace the first death cause');
  s.advance(100);
  assert.equal(s.live().length,0);assert.equal(s.counters.apoptosis,1);
  assert.equal(s.events.filter(e=>e.type==='removed'&&e.cause==='spontaneous').length,1);
  assert.deepEqual(s.snapshot().deaths.spontaneous,{started:1,clearing:0,cleared:1});
  assert.equal(s.deathHistory.length,1);assert.equal(s.deathHistory[0].birth,birth);
  assert.equal(s.deathHistory[0].startedAt,0);assert.ok(s.deathHistory[0].clearedAt>0);
});

test('zero-pixel cleanup and small-remnant removal complete each death exactly once for every cause',()=>{
  for(const cause of ['spontaneous','kill','environment'])for(const remaining of [0,2]){
    const s=make(),id=s.seed(2,24,24,4);s.beginDeath(id,cause);
    const pixels=[...s.C.pixels()].filter(([,cid])=>cid===id);
    for(const [p] of pixels.slice(remaining))s.C.setpix(p,0);
    if(remaining)s.biology(1);else s.cleanup();
    s.cleanup();s.biology(1);s.eraseCell(id);
    assert.deepEqual(s.snapshot().deaths[cause],{started:1,clearing:0,cleared:1});
    assert.equal(s.deathHistory.length,1);assert.equal(s.deathHistory[0].cause,cause);
    assert.equal(s.deathHistory[0].clearedAt,0);
    assert.equal(s.events.filter(e=>e.type==='removed'&&e.cause===cause).length,1);
  }
});

test('complete death history survives the rolling activity log and contains unique birth identities',()=>{
  const s=make();for(let n=0;n<3;n++){const id=s.seed(2,24,24,4);s.beginDeath(id,'spontaneous');s.advance(100);}
  for(let n=0;n<1200;n++)s.log('recognize',1,2);
  assert.equal(s.events.length,1000);assert.equal(s.events.some(e=>e.type==='death-start'),false);
  assert.equal(s.deathHistory.length,3);assert.equal(new Set(s.deathHistory.map(d=>d.birth)).size,3);
  assert.ok(s.deathHistory.every(d=>d.clearedAt!==null));
  assert.equal(s.snapshot().recentDeaths.length,3);
  assert.equal(s.populationHistory().at(-1).apoptosisStarted,3);
});

test('removing a healthy cell is not reclassified as spontaneous apoptosis',()=>{
  const s=make(),id=s.seed(1,24,24,4);s.eraseCell(id);s.cleanup();
  assert.equal(s.counters.apoptosis,0);assert.equal(s.counters.apoptosisStarted,0);assert.equal(s.deathHistory.length,0);
});

test('several environmental deaths reduce the population without incrementing spontaneous apoptosis',()=>{
  const s=make(),ids=[s.seed(1,12,24,4),s.seed(2,28,24,4),s.seed(3,44,24,4)];
  assert.ok(ids.every(Boolean));
  for(const id of ids)s.cells[id].stress=.999;
  s.fields.oxygen.values.fill(0);s.fields.glucose.values.fill(0);s.fields.acid.values.fill(1);
  s.updateMetabolism(4);
  assert.equal(s.deathSummary().environment.started,3);
  s.advance(150);
  assert.equal(s.live().length,0);assert.equal(s.counters.apoptosisStarted,0);assert.equal(s.counters.apoptosis,0);
  assert.equal(s.counters.environment,3);
  const removed=s.snapshot().recentClearances;
  assert.equal(removed.length,3);assert.ok(removed.every(d=>d.cause==='environment'&&d.clearedAt!==null));
  assert.deepEqual(new Set(removed.map(d=>d.id)),new Set(ids));
});

test('recent disappearances follow clearance time, including an older slow-clearing death',()=>{
  const s=make(),old=s.seed(2,12,24,4);s.beginDeath(old,'spontaneous');
  for(let n=0;n<10;n++){
    s.C.time++;const id=s.seed(2,40,24,4);s.beginDeath(id,'environment');s.eraseCell(id);
  }
  s.C.time++;s.eraseCell(old);s.eraseCell(old);
  const recent=s.snapshot().recentClearances;
  assert.equal(recent.length,8);assert.equal(recent.at(-1).id,old);assert.equal(recent.at(-1).cause,'spontaneous');
  assert.ok(recent.every((d,i)=>!i||d.clearedAt>=recent[i-1].clearedAt));
  assert.equal(s.deathHistory.length,11,'the short display buffer must not truncate the complete ledger');
  assert.equal(s.deathSummary().spontaneous.cleared,1);
});

test('natural spontaneous deaths agree across JS and WASM and account for every missing body',async()=>{
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),runs=[];
  for(const kernel of ['fast','wasm']){
    const s=new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,seed:17,settings:{growth:0,immuneGrowth:0,metabolism:0,apoptosis:30,tumorMotility:0}});
    for(let y=10;y<70;y+=17)for(let x=10;x<94;x+=17)s.seed(2,x,y,5);
    const initial=s.live().length;if(kernel==='wasm')await CellLabWasm.install(s,module);
    for(let n=0;n<6;n++){
      s.advance(500);const pending=s.live().filter(m=>m.dying).length;
      assert.equal(initial-s.live().length,s.counters.apoptosis);
      assert.equal(s.counters.apoptosisStarted,s.counters.apoptosis+pending);
      assert.equal(s.deathHistory.filter(d=>d.clearedAt!==null).length,s.counters.apoptosis);
      assert.equal(s.events.filter(e=>e.type==='removed'&&e.cause==='spontaneous').length,s.counters.apoptosis);
    }
    assert.equal(s.counters.apoptosis,17,'accounting must not change the seeded physical trajectory');runs.push(s);
  }
  assert.deepEqual(runs[0].deathHistory,runs[1].deathHistory);assert.deepEqual(runs[0].C.grid._pixels,runs[1].C.grid._pixels);
});
