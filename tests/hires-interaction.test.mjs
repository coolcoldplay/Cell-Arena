import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js','src/display-fields.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const make=(extra={})=>new CellLab.Simulation({width:200,height:150,scene:'empty',warmup:0,settings:{capacity:40,growth:0,apoptosis:0,metabolism:0,immuneGrowth:0},...extra});

test('legacy population budgets do not restrict additions; failed geometry still leaves the tissue intact',()=>{
  const s=make();for(let i=0;i<40;i++)assert.ok(s.seed(i?3:1,12+(i%10)*18,12+Math.floor(i/10)*20,i?3:7));
  const before=s.C.grid._pixels.slice(),n=s.live().length;
  assert.equal(s.seed(3,12,12,3,{manual:true}),0);assert.equal(s.lastSeedResult.reason,'occupied');assert.equal(s.live().length,n);assert.deepEqual(s.C.grid._pixels,before);
  const id=s.seed(3,150,120,3,{manual:true});assert.ok(id);assert.equal(s.live().length,41);assert.equal(s.lastSeedResult.population,41);
  assert.ok(s.seed(3,175,120,3));assert.equal(s.live().length,42);
  s.paint(175,95,3);assert.equal(s.seed(3,175,95,3,{manual:true}),0);assert.equal(s.lastSeedResult.reason,'wall');
  assert.equal(s.seed(3,1,120,3,{manual:true}),0);assert.equal(s.lastSeedResult.reason,'edge');
  assert.equal(s.seed(1,90,120,1,{manual:true}),0);assert.equal(s.lastSeedResult.reason,'nucleus');assert.equal(s.live().length,42);assert.equal(s.snapshot().orphans,0);
  s.set('capacity',9000);s.set('capacity',40);assert.equal(s.settings.capacity,undefined);assert.equal(s.live().length,42);
});

test('large dishes ignore old budgets and retain geometric seeding density and scenario populations',()=>{
  for(const scene of ['oncogenesis','cold','hot']){
    const s=make({width:512,height:384,scene,settings:{capacity:40}}),initial=s.scenarioReport().initial;
    assert.ok(initial.normal>200);assert.equal(initial.tumor,scene==='oncogenesis'?0:scene==='cold'?19:37);assert.equal(initial.immune,scene==='oncogenesis'?4:scene==='cold'?3:18);assert.equal(s.snapshot().orphans,0);
  }
});

test('3x and 4x refinement scale real cell and nuclear geometry while keeping the same environmental length scale',()=>{
  for(const r of [1,3,4]){
    const s=make({width:undefined,height:undefined,worldWidth:96,worldHeight:72,refinement:r}),id=s.seed(3,30*r,30*r,4*r),m=s.cells[id];
    assert.equal(s.width,96*r);assert.equal(s.height,72*r);assert.ok(Math.abs(s.C.getVolume(id)/r**2-Math.PI*16)<3);assert.ok(Math.abs(m.nucleusRadius/r-1.7)<1e-10);assert.equal(s.fields.oxygen.width,24);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));
  }
  assert.throws(()=>make({width:1025,height:768}),/1024/);assert.throws(()=>make({width:1024,height:769}),/768/);
});

test('1024x768 padded lattice stays within WASM storage and matches JS at wrapping edges, contacts and random trajectory',async()=>{
  const options={width:1024,height:768,refinement:4,boundary:'wrap'},a=make(options),b=make(options);
  for(const s of [a,b]){assert.ok(s.seed(3,1018,760,12));assert.ok(s.seed(2,990,735,20));s.paint(900,700,4);s.scanContacts();}
  const w=await CellLabWasm.install(b,module);assert.ok(b.C.grid._pixels.length>1048576);assert.equal(w.length,1048576);
  assert.ok(b.C.grid.p2i([1023,767])<w.length);assert.equal(w.grid.byteOffset+w.grid.byteLength,b.wasm.e.pointer(0)+1048576*2);
  for(let step=0;step<6;step++){a.advance(1);b.advance(1);assert.equal(b.kernel,'wasm');assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels);assert.deepEqual(b.contacts,a.contacts);assert.deepEqual(Uint32Array.from(b.C.mt.mt),Uint32Array.from(a.C.mt.mt));}
  assert.deepEqual(b.snapshot().cells,a.snapshot().cells);assert.equal(b.snapshot().orphans,0);
});

test('immune color tracks genuine recognition and activation expiry, never signal attraction or the scanning phase',()=>{
  const s=make({width:80,height:60,settings:{kill:0,antigen:100,metabolism:0,growth:0,apoptosis:0,immuneGrowth:0}}),target=s.seed(2,30,25,5),ctl=s.seed(3,40,25,4),peer=s.seed(3,49,25,4);
  s.cells[target].genome.antigen=1;s.applyGenome(s.cells[target]);s.pulse(60,25,'trail');s.updateLocal(1);
  assert.equal(s.cells[ctl].phase,'scan');assert.deepEqual(CellLabDisplay.bodyColor(s.cells[ctl]),[233,154,154]);
  for(let n=0;n<40;n++)s.updateLocal(4);
  assert.ok(s.counters.recognitions>0);assert.equal(s.cells[ctl].kind,3);assert.deepEqual(CellLabDisplay.bodyColor(s.cells[ctl]),[153,0,0]);assert.deepEqual(CellLabDisplay.bodyColor(s.cells[peer]),[233,154,154]);
  s.eraseCell(target);s.advance(701);
  assert.equal(s.cells[ctl].activation,0);assert.deepEqual(CellLabDisplay.bodyColor(s.cells[ctl]),[233,154,154]);
});

test('tumor gray encodes inherited proliferation on a fixed monotone scale and ignores transient stress',()=>{
  const sample=proliferation=>({kind:2,genome:{proliferation}}),values=[.25,.5,1,1.5,2,2.5,3].map(p=>CellLabDisplay.bodyColor(sample(p))[0]);
  assert.equal(values[0],88);assert.equal(values.at(-1),0);for(let i=1;i<values.length;i++)assert.ok(values[i]<values[i-1]);
  const m=sample(1.5),before=structuredClone(m);CellLabDisplay.bodyColor(m);assert.deepEqual(m,before);assert.deepEqual(CellLabDisplay.bodyColor({...m,fitness:0,stress:1}),CellLabDisplay.bodyColor(m));
  const s=make({settings:{mutation:0}}),id=s.seed(2,50,50,10);s.cells[id].genome.proliferation=2;const child=s.divide(id);assert.ok(child);assert.deepEqual(CellLabDisplay.bodyColor(s.cells[id]),CellLabDisplay.bodyColor(s.cells[child]));
  s.cells[child].genome.proliferation=3;assert.ok(CellLabDisplay.bodyColor(s.cells[child])[0]<CellLabDisplay.bodyColor(s.cells[id])[0]);
});
