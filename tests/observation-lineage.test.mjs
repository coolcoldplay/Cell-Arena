import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/model.js','src/display-fields.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=()=>new CellLab.Simulation({width:128,height:96,scene:'empty',warmup:0,settings:{growth:0,apoptosis:0,metabolism:0}});
test('observation follows both daughters and grandchildren without intermediate frames or the event log',()=>{
  const s=make(),id=s.seed(2,40,48,14),birth=s.cells[id].birth;
  assert.ok(s.observe(id,birth));const sibling=s.divide(id);assert.ok(sibling);
  s.lineage=[];const grandchild=s.divide(id);assert.ok(grandchild);s.lineage=[];
  const report=s.snapshot().observation;
  assert.equal(report.rootBirth,birth);assert.deepEqual(report.cells.map(c=>c.generation).sort(),[1,2,2]);
  assert.equal(new Set(report.cells.map(c=>c.birth)).size,3);assert.ok(report.cells.every(c=>c.birth!==birth));
  s.eraseCell(sibling);const unrelated=s.seed(2,100,50,8);assert.ok(unrelated);
  assert.equal(s.snapshot().observation.cells.length,2);assert.ok(s.snapshot().observation.cells.every(c=>c.id!==unrelated));
  const focus=s.cells[id];assert.ok(s.observe(id,focus.birth));assert.deepEqual(s.snapshot().observation.cells,[{id,birth:focus.birth,generation:0}]);
  s.observe(0);assert.equal(s.snapshot().observation,null);
});
test('an observation click races safely with a real division and ignores unrelated reused identities',()=>{
  const s=make(),id=s.seed(2,40,48,12),birth=s.cells[id].birth;assert.ok(s.divide(id));
  assert.ok(s.observe(id,birth));assert.deepEqual(s.snapshot().observation.cells.map(c=>c.generation),[1,1]);
  const fresh=s.seed(1,100,50,6);assert.equal(s.observe(fresh,999999),false);
  assert.ok(s.snapshot().observation.cells.every(c=>c.id!==fresh));
});
test('observation does not change physical trajectories, random numbers, cycles or population',()=>{
  const a=make(),b=make();for(const s of [a,b])s.seed(2,40,48,12);
  a.observe(1,a.cells[1].birth);for(const s of [a,b]){s.divide(1);s.advance(50);s.snapshot();}
  assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.C.mt.mt,b.C.mt.mt);assert.deepEqual(a.counters,b.counters);assert.deepEqual(a.snapshot().cells,b.snapshot().cells);
});
test('family boxes use individual minimal periodic bounds and leave unrelated cells out',()=>{
  const s={width:8,height:6,boundary:'wrap',grid:new Uint16Array(48)};
  for(const [x,y,id]of [[0,2,1],[7,2,1],[0,3,1],[7,3,1],[3,1,2],[4,1,2],[3,2,2],[4,2,2],[6,5,3]])s.grid[y*8+x]=id;
  const boxes=CellLabDisplay.selectionBoxes(s,[1,2]);assert.equal(boxes.size,2);assert.equal(boxes.get(1).right-boxes.get(1).left,2);assert.deepEqual(boxes.get(2),{left:3,right:5,top:1,bottom:3});
});
