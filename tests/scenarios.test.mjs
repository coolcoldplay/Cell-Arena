import {assertConfluentTissue} from './vascular-layout-helper.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const make=async(scene,settings={},extra={})=>{const s=new CellLab.Simulation({scene,seed:17,worldWidth:240,worldHeight:180,refinement:1.5,settings,...extra});await CellLabWasm.install(s,module);return s;};

test('guided scenarios start from honest phenotypes and retain intended immune populations at supported dish sizes',()=>{
  for(const worldWidth of [192,240,384]){
    const options={worldWidth,worldHeight:worldWidth*.75,refinement:1.5,warmup:0};
    const a=new CellLab.Simulation({...options,scene:'oncogenesis'}),cold=new CellLab.Simulation({...options,scene:'cold'}),hot=new CellLab.Simulation({...options,scene:'hot'});
    assert.ok(a.live().filter(m=>m.kind===1).length>=30);assert.equal(a.live().filter(m=>m.kind===2).length,0);assert.equal(a.live().filter(m=>m.state==='abnormal').length,0);assert.equal(a.scenarioReport().initial.immune,12);assert.ok(a.live().every(m=>m.stress===0));
    assert.ok(a.fields.oxygen.values.every(v=>v===1));assert.ok(a.fields.acid.values.every(v=>v===0));
    assert.equal(cold.scenarioReport().initial.immune,3);assert.equal(hot.scenarioReport().initial.immune,18);
    assert.equal(cold.scenarioReport().initial.tumor,19);assert.equal(hot.scenarioReport().initial.tumor,37);assert.equal(hot.scenarioReport().initial.antigenPositive,37);
    assert.ok(cold.supplyMap.every(v=>v===1));assert.ok(hot.supplyMap.every(v=>v===1));assert.ok(hot.live().every(m=>hot.section.fits(m,m.nucleusX,m.nucleusY)));
    for(const s of [a,cold,hot]){assertConfluentTissue(s);assert.ok(s.live().every(m=>s.section.fits(m,m.nucleusX,m.nucleusY)));}
  }
});

test('fixed core profile changes actual reaction rates without changing field geometry or advancing time',()=>{
  const s=new CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0});s.prepareEnvironment();
  for(const key of ['oxygen','glucose','acid'])s.fields[key].values.fill(.5);
  s.supplyMap[0]=.05;const profile=s.supplyMap.slice();s.integrateEnvironment(1);
  const f=s.fields,supply=s.settings.supply;
  assert.ok(Math.abs(f.oxygen.values[0]-(.5+.012*supply*(.65+.35*.05)*.5))<1e-7);
  assert.ok(Math.abs(f.acid.values[0]-(.5-.009*supply*.05*.5))<1e-7);
  assert.ok(f.oxygen.values[0]<f.oxygen.values[1]);assert.ok(f.acid.values[0]>f.acid.values[1]);assert.deepEqual(s.supplyMap,profile);assert.equal(s.C.time,0);
});

test('oncogenesis produces unplanted malignant cells; a resulting clone can expand when given space and nutrition',async()=>{
  // Changed immune search changes the stochastic course. Establish the causal
  // transition in the untouched preset, then test growth in a controlled release
  // from crowding instead of requiring a particular outcome at exactly 6000 MCS.
  const s=await make('oncogenesis');let founder;
  for(let elapsed=0;elapsed<6000&&!founder;elapsed+=100){s.advance(100);founder=s.live().find(m=>m.kind===2&&!m.dying);}
  const report=s.scenarioReport();assert.ok(founder);assert.ok(report.tumor>0);assert.equal(report.customized,false);assert.equal(s.snapshot().orphans,0);
  const malignant=s.events.filter(e=>e.type==='malignant');assert.ok(malignant.length>0);
  for(const event of malignant){const first=s.events.find(e=>e.type==='abnormal'&&e.id===event.id);assert.ok(first);assert.ok(first.stress>.06);assert.ok(event.time-first.time>=160);assert.ok(event.genome.tolerance>=.25&&event.genome.tolerance<=3,'founders inherit any normal-stage tolerance variation');}
  assert.ok(s.live().filter(m=>m.kind===2).every(m=>m.origin==='normal'));
  const clone=founder.clone,priorDivisions=report.tumorDivisions;
  for(const m of s.live())if(m!==founder)s.eraseCell(m.id);
  s.set('metabolism',0);s.set('apoptosis',0);s.fields.oxygen.values.fill(1);s.fields.glucose.values.fill(1);s.fields.acid.values.fill(0);
  for(let elapsed=0;elapsed<2000&&s.scenarioReport().tumorDivisions===priorDivisions;elapsed+=100)s.advance(100);
  assert.ok(s.scenarioReport().tumorDivisions>priorDivisions,'the spontaneous clone must still be able to divide');
  assert.ok(s.live().filter(m=>m.kind===2&&m.clone===clone).length>=2);assert.ok(s.scenarioReport().achieved);
});

test('turning off metabolism or both independent initiation pathways prevents scheduled cancer emergence',async()=>{
  for(const settings of [{metabolism:0},{stressMutation:0,inflammation:0}]){const s=await make('oncogenesis',settings);s.advance(2200);assert.equal(s.counters.abnormalInitiations,0);assert.equal(s.counters.malignantTransitions,0);assert.equal(s.scenarioReport().tumor,0);assert.equal(s.scenarioReport().achieved,false);if(settings.stressMutation===0)assert.ok(s.scenarioReport().maxAdversity>.15);}
});

test('cold tumor spreads and divides beyond the original lesion using existing mechanics',async()=>{
  const s=await make('cold');for(let t=0;t<5000&&!s.scenarioReport().achieved;t+=250)s.advance(250);const report=s.scenarioReport();assert.equal(report.initial.immune,3);assert.ok(report.tumor>report.initial.tumor);assert.ok(report.farTumor>0);assert.ok(report.distalDivisions>0);assert.ok(report.achieved);assert.equal(s.snapshot().orphans,0);
  const before=report.farTumor;const id=s.seed(2,4*s.scale,4*s.scale,3*s.scale);if(id){assert.ok(!report.initial.clones.includes(s.cells[id].clone));assert.equal(s.scenarioReport().farTumor,before,'unrelated manual seeds are not scored as primary-clone spread');}
});

test('hot tumor clearance requires real killing and an observation interval; living or dying targets prevent success',async()=>{
  const s=await make('hot');for(let elapsed=0;elapsed<4500&&!s.scenarioReport().achieved;elapsed+=250)s.advance(250);const report=s.scenarioReport();assert.equal(s.counters.kills,37+report.tumorDivisions);assert.equal(s.deathHistory.filter(d=>d.kind===2&&d.cause==='environment').length,0,'tumors clear through immune killing, not environmental death');assert.equal(s.counters.apoptosis,0);assert.equal(report.tumorBodies,0);assert.ok(report.achieved);assert.ok(report.clearanceElapsed>=150);assert.ok(s.counters.recognitions>0);assert.ok(s.counters.immuneDivisions>0);assert.ok(s.live().filter(m=>m.kind===3).every(m=>m.divisionsLeft>=0));
  let id=0;for(let y=5*s.scale;y<s.height-5*s.scale&&!id;y+=10*s.scale)for(let x=5*s.scale;x<s.width-5*s.scale&&!id;x+=10*s.scale)id=s.seed(2,x,y,3*s.scale);assert.ok(id);assert.equal(s.scenarioReport().achieved,false);s.updateScenarioState();assert.equal(s.scenarioReport().clearanceAt,null);s.beginDeath(id,'kill');assert.equal(s.scenarioReport().achieved,false);
  const control=await make('hot',{kill:0});control.advance(2000);assert.equal(control.counters.kills,0);assert.ok(control.scenarioReport().tumorBodies>37);assert.equal(control.scenarioReport().achieved,false);
});

test('reporting is read-only and preset restoration has no parameter leakage',async()=>{
  const s=await make('oncogenesis');const before=s.C.mt.mt.slice(),time=s.C.time,grid=s.C.grid._pixels.slice();for(let i=0;i<20;i++)s.scenarioReport();assert.deepEqual(s.C.mt.mt,before);assert.deepEqual(s.C.grid._pixels,grid);assert.equal(s.C.time,time);
  s.set('stressMutation',12);assert.equal(s.settings.stressMutation,12);s.set('growth',0);assert.equal(s.scenarioReport().customized,true);
  const hot=await make('hot');assert.equal(hot.settings.growth,.75);assert.equal(hot.settings.stressMutation,0);assert.equal(hot.scenarioReport().customized,false);
});

test('acquired antigen loss in a hot tumor can survive early clearance and be inherited by an expanding lineage',async()=>{
  const s=await make('hot',{}, {seed:77});assert.equal(s.scenarioReport().initial.antigenPositive,37);
  // A changed migration law changes the stochastic trajectory, so seed 77 no
  // longer guarantees a rare escape. Condition one draw after real immune
  // exposure; this tests subsequent selection/inheritance, not its prevalence.
  let survivor=null;
  for(let t=0;t<1500&&!survivor;t+=10){s.advance(10);if(s.counters.kills>=20)survivor=s.live().find(m=>m.kind===2&&!m.dying&&m.antigen&&m.damage<.5&&m.recruitmentExposure>.01);}
  assert.ok(survivor,'a living antigen-positive cell must actually experience recruitment during clearance');
  const random=s.C.random;try{s.C.random=()=>0;s.evolutionStep(survivor,4);}finally{s.C.random=random;}
  assert.equal(survivor.antigen,false);
  let nadir=37;
  for(let t=0;t<5000;t+=250){s.advance(250);nadir=Math.min(nadir,s.scenarioReport().tumor);}
  const remaining=s.live().filter(m=>m.kind===2&&!m.dying);
  assert.ok(s.counters.kills>30,'real immune contact must first reduce the lesion');
  assert.ok(s.counters.antigenEscapes>0);assert.ok(remaining.filter(m=>!m.antigen).length>1,'antigen-loss phenotype is inherited by an expanding lineage');
  assert.ok(remaining.length>nadir);assert.equal(s.scenarioReport().achieved,false);assert.equal(s.snapshot().orphans,0);
});
