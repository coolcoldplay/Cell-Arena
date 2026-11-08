import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=extra=>new CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0,settings:{growth:0,metabolism:0,apoptosis:0,immuneGrowth:0},...extra});

test('population history starts at zero before mechanical settling and preserves initial populations',()=>{
  const s=new CellLab.Simulation({scene:'hot'}),first=s.history[0];assert.equal(first.time,0);assert.equal(first.tumor,37);assert.equal(first.immune,18);assert.equal(s.history.at(-1).time,s.C.time);
});

test('the full population archive retains the beginning and early peaks beyond 400 samples',()=>{
  const s=make();let id;
  for(let n=1;n<=5000;n++){s.C.time=n*30;if(n===5)id=s.seed(2,30,25,5);if(n===8)s.eraseCell(id);s.record();}
  assert.equal(s.history.length,5001);assert.equal(s.history[0].time,0);assert.equal(s.history[5].tumor,1);assert.equal(s.history.at(-1).time,150000);
  const view=s.snapshot();assert.equal(view.history[0].time,0);assert.ok(view.history.some(r=>r.tumor===1));assert.equal(view.history.at(-1).time,150000);
  assert.ok(view.history.length<=2051,'worker snapshots carry bounded drawing data');assert.equal(view.historySamples,5001);
  assert.equal(s.populationHistory().length,5001,'export retains the full archive even when drawing data is reduced');
});

test('view and export include the exact current time and counts without changing history or random state',()=>{
  const s=make();s.C.time=37;s.seed(1,20,20,5);s.seed(3,40,20,3);const saved=structuredClone(s.history),rng=s.C.mt.mt.slice();
  const snap=s.snapshot(),last=snap.history.at(-1);assert.equal(last.time,37);assert.equal(last.normal,1);assert.equal(last.immune,1);
  assert.deepEqual(s.history,saved);assert.deepEqual(s.C.mt.mt,rng);assert.deepEqual(s.populationHistory().at(-1),last);
  s.record();const n=s.history.length;s.record();assert.equal(s.history.length,n,'repeated records at the same unchanged instant are not duplicated');
  const empty=make();assert.deepEqual(empty.history.map(r=>r.time),[0]);assert.equal(empty.history[0].normal,0);
});

test('display reduction covers the full time axis and retains the extrema of all four populations',()=>{
  assert.equal(typeof CellLab.sampleHistory,'function');
  const rows=Array.from({length:25000},(_,i)=>({time:i*30,normal:20,abnormal:0,tumor:0,immune:10,order:.5}));
  rows[21].normal=500;rows[9000].abnormal=200;rows[14766].tumor=1000;rows[20123].immune=700;rows[22000].normal=0;
  const copy=structuredClone(rows),display=CellLab.sampleHistory(rows,128);
  assert.ok(display.length<=128*8+2);assert.equal(display[0],rows[0]);assert.equal(display.at(-1),rows.at(-1));
  for(const index of [21,9000,14766,20123,22000])assert.ok(display.includes(rows[index]),`peak/trough ${index} survives`);
  assert.ok(display.every((r,i)=>!i||r.time>=display[i-1].time));assert.deepEqual(rows,copy);
});
