import {cognateCulture,peptide,receptor,trait} from './cognate-fixture.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const make=(settings={},options={})=>cognateCulture(new CellLab.Simulation({width:80,height:60,scene:'empty',warmup:0,seed:17,settings:{noise:0,metabolism:0,growth:0,apoptosis:0,immuneGrowth:0,...settings},...options}));
function touchingPair(s,kind=3){const a=s.seed(3,30,25,4),b=s.seed(kind,39,25,4);s.cells[a].px=0;s.cells[a].py=1;s.cells[b].px=1;s.cells[b].py=0;s.scanContacts();assert.ok(s.contacts.get(a).has(b));return [a,b];}
function fill(s,kind,x,y,w,h){const id=s.C.makeNewCellID(kind),points=[];for(let a=x;a<x+w;a++)for(let b=y;b<y+h;b++){s.C.setpix([a,b],id);points.push(s.C.grid.p2i([a,b]));}s.refreshPositions();assert.ok(s.section.initialize(s.cells[id],points));s.updateMechanics(s.cells[id]);return id;}

test('immune contact no longer has a constitutive adhesive reward; heterotypic and synapse adhesion stay unchanged',()=>{
  const s=make(),a=s.seed(3,15,15,4),b=s.seed(3,25,15,4),normal=s.seed(1,40,15,4),tumor=s.seed(2,55,15,4),j=s.C.getConstraint('Adhesion').J;
  assert.equal(j(a,b),j(a,0)+j(0,b));assert.equal(j(a,normal),9);assert.equal(j(a,tumor),9);
  s.cells[a].targetID=tumor;assert.equal(j(a,tumor),2);assert.equal(j(a,normal),9);assert.equal(j(a,b),34);
});
test('unactivated immune peers do not align even at maximum alignment, while normal cell alignment remains active',()=>{
  const s=make({alignment:3,repulsion:0,immuneSeparation:0,chemotaxis:0});const [a,b]=touchingPair(s);s.updatePolarity(4);
  assert.equal(s.cells[a].px,0);assert.equal(s.cells[a].py,1);assert.equal(s.cells[b].px,1);assert.equal(s.cells[b].py,0);
  const t=make({alignment:3,repulsion:0,immuneSeparation:3,cohesion:0}),n=t.seed(1,30,25,4),m=t.seed(1,39,25,4);t.cells[n].px=1;t.cells[n].py=0;t.cells[m].px=0;t.cells[m].py=1;t.scanContacts();t.updatePolarity(4);assert.ok(t.cells[n].py>0&&t.cells[m].px>0);
});
test('immune peer separation turns cells away from one another, independently of ordinary collision settings',()=>{
  const s=make({alignment:0,repulsion:0,immuneSeparation:1,chemotaxis:0}),[a,b]=touchingPair(s);s.cells[b].px=0;s.cells[b].py=1;s.updatePolarity(4);
  assert.ok(s.cells[a].px<0);assert.ok(s.cells[b].px>0);assert.equal(s.cells[a].immuneCue,0);
  for(const peer of [1,2]){const x=make({immuneSeparation:0}),y=make({immuneSeparation:3});touchingPair(x,peer);touchingPair(y,peer);x.updateLocal(4);y.updateLocal(4);assert.deepEqual(x.snapshot().cells.map(c=>[c.px,c.py,c.damage,c.targetID]),y.snapshot().cells.map(c=>[c.px,c.py,c.damage,c.targetID]));}
});
test('peer compression restores searching patrol under strong recruitment without desensitizing isolated cells or real synapses',()=>{
  const run=(pressure,kind=3,phase='search',motility=1)=>{
    const s=make({chemotaxis:3,immuneMotility:motility}),[a,b]=touchingPair(s,kind),m=s.cells[a];
    const f=s.fields.trail;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=x;
    m.sectionPressure=pressure;m.phase=phase;m.targetID=phase==='search'?0:b;
    s.updatePolarity(4);return {s,m};
  };
  const free=run(0),crowded=run(1),tissue=run(1,1);
  assert.ok(crowded.m.immuneCue<free.m.immuneCue);assert.ok(crowded.m.patrolMotion.hy>free.m.patrolMotion.hy);
  assert.equal(tissue.m.immuneCrowding,0);assert.equal(tissue.m.immuneCue,free.m.immuneCue);
  for(const phase of ['scan','kill']){const a=run(0,3,phase),b=run(1,3,phase);assert.equal(b.m.immuneCrowding,0);assert.equal(b.m.immuneCue,a.m.immuneCue);assert.equal(b.m.px,a.m.px);assert.equal(b.m.py,a.m.py);}
  assert.equal(run(1,3,'search',0).m.drive,0,'crowding does not create motility when disabled');
});
test('either local damage or recruitment gradients attract an unrecognized patrol, but never make it a recruiter',()=>{
  for(const channel of ['danger','trail']){const s=make({alignment:3,chemotaxis:2}),id=s.seed(3,25,25,4),m=s.cells[id];m.px=0;m.py=1;
    const f=s.fields[channel];for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=x*.05;
    s.updateLocal(4);assert.ok(m.px>0);assert.ok(m.immuneCue>0);assert.equal(m.phase,'search');assert.equal(m.targetID,0);assert.equal(m.activation,0);assert.equal(m.recruitment,0);assert.equal(s.counters.recognitions,0);
    s.fields.trail.values.fill(0);s.updateSignals(4);assert.ok(s.fields.trail.values.every(v=>v===0),'responders do not relay recruitment');
  }
});
test('recognition of abnormal or tumor contact is still required for secretion; neighboring immune responders do not relay',()=>{
  for(const kind of [1,2]){const s=make({kill:0,antigen:100}),target=s.seed(kind,30,25,5),ctl=s.seed(3,40,25,4),peer=s.seed(3,49,25,4);if(kind===1)s.beginAbnormal(target);peptide(s,s.cells[target],.5);
    s.updateLocal(4);s.updateSignals(4);assert.equal(s.cells[ctl].phase,'scan');assert.equal(s.cells[ctl].recruitment,0);assert.ok(s.fields.trail.values.every(v=>v===0));
    for(let n=0;n<40;n++)s.updateLocal(4);s.updateSignals(4);assert.ok(s.cells[ctl].recruitment>0);assert.ok(s.fields.trail.values.some(v=>v>0));assert.equal(s.cells[peer].recruitment,0);assert.equal(s.cells[peer].activation,0);
  }
});
test('peer separation cannot turn a scanning or killing immune cell away from its real antigen contact',()=>{
  for(const dt of [1,40]){const makeContacts=amount=>{const s=make({immuneSeparation:amount,antigen:100,kill:.5}),t=fill(s,2,20,20,8,16),a=fill(s,3,28,20,8,8),b=fill(s,3,28,28,8,8);peptide(s,s.cells[t],1);s.cells[a].px=0;s.cells[a].py=1;s.cells[b].px=1;s.cells[b].py=0;s.updateLocal(dt);return s;};
    const a=makeContacts(0),b=makeContacts(3);assert.equal(a.cells[2].phase,dt===1?'scan':'kill');assert.deepEqual(a.snapshot().cells.map(c=>[c.px,c.py,c.damage,c.targetID,c.recruitment]),b.snapshot().cells.map(c=>[c.px,c.py,c.damage,c.targetID,c.recruitment]));
  }
});
test('new immune daughters need their own antigen recognition before secreting, while activation and division budget still inherit',()=>{
  const s=make({antigen:100,kill:0}),ctl=fill(s,3,20,20,16,12),target=fill(s,2,36,20,8,12);peptide(s,s.cells[target],1);s.updateLocal(20);assert.ok(s.cells[ctl].recruitment>0);
  const child=s.divide(ctl);assert.ok(child);assert.ok(s.cells[child].activation>0);assert.equal(s.cells[child].divisionsLeft,s.cells[ctl].divisionsLeft);assert.equal(s.cells[child].recruitment,0);
  s.eraseCell(ctl);s.eraseCell(target);s.fields.trail.values.fill(0);s.updateSignals(4);assert.ok(s.fields.trail.values.every(v=>v===0));
});
test('WASM receives the new immune interface energy and preserves JS trajectories with runtime peer separation changes',async()=>{
  const a=make(),b=make();for(const s of [a,b]){touchingPair(s);s.seed(1,30,39,6);s.seed(2,50,39,6);}const wasm=await CellLabWasm.install(b,module);
  for(let step=0;step<100;step++){if(step===50)for(const s of [a,b])s.set('immuneSeparation',2.5);wasm.sync();
    for(const tgt of a.C.borderpixels.elements.slice(0,100))for(const src of a.neighbors[tgt]){const x=a.C.pixti(src),y=a.C.pixti(tgt);if(x===y)continue;assert.ok(Math.abs(a.C.deltaH(src,tgt,x,y)-wasm.e.energy(src,tgt,x,y))<1e-8);}
    a.advance(1);b.advance(1);assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.contacts,b.contacts);
  }
  assert.deepEqual(a.snapshot().cells,b.snapshot().cells);assert.deepEqual(Uint32Array.from(a.C.mt.mt),Uint32Array.from(b.C.mt.mt));
});
