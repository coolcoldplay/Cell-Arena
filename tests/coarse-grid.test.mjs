import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
function intact(s){assert.equal(s.snapshot().orphans,0);assert.ok(Object.values(s.fields).every(f=>f.values.every(Number.isFinite)));for(const m of s.live().filter(m=>!m.dying)){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));}}
test('the slider accepts fractional refinements and rejects scales with empty field bins or unresolved maze passages',()=>{
  for(const r of [.375,.4,.5,.75,1,1.25,1.5,2,3,4]){assert.ok(CellLab.isRefinement(r));assert.equal(CellLabExperiment.parse({scene:'hot',seed:17,worldWidth:192,worldHeight:144,refinement:r,boundary:'wrap',settings:{}}).config.refinement,r);}
  for(const r of [.125,.1875,.25,.3,4.25,NaN]){assert.equal(CellLab.isRefinement(r),false);assert.throws(()=>new CellLab.Simulation({scene:'empty',refinement:r,warmup:0}));}
  assert.throws(()=>new CellLab.Simulation({scene:'maze',refinement:.375,warmup:0}),/0.5/);
});
for(const refinement of [.375,.5,.75,1.25]){
  test(`${refinement}x preserves world/field scales, scenario populations and JS/WASM trajectories`,async()=>{
    const config={scene:'hot',worldWidth:192,worldHeight:144,refinement,boundary:'wrap',seed:31,warmup:0},a=new CellLab.Simulation(config),b=new CellLab.Simulation(config);
    assert.equal(a.width,192*refinement);assert.equal(a.fields.oxygen.width,48);assert.equal(a.fields.oxygen.height,36);assert.equal(a.scenarioReport().initial.tumor,37);assert.equal(a.scenarioReport().initial.immune,18);
    assert.equal(CellLabExperiment.parse({...a.snapshot(),schemaVersion:3}).config.refinement,refinement);await CellLabWasm.install(b,module);
    for(let t=0;t<400;t+=20){a.advance(20);b.advance(20);assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.counters,b.counters);}
    assert.deepEqual(a.snapshot().cells,b.snapshot().cells);assert.deepEqual(Uint32Array.from(a.C.mt.mt),Uint32Array.from(b.C.mt.mt));intact(a);intact(b);
  });
  test(`${refinement}x local endothelial cluster divides and opens a functioning lumen`,async()=>{
    const s=new CellLab.Simulation({scene:'empty',worldWidth:160,worldHeight:128,refinement,warmup:0,seed:17,settings:{metabolism:.25,supply:3,apoptosis:0,vesselLifespan:0,vesselImmuneRate:0,vesselDivisions:6,vesselMaxDiameter:160,stressMutation:0,progression:0}});
    assert.ok(s.vascular.initiate(80*refinement,64*refinement,{normal:2,tumor:0,total:2,fraction:0}));await CellLabWasm.install(s,module);
    for(let t=0;t<4000;t+=100){s.fields.angiogenicNormal.values.fill(2);s.advance(100);}
    const v=s.vascular.vessels[0];assert.ok(s.counters.endothelialDivisions>=3);assert.ok(v.radius/refinement>15);assert.ok(v.perfusion>.5);assert.equal(v.nascent,false);intact(s);
  });
}
