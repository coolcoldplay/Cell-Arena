import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/insertion.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const quiet={stemFraction:0,stemPlasticity:0,normalRepair:0,growth:2,metabolism:0,apoptosis:0,immuneGrowth:0,normalMotility:0,cohesion:0,stressMutation:0};
function forty(capacity,kind=2){
  const s=new CellLab.Simulation({width:192,height:144,scene:'empty',warmup:0,seed:17,settings:{...quiet,capacity}}),id=s.seed(kind,110,95,7);
  for(let i=0;i<39;i++)assert.ok(s.seed(1,10+(i%13)*12,10+Math.floor(i/13)*12,3));return {s,id};
}

test('old population budgets do not alter tumor growth, division, random trajectory or environmental state',async()=>{
  const a=forty(40),b=forty(800);await CellLabWasm.install(a.s,module);await CellLabWasm.install(b.s,module);
  a.s.set('capacity',40);a.s.advance(400);b.s.advance(400);
  assert.ok(a.s.counters.divisions>0,'tumor must divide beyond the previous 40-cell budget');assert.ok(a.s.live().length>40);
  assert.deepEqual(a.s.C.grid._pixels,b.s.C.grid._pixels);assert.deepEqual(a.s.snapshot().cells,b.s.snapshot().cells);assert.deepEqual(a.s.C.mt.mt,b.s.C.mt.mt);
  for(const name of Object.keys(a.s.fields))assert.deepEqual(a.s.fields[name].values,b.s.fields[name].values);
  assert.equal('capacity' in a.s.settings,false);assert.equal('limit' in a.s.snapshot(),false);assert.equal('hardLimit' in a.s.snapshot(),false);
});

test('licensed immune cytokinesis works beyond old population budgets but still consumes a finite lineage allowance',()=>{
  const {s,id}=forty(40,3),m=s.cells[id];s.set('immuneGrowth',1);m.antigenMemory=1;s.fields.il2.values.fill(2);m.cycle.phase='M';m.cycle.progress=1;m.target=m.base*1.7;m.age=200;const remaining=m.divisionsLeft;
  s.biology(1);assert.equal(s.live().length,41);assert.equal(s.counters.immuneDivisions,1);assert.equal(m.divisionsLeft,remaining-1);
  for(const c of s.live().filter(c=>c.kind===3))c.divisionsLeft=0;
  const n=s.live().length;assert.equal(s.divide(id),0);assert.equal(s.live().length,n);
});

test('manual and programmatic seeding can exceed 2048 and continue full WASM mechanics while retaining geometry rejection',async()=>{
  const s=new CellLab.Simulation({width:512,height:384,scene:'empty',warmup:0,settings:{...quiet,capacity:40}});
  for(let i=0;i<2050;i++){const id=s.seed(3,6+(i%63)*8,6+Math.floor(i/63)*8,3,{manual:i%2===0});assert.ok(id,`cell ${i+1}: ${JSON.stringify(s.lastSeedResult)}`);}
  assert.equal(s.live().length,2050);assert.equal(s.seed(3,6,6,3),0);assert.equal(s.lastSeedResult.reason,'occupied');assert.equal(s.snapshot().orphans,0);
  await CellLabWasm.install(s,module);s.advance(4);assert.equal(s.kernel,'wasm');assert.equal(s.C.time,4);assert.equal(s.live().length,2050);assert.equal(s.snapshot().orphans,0);
});

test('removing population gates preserves nutrient and actual-space restrictions on automatic proliferation',async()=>{
  const a=forty(40);a.s.fields.oxygen.values.fill(0);a.s.fields.glucose.values.fill(0);a.s.updateMetabolism(1);const target=a.s.cells[a.id].target;a.s.biology(20);
  assert.equal(a.s.cells[a.id].target,target);assert.equal(a.s.counters.divisions,0);
  const s=new CellLab.Simulation({width:48,height:36,scene:'empty',warmup:0,settings:quiet}),id=s.seed(2,24,18,4);
  for(let x=0;x<s.width;x++)for(let y=0;y<s.height;y++)if(!s.C.pixt([x,y]))s.paint(x,y,0,false,false);s.rebuildMask();await CellLabWasm.install(s,module);
  // No field update in this mechanically sealed fixture: isolate spatial confinement.
  const sealedTarget=s.cells[id].target;
  for(let n=0;n<200;n++){s.mechanicalStep();s.biology(1);}assert.equal(s.live().length,1);assert.equal(s.counters.divisions,0);assert.equal(s.C.getVolume(id),49);assert.equal(s.cells[id].target,sealedTarget,'a sealed body cannot manufacture mass beyond mechanical space');
});

test('hot starts with a local 37-cell tumor burden and a surrounding immune population at all supported dish sizes',()=>{
  for(const worldWidth of [192,240,256,320,384,512]){
    const s=new CellLab.Simulation({scene:'hot',worldWidth,worldHeight:worldWidth*.75,refinement:1,warmup:0,settings:{capacity:40}}),initial=s.scenarioReport().initial,tumors=s.live().filter(m=>m.kind===2),ctls=s.live().filter(m=>m.kind===3);
    assert.equal(initial.tumor,37);assert.equal(initial.immune,18);assert.equal(initial.antigenPositive,37);
    assert.ok(tumors.every(m=>Math.hypot(m.x-worldWidth/2,m.y-worldWidth*.375)<57));assert.ok(ctls.every(m=>Math.hypot(m.x-worldWidth/2,m.y-worldWidth*.375)>54));
    assert.ok(s.live().every(m=>s.section.fits(m,m.nucleusX,m.nucleusY)));assert.equal(s.snapshot().orphans,0);
    const cold=new CellLab.Simulation({scene:'cold',worldWidth,worldHeight:worldWidth*.75,refinement:1,warmup:0,settings:{capacity:40}});
    assert.equal(cold.scenarioReport().initial.tumor,19);assert.equal(cold.scenarioReport().initial.immune,3);
  }
});
