import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js','src/display-fields.js','src/experiment.js','src/i18n.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(settings={},boundary='solid',sectionModel=false)=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,seed:17,boundary,sectionModel,settings:{metabolism:0,apoptosis:0,growth:0,immuneGrowth:0,mutation:0,normalMutationGain:0,tumorMutationGain:0,antigenStressGain:0,contactEscape:0,signalEscape:0,...settings}});
function body(s,kind,x,y,w=12,h=12){const id=s.C.makeNewCellID(kind);for(let xx=x;xx<x+w;xx++)for(let yy=y;yy<y+h;yy++)s.C.setpix([xx,yy],id);s.refreshPositions();s.scanContacts();return s.cells[id];}

test('injured normal tissue emits source-tagged danger; tumor alarm and healthy normals do not',()=>{
  const s=make(),normal=body(s,1,15,15),tumor=body(s,2,65,45);s.updateSignals(4);
  assert.equal(s.fieldOnCell(normal,'normalDamage'),0);assert.ok(s.fieldOnCell(tumor,'danger')>0);assert.equal(s.fieldOnCell(tumor,'normalDamage'),0);
  normal.stress=.7;s.updateSignals(4);assert.ok(s.fieldOnCell(normal,'normalDamage')>0);
  for(let i=0;i<s.fields.danger.values.length;i++)assert.ok(s.fields.danger.values[i]+1e-6>=s.fields.normalDamage.values[i]);
  s.beginDeath(normal.id,'environment');const before=s.fieldOnCell(normal,'normalDamage');s.updateSignals(4);assert.ok(s.fieldOnCell(normal,'normalDamage')>before,'dying normal bodies still emit until clearance');
});

test('source-tagged damage accumulates locally over time; generic danger and IL-2 cannot turn CTLs blue',()=>{
  const s=make(),near=body(s,3,10,15),far=body(s,3,70,50);s.C.random=()=>.001;
  s.fields.danger.values.fill(30);s.fields.il2.values.fill(30);for(let t=0;t<1000;t+=4)s.immuneRegulation(4);
  assert.equal(near.immunePhenotype,'cytotoxic');assert.equal(near.normalDamageExposure,0);
  for(const [i]of near.fieldBins)s.fields.normalDamage.values[i]=30;
  for(let t=0;t<64;t+=4)s.immuneRegulation(4);assert.equal(near.immunePhenotype,'cytotoxic');assert.ok(near.normalDamageExposure>0&&near.normalDamageExposure<.2);
  for(let t=0;t<1200;t+=4)s.immuneRegulation(4);
  assert.equal(near.immunePhenotype,'suppressive');assert.equal(far.immunePhenotype,'cytotoxic');assert.equal(s.counters.suppressiveTransitions,1);
  const exposure=near.normalDamageExposure;s.fields.normalDamage.values.fill(0);for(let t=0;t<800;t+=4)s.immuneRegulation(4);assert.ok(near.normalDamageExposure<exposure*.2);
});

test('blue cells secrete inhibition without recruitment, IL-2, tumor killing or loss of movement',()=>{
  const s=make({antigen:100,kill:2}),target=body(s,2,30,30),ctl=body(s,3,42,30);ctl.immunePhenotype='suppressive';ctl.recruitment=400;ctl.il2Production=400;ctl.activation=500;
  s.updateSignals(4);assert.ok(s.fieldOnCell(ctl,'inhibition')>0);assert.equal(s.fieldOnCell(ctl,'trail'),0);assert.equal(s.fieldOnCell(ctl,'il2'),0);
  for(let t=0;t<200;t+=4){s.immuneInteractions(4);s.biology(4);}
  assert.equal(target.damage,0);assert.equal(s.counters.recognitions,0);assert.equal(ctl.targetID,0);assert.ok(ctl.drive>0);assert.equal(ctl.cycle.arrest,'suppression');assert.equal(CellLabDisplay.immuneActive(ctl),false);
});

test('normal injury and blue-cell inhibition independently deactivate red cells and release contact',()=>{
  for(const channel of ['normalDamage','inhibition']){
    const s=make({antigen:100,kill:0}),target=body(s,2,30,30),ctl=body(s,3,42,30);s.immuneInteractions(100);assert.ok(ctl.activation>0);target.damage=.6;ctl.antigenMemory=.8;
    s.fields[channel].values.fill(30);s.C.random=()=>0;s.immuneRegulation(4);
    assert.equal(ctl.activation,0);assert.equal(ctl.recruitment,0);assert.equal(ctl.il2Production,0);assert.equal(ctl.targetID,0);assert.equal(ctl.immunePhenotype,'cytotoxic');assert.equal(ctl.immuneRefractory,240);
    assert.equal(target.damage,.6);assert.equal(ctl.antigenMemory,.8);assert.equal(s.histories.size,0);
    assert.equal(s.counters[channel==='normalDamage'?'injuryDeactivations':'signalDeactivations'],1);
    s.fields[channel].values.fill(0);s.set('damagePolarization',0);s.immuneInteractions(4);assert.equal(ctl.activation,0,'same contact cannot instantly reactivate');
    s.set('damageDeactivation',0);s.set('suppressionStrength',0);
    for(let t=0;t<320;t+=4)s.immuneInteractions(4);assert.ok(ctl.activation>0,'fresh contact stimulation is possible after refractory period');
  }
});

test('suppression signals alone deactivate red cells but never convert resting cells to blue',()=>{
  const s=make(),m=body(s,3,20,20);s.fields.inhibition.values.fill(30);s.C.random=()=>0;
  for(let t=0;t<3000;t+=4)s.immuneRegulation(4);assert.equal(m.immunePhenotype,'cytotoxic');assert.equal(s.counters.suppressiveTransitions,0);
});

test('zero multipliers, pause and death freeze transitions; no background stochastic switching without exposure',()=>{
  const s=make({damagePolarization:0,damageDeactivation:0,suppressionStrength:0}),m=body(s,3,20,20);s.fields.normalDamage.values.fill(30);s.fields.inhibition.values.fill(30);m.activation=100;
  const random=()=>JSON.stringify([s.C.mt.mt,s.C.mt.mti]),r=random();for(let t=0;t<1000;t+=4)s.immuneRegulation(4);assert.equal(random(),r);assert.equal(m.activation,100);assert.equal(m.immunePhenotype,'cytotoxic');
  const before=JSON.stringify(m);s.immuneRegulation(0);assert.equal(JSON.stringify(m),before);
  s.beginDeath(m.id,'environment');s.set('damagePolarization',5);s.set('damageDeactivation',5);s.set('suppressionStrength',5);const dead=JSON.stringify(m);s.immuneRegulation(1000);assert.equal(JSON.stringify(m),dead);
});

test('source channels respect walls and distinguish normal-injury experiments from generic danger',()=>{
  const s=make();for(let y=0;y<72;y++)s.paint(48,y,4,false);s.addSource(16,36,'normalDamage',8);s.addSource(16,20,'inhibition',8);
  for(let t=0;t<100;t+=4)s.updateSignals(4);
  for(const key of ['normalDamage','inhibition']){const f=s.fields[key];for(let y=0;y<f.height;y++)for(let x=14;x<f.width;x++)assert.equal(f.values[y*f.width+x],0);}
  const a=make();a.pulse(20,20,'danger');assert.ok(a.fields.danger.values.some(v=>v>0));assert.ok(a.fields.normalDamage.values.every(v=>v===0));a.pulse(20,20,'normalDamage');assert.ok(a.fields.normalDamage.values.some(v=>v>0));
});

test('suppressive phenotype, exposure and color are inherited and exported without a new physical cell kind',()=>{
  const s=make(),m=body(s,3,25,20,24,20);m.immunePhenotype='suppressive';m.normalDamageExposure=.8;m.immuneRefractory=120;
  const id=s.divide(m.id);assert.ok(id);for(const c of s.snapshot().cells){assert.equal(c.kind,3);assert.equal(c.state,'immune');assert.equal(c.immunePhenotype,'suppressive');assert.equal(c.normalDamageExposure,.4);assert.equal(c.immuneRefractory,120);}
  const d=CellLabDisplay,p=d.normalizeColors({suppressive:{body:'#2244dd',nucleus:'#ffffff'}});assert.deepEqual(d.bodyColor(m),[99,152,210]);assert.deepEqual(d.bodyColor(m,p),[34,68,221]);assert.equal(d.nucleusStyle(m,p).stroke,'#ffffff');assert.equal(d.displayKind(m),7);
  const data={version:'4.0.0',scene:'empty',seed:17,boundary:'solid',worldWidth:96,worldHeight:72,refinement:1,settings:s.settings,sources:[{type:'normalDamage',x:20,y:20,radius:8},{type:'inhibition',x:25,y:20,radius:8}],display:{cellColors:p,signalLayers:['normalDamage','inhibition'],opacity:{normalDamage:.6,inhibition:.8}}};
  const parsed=CellLabExperiment.parse(data);assert.deepEqual(parsed.config.settings,s.settings);assert.deepEqual(parsed.display,data.display);assert.equal(parsed.config.sources.length,2);
  for(const text of ['免疫抑制样细胞','正常损伤暴露 23% · 局部抑制信号 0.123','转抑制态 3 · 损伤退激活 2 · 信号退激活 1'])assert.ok(!/[\p{Script=Han}]/u.test(CellLabI18n.translate(text,'en')));
});

test('suppression transitions and signals remain identical in JS and WASM',async()=>{
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),runs=[];
  for(const kernel of ['fast','wasm']){const s=make({damagePolarization:5,immuneRegulationMemory:100,immuneMotility:0},'solid',true);s.seed(3,25,30,5);s.seed(3,50,30,5);s.addSource(38,30,'normalDamage',30);if(kernel==='wasm')await CellLabWasm.install(s,module);s.advance(2000);runs.push(s);}
  assert.ok(runs[0].counters.suppressiveTransitions>0);assert.deepEqual(runs[0].snapshot().cells,runs[1].snapshot().cells);assert.deepEqual(runs[0].C.grid._pixels,runs[1].C.grid._pixels);assert.deepEqual(runs[0].counters,runs[1].counters);for(const k of ['normalDamage','inhibition'])assert.deepEqual(runs[0].fields[k].values,runs[1].fields[k].values);
});
