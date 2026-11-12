import {cognateCulture,peptide,receptor,trait} from './cognate-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/experiment.js','src/i18n.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const off={normalMutationGain:0,tumorMutationGain:0,antigenStressGain:0,contactEscape:0,signalEscape:0};
const make=(settings={})=>cognateCulture(new CellLab.Simulation({width:128,height:96,scene:'empty',seed:17,warmup:0,sectionModel:false,settings:{growth:0,immuneGrowth:0,apoptosis:0,metabolism:0,stressMutation:0,inflammation:0,progression:0,kill:0,mutation:0,...off,...settings}}));
function body(s,kind,x,y,w=12,h=12){const id=s.C.makeNewCellID(kind);for(let xx=x;xx<x+w;xx++)for(let yy=y;yy<y+h;yy++)s.C.setpix([xx,yy],id);s.refreshPositions();s.scanContacts();return s.cells[id];}
function expose(s,steps,dt=4){for(let n=0;n<steps;n++){s.C.time+=dt;for(const m of s.live())s.evolutionStep(m,dt);}}

test('local nutrient/acid stress and sustained existing inflammation raise pressure and variation',()=>{
  const run=hostile=>{const s=make({normalMutationGain:8,tumorMutationGain:8,mutation:80});
    for(let y=10;y<85;y+=18)for(let x=10;x<115;x+=18)body(s,x%2?1:2,x,y,8,8);
    // Alternate kinds explicitly; sites stay identical between controls.
    for(const [i,m]of s.live().entries())if(i%2){s.C.setCellKind(m.id,1);m.kind=1;m.state='normal';m.genome=null;}
    s.fields.oxygen.values.fill(hostile?.1:1);s.fields.glucose.values.fill(hostile?.1:1);s.fields.acid.values.fill(hostile?.7:0);s.updateMetabolism(0);
    expose(s,500);assert.equal(s.immunity.metrics.geneticChanges,0,'interphase exposure is regulation, not a division mutation');
    for(const m of s.live())for(let n=0;n<30;n++){const daughter={...m,expression:structuredClone(m.expression)};s.immunity.inherit(daughter,m.geneClone,m.expression);}return s;};
  const healthy=run(false),stress=run(true);
  assert.equal(healthy.counters.stressMutations,0);assert.equal(healthy.counters.normalTraitMutations,0);
  assert.ok(stress.immunity.metrics.geneticChanges>healthy.immunity.metrics.geneticChanges);
  const s=make(),near=body(s,2,10,15),far=body(s,2,85,65);for(const [bin]of near.fieldBins)s.fields.danger.values[bin]=5;expose(s,200);
  assert.ok(near.mutationPressure>.3);assert.equal(far.mutationPressure,0);
  assert.equal(near.damage,0,'a danger field is not delivered cytotoxic damage');
});

test('normal transformation amplification retains both independently switchable initiation gates',()=>{
  const risk=gain=>{const s=make({normalMutationGain:gain,stressMutation:1});let n=0;
    for(let i=0;i<1000;i++){const m={kind:1,dying:false,state:'normal',adversity:.8,stress:.3,inflammatoryExposure:0};s.beginAbnormal=()=>{n++;};s.transformation(m,4,true);}return n;};
  assert.ok(risk(12)>risk(0));
  const s=make({normalMutationGain:12}),m=body(s,1,20,20);m.adversity=1;m.stress=1;s.fields.danger.values.fill(30);
  for(let i=0;i<500;i++)s.transformation(m,4);assert.equal(m.state,'normal');
});

test('adaptation bias reverses tolerance changes; traits stay bounded and are inherited',()=>{
  for(const bias of [-100,100]){const s=make({mutation:100,mutationBias:bias,mutationSize:.2}),m=body(s,2,20,20,22,20);m.adversity=.8;m.immuneContactMemory=.5;
    const before={tolerance:1,proliferation:1,invasion:1,antigen:.5},g=s.mutate(before,m);
    assert.equal(g.tolerance>1,bias>0);assert.equal(g.invasion>1,bias>0);assert.equal(g.proliferation<1,bias>0);assert.ok(g.antigen>=0&&g.antigen<=1);assert.deepEqual(before,{tolerance:1,proliferation:1,invasion:1,antigen:.5});
    s.immunity.alter(m,d=>{d.traits=g;});m.normalTolerance=1.3;m.recruitmentExposure=.6;m.immuneContactMemory=.8;s.set('mutation',0);
    const child=s.divide(m.id);assert.ok(child);
    for(const c of s.live()){assert.deepEqual(c.genome,g);assert.equal(c.normalTolerance,1.3);assert.equal(c.recruitmentExposure,.3);assert.equal(c.immuneContactMemory,.4);assert.equal(c.immuneEncounters,0);}
    s.set('mutation',100);for(let n=0;n<100;n++)m.genome=s.mutate(m.genome,m);for(const [k,v]of Object.entries(m.genome))assert.ok(v>=(k==='antigen'?0:.25)&&v<=(k==='antigen'?1:3));
  }
});

test('effective real contacts count once per encounter, not each tick or brief membrane flicker',()=>{
  const s=make({antigen:100}),target=body(s,2,30,30),ctl=body(s,3,42,30),far=body(s,2,85,60);
  s.immuneInteractions(0);assert.equal(target.immuneEncounters,0);
  for(let n=0;n<30;n++)s.immuneInteractions(4);assert.equal(target.immuneEncounters,1);assert.equal(far.immuneEncounters,0);
  s.contacts.get(ctl.id).clear();s.immuneInteractions(1);s.scanContacts();s.immuneInteractions(8);assert.equal(target.immuneEncounters,1);
  s.contacts.get(ctl.id).clear();s.immuneInteractions(24);s.scanContacts();s.immuneInteractions(8);assert.equal(target.immuneEncounters,2);assert.ok(target.immuneContactMemory>.18);
  ctl.fitness=0;s.contacts.get(ctl.id).clear();s.immuneInteractions(30);s.scanContacts();s.immuneInteractions(30);assert.equal(target.immuneEncounters,2);
});

test('recruitment exposure integrates duration then decays, separately from danger and IL-2',()=>{
  const s=make({evolutionMemory:200}),m=body(s,2,20,20);m.immuneContactMemory=1;s.fields.trail.values.fill(3);
  expose(s,1);const short=m.recruitmentExposure;expose(s,49);assert.ok(m.recruitmentExposure>short*10);assert.ok(Math.abs(m.immuneContactMemory-.5)<1e-12);
  const peak=m.recruitmentExposure;s.fields.trail.values.fill(0);s.fields.danger.values.fill(30);s.fields.il2.values.fill(30);expose(s,50);assert.ok(m.recruitmentExposure<peak*.4);
  assert.ok(m.inflammatoryExposure>.5);const a=make(),n=body(a,2,20,20);a.fields.il2.values.fill(30);expose(a,100);assert.equal(n.mutationPressure,0);assert.equal(n.recruitmentExposure,0);
});

test('disabled routes, paused time, dying cells and CTLs do not receive random evolution events',()=>{
  const s=make(),m=body(s,2,20,20),ctl=body(s,3,70,50);m.adversity=1;m.immuneContactMemory=1;s.fields.trail.values.fill(30);
  const rng=()=>JSON.stringify([s.C.mt.mt,s.C.mt.mti]);const before=rng();expose(s,100);assert.equal(rng(),before);assert.equal(s.counters.antigenEscapes,0);
  s.set('tumorMutationGain',12);s.set('mutation',100);s.set('antigenStressGain',5);s.set('contactEscape',5);s.set('signalEscape',5);
  const paused=JSON.stringify(m),r=rng();s.evolutionStep(m,0);assert.equal(JSON.stringify(m),paused);assert.equal(rng(),r);
  s.beginDeath(m.id,'environment');const dead=JSON.stringify(m),immune=JSON.stringify(ctl),r2=rng();s.evolutionStep(m,100);s.evolutionStep(ctl,100);assert.equal(JSON.stringify(m),dead);assert.equal(JSON.stringify(ctl),immune);assert.equal(rng(),r2);
});

test('reversible presentation loss stops contact damage without rewriting inheritance or healing damage',()=>{
  const s=make({antigen:100,contactEscape:5,signalEscape:5}),m=body(s,2,30,30),ctl=body(s,3,42,30);peptide(s,m,1);
  s.immuneInteractions(30);assert.equal(ctl.targetID,m.id);const genes=s.immunity.genes(m);
  m.damage=.75;ctl.antigenMemory=.8;m.immuneContactMemory=1;m.recruitmentExposure=1;s.immunity.express(m,1600);
  assert.equal(m.antigen,false);assert.equal(s.immunity.genes(m),genes);assert.equal(ctl.targetID,0);assert.equal(m.damage,.75);assert.equal(ctl.antigenMemory,.8);
  m.immuneContactMemory=0;m.recruitmentExposure=0;s.immunity.express(m,1600);assert.ok(m.antigen);assert.equal(s.immunity.genes(m),genes);
  s.beginDeath(m.id,'kill');s.evolutionStep(m,1000);assert.ok(m.dying);
});

test('new controls round trip parameter files, validate bounds and translate in both languages',()=>{
  const s=make({mutationBias:-35,normalMutationGain:7.5,tumorMutationGain:4,antigenStressGain:1.5,contactEscape:.35,signalEscape:.2,evolutionMemory:1200});
  const data={version:'4.0.0',scene:'empty',seed:17,boundary:'solid',worldWidth:128,worldHeight:96,refinement:1,settings:s.settings};
  const restored=CellLabExperiment.parse(JSON.parse(JSON.stringify(data)));assert.deepEqual(restored.config.settings,s.settings);
  for(const [key,value]of [['mutationBias',101],['normalMutationGain',13],['tumorMutationGain',-1],['contactEscape',6],['signalEscape',-1],['evolutionMemory',0]])assert.throws(()=>CellLabExperiment.parse({...data,settings:{[key]:value}}));
  for(const text of ['突变与抗原演化','突变适应偏向','环境致变压力 52%','有效免疫接触 3 次 · 接触选择记忆 40%']){assert.equal(CellLabI18n.translate(text,'zh'),text);assert.ok(!/[\p{Script=Han}]/u.test(CellLabI18n.translate(text,'en')));}
});
