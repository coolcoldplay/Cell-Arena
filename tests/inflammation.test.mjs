import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(inflammation=10)=>new CellLab.Simulation({width:128,height:96,scene:'empty',warmup:0,seed:17,settings:{inflammation,stressMutation:0,progression:0,growth:0,immuneGrowth:0,metabolism:0,apoptosis:0}});
test('inflammatory exposure reads only the occupied local signal field, accumulates and resolves without advancing on pause',()=>{
  const s=make(),near=s.seed(1,25,40,7),far=s.seed(1,90,40,7),a=s.cells[near],b=s.cells[far];
  for(const [i] of a.fieldBins)s.fields.trail.values[i]=4;
  s.transformation(a,4);s.transformation(b,4);assert.ok(a.inflammatorySignal>.5);assert.equal(b.inflammatorySignal,0);assert.equal(a.state,'normal');assert.ok(a.inflammatoryExposure>0&&a.inflammatoryExposure<.05);
  const before=a.inflammatoryExposure,rng=s.C.mt.mt.slice();s.transformation(a,0);assert.equal(a.inflammatoryExposure,before);assert.deepEqual(s.C.mt.mt,rng);
  for(let n=0;n<50;n++)s.transformation(a,4);const peak=a.inflammatoryExposure;assert.ok(peak>before);s.fields.trail.values.fill(0);for(let n=0;n<50;n++)s.transformation(a,4);assert.ok(a.inflammatoryExposure<peak);
});
test('chronic inflammation adds a reproducible, switchable initiation risk while retaining the abnormal intermediate state',()=>{
  const run=strength=>{const s=make(strength);for(let y=10;y<90;y+=14)for(let x=10;x<120;x+=14)s.seed(1,x,y,4);s.fields.danger.values.fill(4);s.fields.trail.values.fill(4);const grid=s.C.grid._pixels.slice();
    for(let n=0;n<150;n++){s.C.time+=4;for(const m of s.live())s.transformation(m,4);}
    assert.deepEqual(s.C.grid._pixels,grid);assert.ok(s.live().every(m=>m.kind===1&&m.stress===0));assert.equal(s.counters.malignantTransitions,0);return s;};
  const zero=run(0),low=run(1),high=run(10),repeat=run(10);
  assert.equal(zero.counters.abnormalInitiations,0);assert.ok(high.counters.abnormalInitiations>low.counters.abnormalInitiations);assert.ok(high.counters.abnormalInitiations>10);
  assert.deepEqual(high.snapshot().cells,repeat.snapshot().cells);assert.ok(high.live().filter(m=>m.state==='abnormal').every(m=>m.geneClone&&high.divide(m.id)===0));
});
test('cohesion and remote inflammation cannot cause local initiation; zero strength does not consume new random draws',()=>{
  const s=make(),id=s.seed(1,20,40,7),m=s.cells[id];s.fields.cohesion.values.fill(30);s.fields.trail.deposit(26,10,30);
  for(let n=0;n<500;n++)s.transformation(m,4);assert.equal(m.state,'normal');assert.equal(m.inflammatoryExposure,0);
  s.set('inflammation',0);s.fields.trail.values.fill(30);const rng=s.C.mt.mt.slice(),index=s.C.mt.mti;
  for(let n=0;n<500;n++)s.transformation(m,4);assert.equal(m.state,'normal');assert.deepEqual(s.C.mt.mt,rng);assert.equal(s.C.mt.mti,index);assert.ok(m.inflammatoryExposure>.5);
});
test('inflammatory signaling preserves JS/WASM mechanics and the 160 MCS minimum intermediate dwell',async()=>{
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),runs=[];
  for(const kernel of ['fast','wasm']){const s=make(),id=s.seed(1,40,40,7);s.fields.trail.values.fill(4);s.beginAbnormal(id);s.set('progression',20);if(kernel==='wasm')await CellLabWasm.install(s,module);s.advance(156);assert.equal(s.cells[id].state,'abnormal');assert.equal(s.counters.malignantTransitions,0);runs.push(s);}
  assert.deepEqual(runs[0].C.grid._pixels,runs[1].C.grid._pixels);assert.deepEqual(runs[0].snapshot().cells,runs[1].snapshot().cells);
});
