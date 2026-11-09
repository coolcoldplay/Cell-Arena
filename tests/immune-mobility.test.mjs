import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const settings={growth:2,metabolism:0,apoptosis:0,immuneGrowth:1,normalMotility:.1,tumorMotility:.35,immuneMotility:1.5,noise:0,alignment:0,cohesion:0,repulsion:0,antigen:0,chemotaxis:3};

test('immune motility biases rear withdrawal as well as front protrusion, with the same metabolic and synapse gating',()=>{
  const s=new CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0}),id=s.seed(3,30,24,5),m=s.cells[id],d=s.C.soft_constraints.find(c=>c.constructor.name==='LocalDirection');
  m.px=1;m.py=0;const at=x=>s.C.grid.p2i([x,24]);
  for(const [fitness,target]of [[1,0],[.2,0],[1,99]]){m.fitness=fitness;m.targetID=target;s.updateMechanics(m);
    assert.ok(d.deltaH(at(24),at(25),0,id)<0,'a rear pixel may retract into the neighbouring medium');
    assert.equal(d.deltaH(at(24),at(25),0,id),d.deltaH(at(35),at(36),id,0));
    assert.ok(d.deltaH(at(36),at(35),0,id)>0,'front withdrawal opposes polarity');
  }
  s.settings.immuneMotility=0;s.updateMechanics(m);assert.equal(d.deltaH(at(24),at(25),0,id),0);
});
test('solid wall contact is mechanical confinement and never an antigen contact',async()=>{
 for(const wasm of [false,true]){const s=new CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0}),id=s.seed(3,30,24,3);
  for(let y=16;y<=32;y++)s.paint(34,y,0);if(wasm)await CellLabWasm.install(s,module);s.scanContacts();s.immuneInteractions(20);
  assert.ok(s.cells[id].confinement>0,'a narrow solid channel must relax the soft cortex too');assert.equal(s.cells[id].activation,0);assert.equal(s.histories.size,0);
 }
});
test('basal patrol explores new neighbours in a fully occupied healthy monolayer without a target or imposed gradient',async t=>{
  const s=new CellLab.Simulation({scene:'oncogenesis',worldWidth:240,worldHeight:180,refinement:1,settings:{metabolism:0,stressMutation:0,progression:0,immuneGrowth:0}});
  await CellLabWasm.install(s,module);const count=s.live().length,tracks=s.live().filter(c=>c.kind===3).map(c=>({id:c.id,x:c.nucleusX,y:c.nucleusY,span:0,seen:new Set()}));
  for(let n=0;n<800;n++){s.advance(1);for(const p of tracks){const m=s.cells[p.id];p.span=Math.max(p.span,Math.hypot(m.nucleusX-p.x,m.nucleusY-p.y));for(const id of s.contacts.get(m.id)?.keys()||[])p.seen.add(id);}}
  t.diagnostic(JSON.stringify(tracks.map(p=>({id:p.id,range:p.span,neighbours:p.seen.size}))));
  for(const p of tracks){assert.ok(p.span>14,`patrol ${p.id} range ${p.span}`);assert.ok(p.seen.size>=6,'patrol must change contact partners, not just wobble');}
  assert.equal(s.live().length,count);assert.equal(s.counters.recognitions,0);assert.equal(s.counters.kills,0);
  for(const m of s.live()){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));assert.ok(m.sectionFraction>=1-s.settings.sectionYield);}
});

test('compressed cells do not manufacture additional target mass and ratchet their hard area floor above occupied space',()=>{
  for(const kind of [1,2,3]){
    const s=new CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0,settings}),id=s.seed(kind,25,25,5),m=s.cells[id];
    m.target=kind===1?m.base*.7:kind===2?m.base*.55:m.base*1.6;m.activation=300;m.sectionFraction=.85;s.updateMechanics(m);
    const before=m.target,minArea=m.minVisibleArea;assert.ok(s.C.getVolume(id)<m.planarTarget*.9);
    s.biology(20);assert.equal(m.target,before,`kind ${kind} cannot grow without mechanical space`);assert.equal(m.minVisibleArea,minArea);assert.equal(m.target,m.planarTarget+m.offPlaneTarget);
  }
});

test('tissue can become confluent without irreversibly pinning a healthy immune patrol at minimum-area floors',async t=>{
  const s=new CellLab.Simulation({width:96,height:72,scene:'empty',boundary:'wrap',warmup:0,seed:17,settings:{...settings,immuneGrowth:0}});
  for(let y=0;y<72;y+=12)for(let x=0;x<96;x+=12){const id=s.C.makeNewCellID(2),points=[];
    for(let a=x;a<x+12;a++)for(let b=y;b<y+12;b++)if(Math.hypot(a-24,b-36)>6){s.C.setpix([a,b],id);points.push(s.C.grid.p2i([a,b]));}
    const m=s.cells[id];m.target=s.C.getVolume(id);m.genome.antigen=0;s.applyGenome(m);s.refreshPositions();assert.ok(s.section.initialize(m,points));s.updateMechanics(m);
  }
  const ctl=s.seed(3,24,36,5),m=s.cells[ctl];m.px=1;m.py=0;m.divisionsLeft=0;s.scanContacts();await CellLabWasm.install(s,module);
  const advance=n=>{for(let step=0;step<n;step++){const f=s.fields.danger;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=x*.1;s.advance(1);}};
  advance(400);let distance=0,px=m.nucleusX,py=m.nucleusY;
  for(let step=0;step<150;step++){advance(1);distance+=Math.hypot(s.section.delta(m.nucleusX-px,s.width),s.section.delta(m.nucleusY-py,s.height));px=m.nucleusX;py=m.nucleusY;}
  t.diagnostic(`Immune nuclear path over 150 MCS: ${distance} lattice units; lineage divisions remaining: ${m.divisionsLeft}`);
  assert.ok(m.fitness>.99);assert.equal(m.targetID,0);assert.equal(m.divisionsLeft,0);assert.ok(distance>5,`healthy, searching nucleus traveled only ${distance} lattice units in 150 MCS`);
  assert.equal(s.counters.kills,0);assert.equal(s.counters.environment,0);assert.equal(s.snapshot().orphans,0);
  for(const c of s.live()){assert.ok(s.section.fits(c,c.nucleusX,c.nucleusY));assert.equal(s.components(c.id).length,1);}
});
