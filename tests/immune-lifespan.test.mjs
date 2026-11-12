import {cognateCulture,peptide,receptor,trait} from './cognate-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/experiment.js','src/display-fields.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=limit=>cognateCulture(new CellLab.Simulation({width:96,height:72,scene:'empty',seed:17,warmup:0,sectionModel:false,settings:{immuneKillLimit:limit,metabolism:0,apoptosis:0,growth:0,immuneGrowth:0,antigen:100,kill:2,normalMutationGain:0,tumorMutationGain:0,antigenStressGain:0,contactEscape:0,signalEscape:0}}));
function body(s,kind,x,y,w=10,h=12){const id=s.C.makeNewCellID(kind);for(let xx=x;xx<x+w;xx++)for(let yy=y;yy<y+h;yy++)s.C.setpix([xx,yy],id);s.refreshPositions();s.scanContacts();return s.cells[id];}
function target(s,kind=2,x=30,y=24){const m=body(s,kind,x,y);if(kind===1)s.beginAbnormal(m.id);peptide(s,m,1);m.damage=.99;return m;}
function deliver(s,ctl,t){s.histories.set(ctl.id+':'+t.id,{ctl:ctl.id,target:t.id,dwell:20,recognized:true});s.immuneInteractions(1);}

test('the actual lethal contact credits one tumor and triggers immune shrinking at the limit',()=>{
  const s=make(1),ctl=body(s,3,20,24),t=target(s);deliver(s,ctl,t);
  assert.equal(t.deathCause,'kill');assert.equal(ctl.tumorKills,1);assert.equal(ctl.deathCause,'lifespan');assert.equal(ctl.deathPhase,'shrinking');
  assert.equal(t.deathRecord.killerBirth,ctl.birth);assert.equal(t.deathRecord.killerID,ctl.id);
  assert.equal(s.snapshot().cells.find(c=>c.id===ctl.id).tumorKills,1);
  assert.equal(CellLabDisplay.deathCode(ctl),1);assert.match(CellLabDisplay.deathPhaseLabel(ctl),/寿命/);
  s.advance(200);assert.equal(s.counters.lifespan,1);assert.equal(s.counters.kills,1);assert.equal(s.counters.apoptosis,0);
  assert.deepEqual(s.deathSummary().lifespan,{started:1,clearing:0,cleared:1});
});
test('two immune cells cannot count the same lethal target twice or repeat credit after clearance',()=>{
  const s=make(5),a=body(s,3,20,24),b=body(s,3,40,24),t=target(s);
  for(const ctl of [a,b])s.histories.set(ctl.id+':'+t.id,{ctl:ctl.id,target:t.id,dwell:20,recognized:true});
  s.immuneInteractions(1);s.immuneInteractions(100);assert.equal(a.tumorKills+b.tumorKills,1);assert.equal(s.counters.killStarted,1);
  s.advance(120);assert.equal(a.tumorKills+b.tumorKills,1);assert.equal(s.counters.kills,1);
});
test('no contact, antigen loss, abnormal-cell clearance and environmental death consume no tumor-kill budget',()=>{
  for(const mode of ['no-contact','antigen-negative','abnormal','environment']){
    const s=make(1),ctl=body(s,3,20,24),t=target(s,mode==='abnormal'?1:2,mode==='no-contact'?55:30);
    if(mode==='antigen-negative'){peptide(s,t,.01);}if(mode==='environment')s.beginDeath(t.id,'environment');deliver(s,ctl,t);
    assert.equal(ctl.tumorKills,0,mode);assert.equal(ctl.dying,false,mode);
  }
});
test('zero disables lifespan but still records kills; lowering the threshold acts at the next biological step',()=>{
  const s=make(0),ctl=body(s,3,20,24),t=target(s);deliver(s,ctl,t);assert.equal(ctl.tumorKills,1);assert.equal(ctl.dying,false);
  s.set('immuneKillLimit',1);s.biology(1);assert.equal(ctl.deathCause,'lifespan');s.biology(1);assert.equal(s.counters.lifespanStarted,1);
  s.eraseCell(ctl.id,{manual:true});assert.deepEqual(s.deathSummary().lifespan,{started:1,clearing:0,cleared:0});assert.equal(s.manualDeathRemovals.lifespan,1);
});
test('both newborn identities start their own kill counts, and exhausted cells cannot divide',()=>{
  const s=make(5),ctl=body(s,3,20,24,20,20);ctl.tumorKills=3;const parentBirth=ctl.birth,child=s.divide(ctl.id);assert.ok(child);
  assert.notEqual(ctl.birth,parentBirth);assert.equal(ctl.tumorKills,0);assert.equal(s.cells[child].tumorKills,0);
  ctl.tumorKills=5;assert.equal(s.divide(ctl.id),0);s.biology(1);assert.equal(ctl.deathCause,'lifespan');
});

test('lowering the lifespan limit prevents an additional lethal delivery before biology updates',()=>{
  const s=make(5),ctl=body(s,3,20,24),t=target(s);ctl.tumorKills=2;s.set('immuneKillLimit',2);deliver(s,ctl,t);
  assert.equal(ctl.deathCause,'lifespan');assert.equal(ctl.tumorKills,2);assert.equal(t.dying,false);assert.equal(s.counters.killStarted,0);
});
test('lifespan is an independent validated integer setting with a finite default',()=>{
  const s=make(10);assert.equal(s.settings.immuneKillLimit,10);const data={scene:'empty',seed:17,boundary:'wrap',refinement:1,worldWidth:96,worldHeight:72,settings:{immuneKillLimit:10}};
  assert.equal(CellLabExperiment.parse(data).config.settings.immuneKillLimit,10);
  for(const value of [-1,1.5,101,NaN])assert.throws(()=>CellLabExperiment.parse({...data,settings:{immuneKillLimit:value}}),/immuneKillLimit/);
});
