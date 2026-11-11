import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
test('WASM trap falls back before committing changes or consuming JS random numbers',async()=>{
  const options={width:80,height:60,warmup:0,seed:17},a=new CellLab.Simulation(options),b=new CellLab.Simulation(options),w=await CellLabWasm.install(b,module),run=w.e.run;w.e={...w.e,run(...args){run(...args);throw Error('injected trap after computation');}};a.advance(1);b.advance(1);assert.equal(b.kernel,'fast');assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels);assert.deepEqual(b.snapshot().cells,a.snapshot().cells);
});
for(const boundary of ['solid','wrap'])test('WASM matches sequential JS including shape, RNG, fields and contacts: '+boundary,async()=>{
  const options={width:96,height:72,warmup:0,boundary,seed:17,scene:'empty',settings:{growth:0,apoptosis:0}};
  const a=new CellLab.Simulation(options),b=new CellLab.Simulation(options);
  for(const s of [a,b]){s.seed(1,30,35,9);s.seed(2,46,35,7);s.seed(3,34,49,5);s.seed(3,3,3,3);s.paint(65,28,3);s.scanContacts();}
  const wasm=await CellLabWasm.install(b,module);
  for(let step=0;step<160;step++){
    if(step===40)for(const s of [a,b])s.seed(2,76,55,7);
    if(step===70)for(const s of [a,b])s.moveCell(3,50,58);
    if(step===95)for(const s of [a,b])s.divide(1);
    if(step===130)for(const s of [a,b])s.eraseCell(4);
    wasm.sync();
    for(const tgt of a.C.borderpixels.elements.slice(0,40))for(const src of a.neighbors[tgt]){const x=a.C.pixti(src),y=a.C.pixti(tgt);if(x===y)continue;
      const js=a.C.deltaH(src,tgt,x,y),w=wasm.e.energy(src,tgt,x,y);assert.ok(Math.abs(js-w)<1e-8,`energy step ${step}: ${js} vs ${w}`);}
    a.advance(1);b.advance(1);
    assert.deepEqual(b.contacts,a.contacts,'ordered contact graph at MCS '+step);
    assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels,'grid at MCS '+step);assert.deepEqual(Uint32Array.from(b.C.mt.mt),Uint32Array.from(a.C.mt.mt),'RNG state');assert.equal(b.C.mt.mti,a.C.mt.mti,'RNG index');
    assert.deepEqual(b.C.borderpixels.elements,a.C.borderpixels.elements,'border ordering');assert.deepEqual(b.C.getConstraint('PerimeterConstraint').cellperimeters,a.C.getConstraint('PerimeterConstraint').cellperimeters);
    assert.deepEqual(b.C.cellvolume,a.C.cellvolume,'volumes and last-pixel deletion');assert.deepEqual(b.C._neighbours,a.C._neighbours,'membrane degrees');assert.deepEqual(b.act.cellpixelsact,a.act.cellpixelsact,'Act history');
    for(const i of b.positions)assert.equal(b.C.borderpixels.contains(i),a.C.borderpixels.contains(i),'dense border membership at '+i);
  }
  assert.deepEqual(b.snapshot().cells,a.snapshot().cells);assert.deepEqual(b.counters,a.counters);for(const k of Object.keys(a.fields))assert.deepEqual(b.fields[k].values,a.fields[k].values);
});

test('unrecognized pixel observers retain complete sequential bookkeeping',async()=>{
  const options={width:64,height:48,scene:'empty',warmup:0,boundary:'wrap'},a=new CellLab.Simulation(options),b=new CellLab.Simulation(options);
  for(const s of [a,b]){s.seed(1,20,25,7);s.seed(3,31,25,5);}
  const w=await CellLabWasm.install(b,module);let commits=0;const commit=w.commit.bind(w);w.commit=n=>{commits++;commit(n);};
  a.advance(2);b.advance(2);assert.equal(commits,2);
  const observations=[];
  for(const s of [a,b]){const rows=[];observations.push(rows);s.C.post_setpix_listeners.push((i,old,id)=>rows.push([i,old,id,s.C._neighbours[i],s.C.borderpixels.length,s.C.getConstraint('PerimeterConstraint').cellperimeters[old]]));}
  a.advance(5);b.advance(5);assert.deepEqual(observations[1],observations[0]);assert.equal(commits,2,'extra observers disable the bulk commit');
  for(const s of [a,b])s.C.post_setpix_listeners.pop();
  a.advance(2);b.advance(2);assert.equal(commits,4);assert.deepEqual(b.snapshot().cells,a.snapshot().cells);assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels);
});

