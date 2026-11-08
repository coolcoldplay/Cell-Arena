import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/insertion.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(boundary='solid')=>new CellLab.Simulation({width:80,height:60,scene:'empty',warmup:0,boundary,seed:17,settings:{growth:0,immuneGrowth:0,apoptosis:0,metabolism:0}});
function intact(s){for(const m of s.live()){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY),`nucleus #${m.id} remains in its cell`);assert.ok(m.sectionFraction>=1-s.settings.sectionYield-1e-9);}assert.equal(s.snapshot().orphans,0);}

test('manual elastic drag traverses a neighbour while conserving identities and model time',()=>{
  const s=make(),id=s.seed(3,12,30,3),other=s.seed(1,27,30,8),before=s.C.getVolume(id),otherArea=s.C.getVolume(other),rng=s.C.mt.mt.slice(),rngi=s.C.mt.mti;
  const result=s.moveCell(id,44,30,{elastic:true});
  assert.ok(s.cells[id].x>=43,'a neighbouring body must yield instead of stopping the drag at its first pixel');
  assert.ok(result.displaced>=1);assert.equal(s.live().length,2);assert.equal(s.C.getVolume(id),before);
  assert.ok(s.C.getVolume(other)>=otherArea*(1-s.settings.sectionYield));
  assert.equal(s.C.time,0);assert.deepEqual(s.C.mt.mt,rng);assert.equal(s.C.mt.mti,rngi);assert.equal(s.counters.recognitions,0);intact(s);
});

test('elastic dragging cannot cross a wall or destroy trapped neighbours',()=>{
  const s=make(),id=s.seed(3,12,30,3),other=s.seed(1,26,30,7);
  for(let y=0;y<60;y++)s.paint(42,y,1,false);const wall=s.snapshot().walls.slice(),area=s.C.getVolume(id);
  const result=s.moveCell(id,65,30,{elastic:true});assert.ok(result.blocked);assert.ok(s.cells[id].x<40);
  assert.equal(s.C.getVolume(id),area);assert.ok(s.cells[other]);assert.deepEqual(s.snapshot().walls,wall);intact(s);
});

test('elastic movement through the periodic seam preserves nuclei and both bodies',()=>{
  const s=make('wrap'),id=s.seed(3,70,30,3),other=s.seed(1,3,30,7),area=s.C.getVolume(id);
  s.moveCell(id,15,30,{elastic:true});assert.ok(Math.abs(s.cells[id].x-15)<1);assert.equal(s.C.getVolume(id),area);assert.ok(s.cells[other]);intact(s);
});
test('several neighbours in a dense row yield without resetting compression allowance between pointer events',()=>{
  const s=make(),id=s.seed(3,10,30,3),others=[25,40,55].map(x=>s.seed(1,x,30,7)),reference=new Map(),areas=others.map(id=>s.C.getVolume(id));
  for(let x=14;x<=69;x+=5){s.moveCell(id,x,30,{elastic:true,reference});intact(s);}
  assert.ok(s.cells[id].x>=68,'the dragged cell traverses the row');
  others.forEach((id,k)=>{assert.ok(s.C.getVolume(id)>=areas[k]*(1-s.settings.sectionYield));assert.ok(s.C.getVolume(id)<=areas[k]+4,'dragging does not inflate neighbours indefinitely');});
});

test('refined elastic dragging preserves nuclei and deterministic JS/WASM continuation',async()=>{
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
  for(const refinement of [1.5,4]){
    const runs=[];
    for(const kernel of ['fast','wasm']){
      const s=new CellLab.Simulation({worldWidth:64,worldHeight:48,refinement,scene:'empty',warmup:0,seed:17,settings:{growth:0,immuneGrowth:0,apoptosis:0,metabolism:0}}),r=refinement;
      const id=s.seed(3,12*r,24*r,3*r);s.seed(1,27*r,24*r,8*r);if(kernel==='wasm')await CellLabWasm.install(s,module);
      const area=s.C.getVolume(id);s.moveCell(id,43*r,24*r,{elastic:true});assert.ok(s.cells[id].x>=42*r);assert.equal(s.C.getVolume(id),area);intact(s);
      s.advance(12);intact(s);runs.push(s);
    }
    assert.deepEqual(runs[0].C.grid._pixels,runs[1].C.grid._pixels);assert.deepEqual(runs[0].snapshot().cells,runs[1].snapshot().cells);assert.deepEqual(Uint32Array.from(runs[0].C.mt.mt),Uint32Array.from(runs[1].C.mt.mt));assert.equal(runs[0].C.mt.mti,runs[1].C.mt.mti);
  }
});
