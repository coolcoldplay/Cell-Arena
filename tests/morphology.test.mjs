import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const setup=(mode=2,boundary='solid')=>new CellLab.Simulation({width:120,height:90,scene:'empty',warmup:0,seed:29,boundary,settings:{tumorMorphology:mode,branchLength:2.8,branchStrength:5,networkAdhesion:1,growth:0,apoptosis:0,tumorMotility:.12,metabolism:0}});
test('shape modes use finite evolving protrusions, preserve nucleus and other cell mechanics',()=>{
  const s=setup(),id=s.seed(2,55,45,7),m=s.cells[id];
  s.advance(8);assert.equal(m.morphologyMode,2);assert.ok(m.protrusions.length>=1&&m.protrusions.length<=2);
  assert.equal(s.section.shapePenalty(m,m.nucleusX,m.nucleusY),0);
  assert.ok(s.section.shapePenalty(m,m.nucleusX+m.maxReach+5,m.nucleusY)>10);
  const normal=s.seed(1,22,20,7),immune=s.seed(3,90,65,4);
  assert.equal(s.cells[normal].branchCount,0);assert.equal(s.cells[immune].branchCount,0);
  const mass=m.target;s.set('tumorMorphology',1);s.advance(8);assert.equal(m.branchCount,2);assert.equal(m.target,mass);
  s.set('tumorMorphology',0);assert.equal(m.branchCount,0);assert.equal(m.target,mass);
});
test('network bonds require sustained shared membrane, break on separation and death, never span medium',()=>{
  const s=setup(),a=s.seed(2,35,45,7),b=s.seed(2,49,45,6),c=s.seed(2,85,45,6);
  s.C.setpix([42,44],a);s.C.setpix([43,44],b);
  s.refreshPositions();s.scanContacts();const original=[s.cells[b].x,s.cells[b].y];assert.ok(s.contacts.get(a).get(b).length>=2);
  s.section.updateJunctions(0);assert.equal(s.section.bond(a,b),0);
  s.section.updateJunctions(60);assert.ok(s.section.bond(a,b)>0);assert.equal(s.section.bond(a,c),0);
  assert.equal(s.cells[a].networkDegree,1);
  s.moveCell(b,65,45);assert.equal(s.section.bond(a,b),0);
  s.moveCell(b,...original);s.scanContacts();s.section.updateJunctions(60);assert.ok(s.section.bond(a,b)>0);
  s.beginDeath(a,'kill');assert.equal(s.section.bond(a,b),0);assert.equal(s.cells[b].networkDegree,0);
});
test('branched bodies grow real protrusions without crossing a wall, fragmenting or exposing their nuclei',()=>{
  const s=setup(),id=s.seed(2,49,45,7),m=s.cells[id];
  for(let y=0;y<s.height;y++)s.paint(72,y,1,false,false);s.rebuildMask();
  let radius=0;
  for(let t=0;t<850;t+=10){s.advance(10);assert.equal(s.components(id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));for(const [p,c] of s.C.pixels())if(c===id){assert.ok(p[0]<72,'solid wall blocks every protrusion');radius=Math.max(radius,Math.hypot(p[0]-m.nucleusX,p[1]-m.nucleusY));}}
  assert.ok(radius>13,`visible protrusion length ${radius}`);
});
test('protrusion counts vary, tips turn and existing processes can fork instead of repeating a fixed Y template',()=>{
  const s=new CellLab.Simulation({width:180,height:135,scene:'network',warmup:0,seed:17,settings:{growth:0,apoptosis:0,metabolism:0}});s.advance(650);
  const counts=new Set(s.live().map(m=>m.branchCount));assert.ok(counts.size>=3,`distinct counts: ${[...counts]}`);
  let curved=0,forked=0;for(const m of s.live())for(const p of m.protrusions){if(p.parent)forked++;for(let i=2;i<p.points.length;i++){const [a,b,c]=p.points.slice(i-2,i+1),dx=b[0]-a[0],dy=b[1]-a[1],ex=c[0]-b[0],ey=c[1]-b[1];if(Math.abs(dx*ey-dy*ex)>.15)curved++;}}
  assert.ok(curved>3,'real multi-segment curved paths');assert.ok(forked>0,'secondary branches from a process, not only radial spokes');
  assert.ok(s.live().some(m=>m.networkDegree>0),'some actual membrane junctions mature');
});
for(const mode of [1,2])test('JS and WASM retain identical shape/network proposals, contacts and random sequence: mode '+mode,async()=>{
  const a=setup(mode,'wrap'),b=setup(mode,'wrap');
  for(const s of [a,b]){const first=s.seed(2,35,45,7),second=s.seed(2,49,45,6);s.C.setpix([42,44],first);s.C.setpix([43,44],second);s.seed(3,65,45,4);s.scanContacts();s.section.updateJunctions(60);}
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),w=await CellLabWasm.install(b,module);
  for(let step=0;step<600;step++){
    if(step===400)for(const s of [a,b])s.set('branching',2);
    if(step===510)for(const s of [a,b])s.beginDeath(2,'kill');
    w.sync();for(const tgt of a.C.borderpixels.elements.slice(0,35))for(const src of a.neighbors[tgt]){const x=a.C.pixti(src),y=a.C.pixti(tgt);if(x===y)continue;assert.ok(Math.abs(a.C.deltaH(src,tgt,x,y)-w.e.energy(src,tgt,x,y))<1e-8);}
    a.advance(1);b.advance(1);assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels,'grid at '+step);assert.equal(b.C.mt.mti,a.C.mt.mti);assert.deepEqual(Uint32Array.from(b.C.mt.mt),Uint32Array.from(a.C.mt.mt));
  }
  assert.deepEqual(b.snapshot().cells,a.snapshot().cells);assert.deepEqual(b.contacts,a.contacts);
});
test('growth and division remain possible with dynamic branches, and newborn bodies rebuild valid protrusions',async()=>{
  const s=setup();s.set('growth',1);s.seed(2,60,45,7);const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));await CellLabWasm.install(s,module);s.advance(700);
  assert.ok(s.counters.divisions>0);for(const m of s.live()){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));assert.equal(m.morphologyMode,2);}
  const geometry=s.C.grid._pixels.slice(),mass=s.live().reduce((n,m)=>n+m.target,0);s.set('tumorMorphology',0);
  assert.deepEqual(s.C.grid._pixels,geometry,'switching a phenotype does not redraw the cells');assert.equal(s.live().reduce((n,m)=>n+m.target,0),mass);
  assert.equal(s.section.junctions.size,0);assert.ok(s.live().every(m=>m.branchCount===0&&m.networkDegree===0));
});
