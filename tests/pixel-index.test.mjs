import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/insertion.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const quiet={growth:0,immuneGrowth:0,metabolism:0,apoptosis:0};
function checkIndex(s){
  const expected=new Map();
  for(const [p,id] of s.C.pixels()){if(!expected.has(id))expected.set(id,[]);expected.get(id).push(s.C.grid.p2i(p));}
  assert.deepEqual(Object.keys(s.pixelIndex.members).map(Number),[...expected.keys()].sort((a,b)=>a-b));
  for(const [id,body]of expected){assert.deepEqual(s.pixelIndex.indices(id),body);for(const i of body)assert.equal(s.pixelIndex.members[id][s.pixelIndex.slots[i]],i);}
}
function identical(a,b){
  assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels,'grid');
  assert.deepEqual(b.C.mt.mt,a.C.mt.mt,'CPM random stream');assert.equal(b.C.mt.mti,a.C.mt.mti);
  assert.deepEqual(b.immunity.rng.mt,a.immunity.rng.mt,'immune random stream');assert.equal(b.immunity.rng.mti,a.immunity.rng.mti);
  assert.deepEqual(b.C.borderpixels.elements,a.C.borderpixels.elements,'border order');
  assert.deepEqual(b.C._neighbours,a.C._neighbours);assert.deepEqual(b.C.cellvolume,a.C.cellvolume);
  assert.deepEqual(b.C.getConstraint('PerimeterConstraint').cellperimeters,a.C.getConstraint('PerimeterConstraint').cellperimeters);
  assert.deepEqual(b.act.cellpixelsact,a.act.cellpixelsact);assert.deepEqual(b.cells,a.cells,'all cell metadata including occupancy bins');
  assert.deepEqual(b.contacts,a.contacts);assert.deepEqual(b.occupancy,a.occupancy);
  assert.deepEqual(b.deathHistory,a.deathHistory);assert.deepEqual(b.lineage,a.lineage);assert.deepEqual(b.patrol,a.patrol);
  for(const key of Object.keys(a.fields))assert.deepEqual(b.fields[key].values,a.fields[key].values,key);
  assert.deepEqual(b.snapshot(),a.snapshot(),'complete public state');checkIndex(b);
}
async function pair(extra={},kernel='wasm'){
  const options={width:96,height:72,scene:'empty',warmup:0,seed:29,settings:quiet,kernel:kernel==='wasm'?'fast':kernel,...extra};
  const sims=[new CellLab.Simulation(options),new CellLab.Simulation({...options,pixelIndex:true})];
  if(kernel==='wasm')for(const s of sims)await CellLabWasm.install(s,module);
  return sims;
}
function body(s,wrap=false){
  const id=s.C.makeNewCellID(2),points=[];
  for(let x=0;x<18;x++)for(let y=0;y<12;y++){const p=[wrap?(x+88)%96:x+20,y+22];points.push(p);s.C.setpix(p,id);}
  const m=s.cells[id];m.base=m.target=s.C.getVolume(id);s.refreshPositions();assert.ok(s.section.initialize(m,points.map(p=>s.C.grid.p2i(p))));s.updateMechanics(m);return id;
}
for(const boundary of ['solid','wrap'])for(const kernel of ['reference','fast','wasm'])test(`pixel index preserves division, death and edits: ${kernel}/${boundary}`,async()=>{
  const [a,b]=await pair({boundary},kernel);
  for(const s of [a,b]){body(s,boundary==='wrap');s.seed(1,50,45,7);s.seed(3,68,25,5);s.paint(75,50,3);}
  identical(a,b);
  const children=[a.divide(1),b.divide(1)];assert.ok(children[0]);assert.equal(children[1],children[0]);identical(a,b);
  assert.deepEqual(b.C.getStat(CPM.PixelsByCell),a.C.getStat(CPM.PixelsByCell),'target-only statistics did not escape division');
  for(let step=0;step<140;step++){
    if(step===5)for(const s of [a,b])s.moveCell(3,65,35);
    if(step===10)for(const s of [a,b])s.beginDeath(children[0],'kill');
    if(step===20)for(const s of [a,b])s.beginDeath(2,'spontaneous');
    if(step===60)for(const s of [a,b]){s.clearWalls();s.seed(1,48,56,4);}
    a.advance(1);b.advance(1);if(step%10===0)identical(a,b);
  }
  identical(a,b);assert.equal(a.cells[children[0]],undefined,'lysis reaches clearance');
});
test('failed division rolls pixels and Act back in identical order',async()=>{
  const [a,b]=await pair({boundary:'wrap'});for(const s of [a,b])body(s,true);
  for(const s of [a,b]){const find=s.section.findNucleus;s.section.findNucleus=()=>null;assert.equal(s.divide(1),0);s.section.findNucleus=find;}
  identical(a,b);a.advance(8);b.advance(8);identical(a,b);
});
test('remnant shedding, last-pixel cleanup and reused IDs preserve accounting',async()=>{
  const [a,b]=await pair();
  for(const s of [a,b]){body(s);s.beginDeath(1,'environment');s.cells[1].deathElapsed=200;s.shedDeathRemnants();}
  identical(a,b);
  for(const s of [a,b]){for(const [p,id]of [...s.C.pixels()])if(id===1)s.C.setpix(p,0);s.cleanup();s.eraseCell(1);s.C.last_cell_id=0;assert.equal(body(s),1);}
  identical(a,b);
  for(const s of [a,b])s.eraseCell(1,{manual:true});identical(a,b);
});
test('indexed events do not traverse the lattice and temporary statistics clear on failure',async()=>{
  const [,s]=await pair();body(s);const original=s.C.pixels;s.C.pixels=()=>{throw Error('unexpected full-grid traversal');};
  assert.ok(s.divide(1));s.components(1);s.eraseCell(1);s.beginDeath(2,'environment');s.cells[2].deathElapsed=200;s.shedDeathRemnants();s.eraseCell(2);
  s.C.pixels=original;checkIndex(s);body(s);
  const divide=s.gm.divideCell;s.gm.divideCell=()=>{throw Error('injected division failure');};
  assert.throws(()=>s.divide(3),/injected division failure/);assert.deepEqual(s.C.stat_values,{});assert.equal(s.divisionParent,null);s.gm.divideCell=divide;
});
test('WASM bulk commit, unknown-observer replay and trap fallback keep index current',async()=>{
  const [a,b]=await pair();for(const s of [a,b]){body(s);s.seed(3,50,40,5);}
  assert.ok(b.wasm.canImportBookkeeping(),'index is a known bulk-commit listener');
  a.advance(8);b.advance(8);identical(a,b);
  for(const s of [a,b])s.C.post_setpix_listeners.push(()=>{});
  assert.equal(b.wasm.canImportBookkeeping(),false);a.advance(8);b.advance(8);identical(a,b);
  for(const s of [a,b]){s.C.post_setpix_listeners.pop();const run=s.wasm.e.run;s.wasm.e={...s.wasm.e,run(...args){run(...args);throw Error('injected trap');}};}
  a.advance(8);b.advance(8);assert.equal(b.kernel,'fast');identical(a,b);
});
test('elastic insertion and rejected wall insertion do not desynchronize membership',async()=>{
  const [a,b]=await pair({boundary:'wrap'});
  for(const s of [a,b])s.seed(1,35,30,8);
  const ids=[a.insert(3,35,30,3),b.insert(3,35,30,3)];assert.ok(ids[0]);assert.equal(ids[1],ids[0]);identical(a,b);
  for(const s of [a,b]){s.moveCell(ids[0],40,32,{elastic:true});s.paint(75,50,5);assert.equal(s.insert(3,75,50,3),0);}
  identical(a,b);a.advance(20);b.advance(20);identical(a,b);
});
