import {cognateCulture,peptide,receptor,trait} from './cognate-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for (const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/experiment.js']) vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
const make=(settings={},options={})=>cognateCulture(new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,seed:17,sectionModel:false,settings:{growth:1,apoptosis:0,metabolism:0,kill:0,immuneGrowth:1,mutation:0,...settings},...options}));
function body(s,kind,x,y,w,h){const id=s.C.makeNewCellID(kind);for(let xx=x;xx<x+w;xx++)for(let yy=y;yy<y+h;yy++)s.C.setpix([xx,yy],id);s.refreshPositions();s.scanContacts();return s.cells[id];}
function nutrients(s,value=1){s.fields.oxygen.values.fill(value);s.fields.glucose.values.fill(value);s.fields.acid.values.fill(value?0:.8);s.updateMetabolism(0);}
function contactPair(settings={}){const s=make({antigen:100,immuneGrowth:0,...settings}),t=body(s,2,35,25,18,18),m=body(s,3,53,27,12,14);return {s,t,m};}
function stimulate(s,steps){for(let i=0;i<steps;i++){s.updateLocal(1);s.biology(1);if(i%4===0)s.updateSignals(4);}}

test('large old tumor cells must traverse a cycle, not divide from area and age alone',()=>{
  const s=make(),m=body(s,2,30,22,20,20);m.target=m.base;m.age=9000;
  s.biology(1);assert.equal(s.counters.divisions,0);assert.equal(m.cycle?.phase,'G0');
});

test('well supplied tumors pass G1, S, G2 and M before physical cytokinesis',()=>{
  const s=make(),m=body(s,2,30,22,20,20);m.target=m.base;const stages=new Set();
  for(let i=0;i<700&&!s.counters.divisions;i++){s.biology(1);stages.add(m.cycle?.phase);}
  assert.ok(s.counters.divisions>0);for(const phase of ['G1','S','G2','M'])assert.ok(stages.has(phase),phase);
  for(const c of s.live()){assert.equal(c.cycle.phase,'G0');assert.equal(c.cycle.progress,0);assert.equal(s.components(c.id).length,1);}
});

test('tumor G0 is reversible and nutrient-dependent; its body and migration are retained',()=>{
  const s=make(),m=body(s,2,30,22,20,20);m.target=m.base;nutrients(s,0);
  for(let i=0;i<200;i++)s.biology(1);
  assert.equal(m.cycle?.phase,'G0');assert.equal(m.cycle?.arrest,'nutrients');assert.equal(s.counters.divisions,0);assert.equal(m.dying,false);assert.ok(m.drive>0);
  nutrients(s);for(let i=0;i<70;i++)s.biology(1);
  assert.notEqual(m.cycle.phase,'G0');assert.equal(m.cycle.arrest,'');
});

test('S-phase deprivation pauses progress and refeeding resumes the same phase',()=>{
  const s=make(),m=body(s,2,30,22,20,20);m.target=m.base;
  for(let i=0;i<700&&m.cycle?.phase!=='S';i++)s.biology(1);
  assert.equal(m.cycle?.phase,'S');const progress=m.cycle.progress;nutrients(s,0);
  for(let i=0;i<100;i++)s.biology(1);
  assert.equal(m.cycle.phase,'S');assert.equal(m.cycle.progress,progress);assert.equal(m.cycle.arrest,'nutrients');
  nutrients(s);s.biology(1);assert.equal(m.cycle.phase,'S');assert.ok(m.cycle.progress>progress);
});

test('acute injury checkpoints pause a tumor independently of oxygen or glucose',()=>{
  const s=make(),m=body(s,2,30,22,20,20);m.target=m.base;m.damage=.8;
  for(let i=0;i<100;i++)s.biology(1);
  assert.equal(m.cycle?.arrest,'injury');assert.equal(s.counters.divisions,0);
  m.damage=0;for(let i=0;i<70;i++)s.biology(1);assert.notEqual(m.cycle.phase,'G0');
});

test('mechanical compression arrests a licensed CTL without deleting previously grown biomass',()=>{
  const s=make(),m=body(s,3,30,25,10,10);m.antigenMemory=.9;s.fields.il2.values.fill(2);m.target=160;
  s.biology(20);assert.equal(m.cycle.arrest,'space');assert.equal(m.target,160);assert.equal(s.counters.divisions,0);
});

test('tumor compression can trigger reversible quiescence before the mechanical area floor',()=>{
  const s=make({}, {sectionModel:true}),m=body(s,2,30,25,10,10);
  m.sectionFraction=1-s.settings.sectionYield;m.target=100/(.85*m.sectionFraction);m.cycle.phase='G1';s.updateMechanics(m);
  assert.ok(s.C.getVolume(m.id)>m.minVisibleArea,'compression must lie inside the legal deformation range');
  const target=m.target;s.biology(80);
  assert.equal(m.cycle.phase,'G0');assert.equal(m.cycle.arrest,'space');assert.equal(m.target,target);
  // Restore occupied area in the free neighbouring region, retaining biomass.
  for(let x=40;x<42;x++)for(let y=25;y<35;y++)s.C.setpix([x,y],m.id);
  s.refreshPositions();for(let i=0;i<60;i++)s.biology(1);
  assert.equal(m.cycle.phase,'G1');assert.equal(m.cycle.arrest,'');assert.ok(m.target>=target);
});

test('recruitment, IL-2 or an activation timer alone cannot license CTL expansion',()=>{
  const s=make(),m=body(s,3,32,25,13,13);m.activation=10000;m.age=9000;m.target=m.base*1.7;
  assert.ok(s.fields.il2,'IL-2 must have its own concentration field');s.fields.trail.values.fill(30);s.fields.il2.values.fill(30);
  for(let i=0;i<600;i++)s.biology(1);
  assert.equal(s.counters.immuneDivisions,0);assert.equal(m.antigenMemory,0);assert.equal(m.cycle.phase,'G0');assert.equal(m.cycle.arrest,'antigen');
});

test('only real antigen contact establishes a persistent expansion memory and IL-2 source',()=>{
  const {s,m}=contactPair();const bystander=body(s,3,8,10,10,10);stimulate(s,120);
  assert.ok(m.antigenMemory>.3);assert.ok(m.il2Production>0);assert.ok(s.fields.il2.values.some(v=>v>0));assert.equal(bystander.antigenMemory,0);assert.equal(bystander.il2Production,0);
  const before=m.antigenMemory;s.moveCell(m.id,77,55);m.activation=0;s.updateLocal(1);s.biology(1);
  assert.equal(m.targetID,0);assert.ok(m.antigenMemory>before*.95);assert.ok(m.antigenMemory<before);
});

test('antigen-negative contact cannot license a CTL, even with abundant IL-2',()=>{
  const {s,m}=contactPair({antigen:0});assert.ok(s.fields.il2);s.fields.il2.values.fill(30);stimulate(s,200);
  assert.equal(m.antigenMemory,0);assert.equal(m.il2Production,0);assert.equal(m.cycle.phase,'G0');
});

test('a previously stimulated CTL divides after leaving antigen with IL-2 support; daughters inherit finite memory',()=>{
  const {s,m}=contactPair();stimulate(s,120);assert.ok(m.antigenMemory>.3);
  s.moveCell(m.id,77,55);m.activation=0;s.set('immuneGrowth',1);s.fields.il2.values.fill(2);const allowance=m.divisionsLeft,before=m.antigenMemory;
  for(let i=0;i<600&&!s.counters.immuneDivisions;i++){s.updateLocal(1);s.biology(1);}
  assert.equal(s.counters.immuneDivisions,1);const family=s.live().filter(c=>c.kind===3);
  assert.equal(family.length,2);for(const c of family){assert.equal(c.divisionsLeft,allowance-1);assert.ok(c.antigenMemory>0&&c.antigenMemory<before);assert.equal(c.cycle.phase,'G0');assert.equal(c.cycle.progress,0);}
  assert.notEqual(family[0].cycle,family[1].cycle);
});

test('IL-2 withdrawal and memory decay independently stop CTL cycle entry',()=>{
  const s=make({antigenMemory:6000}),m=body(s,3,30,25,13,13);assert.ok(m.cycle);m.antigenMemory=.9;
  for(let i=0;i<100;i++)s.biology(1);assert.equal(m.cycle.phase,'G0');assert.equal(m.cycle.arrest,'il2');
  s.fields.il2.values.fill(2);for(let i=0;i<40;i++)s.biology(1);assert.notEqual(m.cycle.phase,'G0');
  s.set('antigenMemory',100);for(let i=0;i<1200;i++)s.biology(1);
  assert.ok(m.antigenMemory<.01);assert.equal(m.cycle.phase,'G0');assert.equal(m.cycle.arrest,'antigen');
});

test('loss of antigen memory after S-phase commitment permits one supported cycle, not renewed licensing',()=>{
  const s=make(),m=body(s,3,30,25,13,13);m.cycle.phase='S';m.target=m.base*1.7;m.antigenMemory=.1;s.fields.il2.values.fill(2);
  for(let i=0;i<1600&&!s.counters.immuneDivisions;i++)s.biology(1);
  assert.equal(s.counters.immuneDivisions,1,'the committed cycle can finish without current antigen');
  for(let i=0;i<300;i++)s.biology(1);
  assert.ok(s.live().every(c=>c.cycle.phase==='G0'&&c.cycle.arrest==='antigen'));
});

test('chronic stimulation creates slow exhaustion; starvation alone does not',()=>{
  const {s,m}=contactPair();stimulate(s,3000);assert.ok(m.exhaustion>.2);const old=m.exhaustion;
  s.moveCell(m.id,77,55);nutrients(s);s.updateLocal(1);s.biology(1);assert.ok(m.exhaustion>old-.01,'refeeding does not erase exhaustion');
  const other=make(),q=body(other,3,30,25,12,12);nutrients(other,0);for(let i=0;i<500;i++)other.biology(1);assert.equal(q.exhaustion,0);
});

test('IL-2 is not a chemotactic cue and persistent IL-2 sources respect actual solid walls',()=>{
  const a=make(),b=make();const ma=body(a,3,20,25,10,10),mb=body(b,3,20,25,10,10);assert.ok(a.fields.il2);
  const f=a.fields.il2;for(let i=0;i<f.values.length;i++)f.values[i]=i%f.width;
  a.updatePolarity(4);b.updatePolarity(4);assert.equal(ma.px,mb.px);assert.equal(ma.py,mb.py);
  for(let y=0;y<a.height;y++)for(let x=44;x<52;x++)a.paint(x,y,0,false,false);a.rebuildMask();f.values.fill(0);
  assert.ok(a.addSource(20,36,'il2',8));for(let i=0;i<100;i++)a.updateSignals(4);
  assert.ok(f.values.some(v=>v>0));for(let y=0;y<f.height;y++)for(let x=13;x<f.width;x++)assert.equal(f.values[y*f.width+x],0);
});

test('cycle state changes resource demand without changing density or disabling GPU-compatible loads',()=>{
  const s=make(),m=body(s,2,30,22,20,20);assert.ok(m.cycle);s.prepareEnvironment();const resting=s.loads[2].reduce((a,b)=>a+b,0),density=s.fields.density.values.slice();
  m.cycle.phase='S';m.cycle.arrest='';s.prepareEnvironment();assert.ok(s.loads[2].reduce((a,b)=>a+b,0)>resting*1.4);assert.deepEqual(s.fields.density.values,density);
});

test('snapshots explain cycle stalls without changing model state and new controls/sources round-trip',()=>{
  const s=make(),m=body(s,3,30,25,12,12),snapshot=s.snapshot();assert.equal(snapshot.cells[0].cycle?.phase,'G0');assert.ok(snapshot.cycles?.immune);snapshot.cells[0].cycle.phase='M';assert.notEqual(m.cycle.phase,'M');
  const settings={...s.settings,tumorCycle:300,tumorQuiescence:1.5,immuneCycle:260,antigenMemory:900,il2Secretion:1.2,il2HalfLife:200,exhaustionRate:.8};
  const p=CellLabExperiment.parse({scene:'empty',seed:17,boundary:'solid',worldWidth:96,worldHeight:72,refinement:1,settings,sources:[{type:'il2',x:30,y:30,radius:8}],display:{signalLayers:['il2'],opacity:{il2:.6}}});
  assert.deepEqual(p.config.settings,settings);assert.equal(p.config.sources[0].type,'il2');assert.equal(p.display.opacity.il2,.6);
});
