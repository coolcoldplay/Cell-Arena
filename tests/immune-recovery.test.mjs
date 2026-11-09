import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js','src/experiment.js','src/i18n.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(settings={})=>new CellLab.Simulation({width:96,height:72,scene:'empty',seed:17,warmup:0,sectionModel:false,settings:{metabolism:0,apoptosis:0,growth:0,immuneGrowth:0,mutation:0,normalMutationGain:0,tumorMutationGain:0,antigenStressGain:0,contactEscape:0,signalEscape:0,antigen:100,kill:0,noise:0,...settings}});
function body(s,kind,x,y,w=12,h=12){const id=s.C.makeNewCellID(kind);for(let xx=x;xx<x+w;xx++)for(let yy=y;yy<y+h;yy++)s.C.setpix([xx,yy],id);s.refreshPositions();s.scanContacts();return s.cells[id];}

test('blue recovery waits for both current normal injury and accumulated exposure to fall',()=>{
  const s=make(),m=body(s,3,25,25);m.immunePhenotype='suppressive';m.normalDamageExposure=1;m.antigenMemory=.8;m.exhaustion=.4;s.C.random=()=>0;
  s.fields.normalDamage.values.fill(30);s.immuneRegulation(1000);assert.equal(m.immunePhenotype,'suppressive');
  s.fields.normalDamage.values.fill(0);s.immuneRegulation(1);assert.equal(m.immunePhenotype,'suppressive','memory prevents immediate recovery after source removal');
  s.fields.inhibition.values.fill(30);s.immuneRegulation(600);
  assert.equal(m.immunePhenotype,'cytotoxic');assert.equal(m.activation,0);assert.equal(m.recruitment,0);assert.equal(m.il2Production,0);assert.equal(m.immuneRefractory,240);
  assert.equal(m.antigenMemory,.8);assert.equal(m.exhaustion,.4);assert.equal(s.counters.suppressiveRecoveries,1);
  s.fields.inhibition.values.fill(0);s.updateSignals(4);assert.ok(s.fields.inhibition.values.every(v=>v===0),'recovered cells stop secreting suppression');
  m.immunePhenotype='suppressive';m.normalDamageExposure=0;s.fields.normalDamage.values.fill(30);s.immuneRegulation(1);assert.equal(m.immunePhenotype,'suppressive','new strong injury also blocks recovery');
});

test('recovery multiplier changes stochastic incidence; zero, paused and dying states do not recover',()=>{
  const count=rate=>{const s=make({suppressionRecovery:rate}),m=body(s,3,20,20);for(let n=0;n<2000;n++){m.immunePhenotype='suppressive';m.normalDamageExposure=0;s.immuneRegulation(40);}return s.counters.suppressiveRecoveries;};
  assert.equal(count(0),0);const baseline=count(1),fast=count(5);assert.ok(baseline>30&&baseline<150);assert.ok(fast>baseline*3&&fast<700);
  const s=make({suppressionRecovery:5}),m=body(s,3,20,20);m.immunePhenotype='suppressive';s.C.random=()=>0;
  const before=JSON.stringify(m);s.immuneRegulation(0);assert.equal(JSON.stringify(m),before);
  s.beginDeath(m.id,'environment');s.immuneRegulation(1000);assert.equal(m.immunePhenotype,'suppressive');assert.equal(s.counters.suppressiveRecoveries,0);
});

test('blue cells choose normal injury over opposed generic danger and recruitment gradients',()=>{
  for(const phenotype of ['suppressive','cytotoxic']){const s=make(),m=body(s,3,35,25);m.immunePhenotype=phenotype;m.px=0;m.py=1;
    for(const key of ['normalDamage','danger','trail']){const f=s.fields[key];for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=(key==='normalDamage'?x:f.width-x)*.2;}
    s.updatePolarity(4);assert.ok(phenotype==='suppressive'?m.px>0:m.px<0);assert.ok(m.immuneCue>0);assert.equal(m.targetID,0);assert.equal(m.activation,0);
  }
});

test('unrecognizable tumor and abnormal bodies emit no constitutive tracking cue',()=>{
  for(const kind of [1,2]){const s=make(),m=body(s,kind,30,30);if(kind===1)s.beginAbnormal(m.id);s.changeAntigen(m,.8,'exposure');s.updateSignals(4);assert.ok(s.fields.danger.values.some(v=>v>0));
    s.changeAntigen(m,.05,'escape');s.fields.danger.values.fill(0);s.updateSignals(100);assert.ok(s.fields.danger.values.every(v=>v===0),'antigen loss stops the moving source');
    s.pulse(20,20,'danger');s.updateSignals(4);assert.ok(s.fields.danger.values.some(v=>v>0),'independent local injury cues remain available');
  }
});

test('antigen loss clears binding and recruitment immediately through escape and genome mutation',()=>{
  for(const route of ['escape','genome']){const s=make(),m=body(s,2,30,30),ctl=body(s,3,42,30);s.immuneInteractions(100);assert.equal(ctl.targetID,m.id);assert.ok(ctl.recruitment>0);
    ctl.antigenMemory=.8;m.damage=.6;s.fields.trail.values.fill(2);const grid=s.C.grid._pixels.slice(),trail=s.fields.trail.values.slice();
    if(route==='escape')s.changeAntigen(m,.05,'escape');else{m.genome.antigen=.05;s.applyGenome(m);}
    assert.equal(ctl.targetID,0);assert.equal(ctl.phase,'search');assert.equal(ctl.recruitment,0);assert.equal(s.histories.size,0);assert.equal(ctl.antigenMemory,.8);assert.equal(m.damage,.6);
    assert.deepEqual(s.C.grid._pixels,grid);assert.deepEqual(s.fields.trail.values,trail,'released signals decay rather than being globally erased');
    const recognitions=s.counters.recognitions;s.set('kill',2);s.immuneInteractions(4);assert.equal(s.counters.recognitions,recognitions);assert.equal(ctl.targetID,0);assert.ok(m.damage<=.6);
    s.fields.trail.values.fill(0);s.updateSignals(4);assert.ok(s.fields.trail.values.every(v=>v===0),'no fresh target-derived recruitment after antigen loss');
  }
});

test('antigen loss cancels recent recruitment after detachment without cancelling another valid target',()=>{
  const s=make(),a=body(s,2,10,10),ca=body(s,3,22,10),b=body(s,2,55,45),cb=body(s,3,67,45);s.immuneInteractions(100);
  s.contacts.get(ca.id).clear();s.immuneInteractions(1);assert.equal(ca.targetID,0);assert.ok(ca.recruitment>0);
  s.changeAntigen(a,.05,'escape');assert.equal(ca.recruitment,0);assert.equal(cb.targetID,b.id);assert.ok(cb.recruitment>0);
});

test('recovery control round trips, validates bounds and exposes translated readouts',()=>{
  const s=make({suppressionRecovery:2.5}),data={version:'4.0.0',scene:'empty',seed:17,boundary:'solid',worldWidth:96,worldHeight:72,refinement:1,settings:s.settings};
  const parsed=CellLabExperiment.parse(data);assert.equal(parsed.config.settings.suppressionRecovery,2.5);assert.throws(()=>CellLabExperiment.parse({...data,settings:{suppressionRecovery:6}}));
  s.set('suppressionRecovery',-1);assert.equal(s.settings.suppressionRecovery,0);s.set('suppressionRecovery',6);assert.equal(s.settings.suppressionRecovery,5);
  for(const text of ['抑制态恢复速度','恢复静息态 3'])assert.ok(!/[\p{Script=Han}]/u.test(CellLabI18n.translate(text,'en')));
});
