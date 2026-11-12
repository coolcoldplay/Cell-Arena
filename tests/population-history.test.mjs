import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
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

test('state histories partition each population and keep deaths separate from live immune phenotypes',()=>{
  const s=make({width:96,height:72});
  const n=s.seed(1,12,12,5),a=s.seed(1,30,12,5),t=s.seed(2,50,12,5),dead=s.seed(2,68,12,5);
  s.beginAbnormal(a);s.cells[t].antigen=true;s.beginDeath(dead,'spontaneous');
  const ctl=[12,30,48,66].map(x=>s.seed(3,x,42,4));s.cells[ctl[1]].activation=200;s.cells[ctl[2]].immunePhenotype='suppressive';s.beginDeath(ctl[3],'environment');
  const row=s.populationRow();assert.equal(row.normal,1);assert.equal(row.abnormal,1);assert.equal(row.tumorPositive,1);assert.equal(row.tumorDying,1);
  for(const [total,states] of Object.entries({normal:['normalLiving','normalDying'],abnormal:['abnormalPositive','abnormalNegative','abnormalDying'],tumor:['tumorPositive','tumorNegative','tumorDying'],immune:['immuneResting','immuneActive','immuneSuppressive','immuneDying']}))assert.equal(states.reduce((v,k)=>v+row[k],0),row[total]);
  assert.deepEqual([row.immuneResting,row.immuneActive,row.immuneSuppressive,row.immuneDying],[1,1,1,1]);
  s.record();const before=s.history.length;s.cells[ctl[0]].activation=100;s.record();assert.equal(s.history.length,before+1,'same-time state changes are archived even without a count change');
  assert.equal(s.populationHistory().at(-1).immuneActive,2);assert.ok(s.cells[n]);
});

test('long-history reduction retains a brief immune state transition even at constant total population',()=>{
  const rows=Array.from({length:12000},(_,i)=>({time:i*30,normal:0,abnormal:0,tumor:0,immune:20,immuneResting:20,immuneActive:0,immuneSuppressive:0,immuneDying:0}));
  rows[941].immuneResting=0;rows[941].immuneActive=20;rows[10947].immuneResting=0;rows[10947].immuneSuppressive=20;
  const display=CellLab.sampleHistory(rows);assert.ok(display.includes(rows[941]));assert.ok(display.includes(rows[10947]));assert.ok(display.length<=2050);assert.equal(display[0],rows[0]);assert.equal(display.at(-1),rows.at(-1));
});
