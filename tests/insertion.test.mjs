import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/insertion.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
function tissue(options={}){
  const s=new CellLab.Simulation({width:96,height:80,scene:'empty',warmup:0,settings:{growth:0,apoptosis:0,metabolism:0,immuneGrowth:0},...options});
  for(let x=8;x<88;x+=16)for(let y=8;y<72;y+=16){const id=s.C.makeNewCellID(1),pixels=[];for(let dx=0;dx<16;dx++)for(let dy=0;dy<16;dy++){s.C.setpix([x+dx,y+dy],id);pixels.push(s.C.grid.p2i([x+dx,y+dy]));}s.refreshPositions();assert.ok(s.section.initialize(s.cells[id],pixels));}s.scanContacts();return s;
}
const state=s=>({grid:s.C.grid._pixels.slice(),cells:structuredClone(s.snapshot().cells),random:s.C.mt.mt.slice(),index:s.C.mt.mti,time:s.C.time,limit:s.limit,counters:{...s.counters},borders:[...s.C.borderpixels.elements],fields:Object.fromEntries(Object.entries(s.fields).map(([k,f])=>[k,f.values.slice()]))});
function intact(s){for(const m of s.live()){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY),`nucleus ${m.id}`);assert.ok(m.sectionFraction>=1-s.settings.sectionYield-1e-10);assert.ok(Math.abs(m.planarTarget+m.offPlaneTarget-m.target)<1e-8);}assert.equal(s.snapshot().orphans,0);}

test('single-click insertion inside a confluent cell layer supports all three cell types without deletion or hidden target loss',()=>{
  for(const kind of [1,2,3]){const s=tissue(),original=s.live().map(m=>({id:m.id,target:m.target,area:s.C.getVolume(m.id)})),time=s.C.time;
    assert.notEqual(s.C.pixt([48,48]),0);const id=s.insert(kind,48,48,kind===3?3:4);assert.ok(id,JSON.stringify(s.lastSeedResult));assert.equal(s.C.pixt([48,48]),id);assert.equal(s.live().length,original.length+1);assert.equal(s.C.time,time);assert.ok(s.lastSeedResult.inserted);assert.ok(s.lastSeedResult.yielded>0);
    for(const old of original){const m=s.cells[old.id];assert.ok(m);assert.equal(m.target,old.target);assert.ok(s.C.getVolume(m.id)>=old.area*(1-s.settings.sectionYield)-1e-9);}intact(s);
    assert.equal(s.cells[id].activation,0);assert.equal(s.counters.kills,0);assert.equal(s.counters.recognitions,0);
  }
});

test('inserting on a small immune body deforms it aside instead of replacing it',()=>{
  const s=new CellLab.Simulation({width:80,height:60,scene:'empty',warmup:0}),old=s.seed(3,35,30,3),target=s.cells[old].target,id=s.insert(3,35,30,3);
  assert.ok(id,JSON.stringify(s.lastSeedResult));assert.notEqual(id,old);assert.equal(s.cells[old].target,target);assert.equal(s.live().length,2);assert.equal(s.C.pixt([35,30]),id);intact(s);
});

test('impossible packed and wall insertions are atomic, preserving geometry, nuclei, fields, RNG, contacts and budget',()=>{
  const s=tissue({settings:{sectionYield:0}});for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(!s.C.pixt([x,y]))s.paint(x,y,0,false,false);s.rebuildMask();
  const before=state(s);assert.equal(s.insert(3,48,48,3),0);assert.equal(s.lastSeedResult.reason,'crowded');assert.deepEqual(state(s),before);
  assert.equal(s.insert(3,3,3,3),0);assert.equal(s.lastSeedResult.reason,'wall');assert.deepEqual(state(s),before);
});

test('draft insertion stays local and produces identical valid states for JS and WASM continuation',async()=>{
  const a=tissue(),b=tissue();await CellLabWasm.install(b,module);const before=a.C.grid._pixels.slice();
  assert.ok(a.insert(3,48,48,3));assert.ok(b.insert(3,48,48,3));
  for(const i of a.positions)if(Math.hypot(a.xs[i]-48,a.ys[i]-48)>25)assert.equal(a.C.pixti(i),before[i]);
  assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);for(let n=0;n<12;n++){a.advance(1);b.advance(1);assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.contacts,b.contacts);}intact(a);intact(b);assert.deepEqual(a.snapshot().cells,b.snapshot().cells);
});

test('high-refinement and periodic insertions keep complete nuclei and consume only the remaining cumulative yield allowance',()=>{
  for(const refinement of [1,3,4]){
    const s=new CellLab.Simulation({worldWidth:64,worldHeight:48,refinement,boundary:'wrap',scene:'empty',warmup:0}),r=refinement,old=s.seed(1,2*r,24*r,8*r),initial=s.C.getVolume(old);
    assert.ok(s.insert(3,0,24*r,3*r),JSON.stringify(s.lastSeedResult));intact(s);
    for(let n=0;n<4;n++){s.insert(3,0,24*r,3*r);intact(s);assert.ok(s.C.getVolume(old)>=initial*(1-s.settings.sectionYield)-1e-8);}
  }
});
