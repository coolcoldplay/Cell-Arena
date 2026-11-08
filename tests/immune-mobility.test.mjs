import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const settings={growth:2,metabolism:0,apoptosis:0,immuneGrowth:1,normalMotility:.1,tumorMotility:.35,immuneMotility:1.5,noise:0,alignment:0,cohesion:0,repulsion:0,antigen:0,chemotaxis:3};

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
