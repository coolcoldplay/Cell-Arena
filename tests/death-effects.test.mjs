import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js','src/display-fields.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=()=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,seed:17,settings:{growth:0,immuneGrowth:0,apoptosis:0,metabolism:0}});
test('immune kill rounds and swells the actual body before one rupture and clearance',()=>{
  const s=make(),id=s.seed(2,40,36,7),area=s.C.getVolume(id);s.beginDeath(id,'kill');
  s.advance(70);const m=s.cells[id];assert.ok(m,'the committed kill must remain visible through swelling');
  assert.equal(m.deathPhase,'swelling');assert.ok(s.C.getVolume(id)>area*1.08);assert.equal(s.components(id).length,1);assert.equal(s.counters.kills,0);
  s.advance(80);assert.equal(s.cells[id],undefined);assert.equal(s.counters.kills,1);assert.equal(s.counters.apoptosis,0);
  assert.equal(s.deathHistory.length,1);assert.equal(s.deathHistory[0].effect,'lysis');
});
test('spontaneous apoptosis shrinks and does not produce a lytic burst',()=>{
  const s=make(),id=s.seed(2,40,36,7),area=s.C.getVolume(id);s.beginDeath(id,'spontaneous');s.advance(12);
  assert.ok(!s.cells[id]||s.C.getVolume(id)<area);s.advance(150);
  assert.equal(s.counters.apoptosis,1);assert.equal(s.counters.kills,0);assert.equal(s.snapshot().deathEffects.length,0);
});
test('lytic surface tension rounds an elongated lattice body rather than drawing a circle over it',()=>{
  const s=make(),id=s.C.makeNewCellID(2),points=[];
  for(let x=24;x<=62;x++)for(let y=32;y<=40;y++){s.C.setpix([x,y],id);points.push(s.C.grid.p2i([x,y]));}
  s.refreshPositions();assert.ok(s.section.initialize(s.cells[id],points));s.updateMechanics(s.cells[id]);s.beginDeath(id,'kill');
  const aspect=()=>{const p=[...s.C.pixels()].filter(([,cid])=>cid===id).map(([p])=>p);return (Math.max(...p.map(p=>p[0]))-Math.min(...p.map(p=>p[0]))+1)/(Math.max(...p.map(p=>p[1]))-Math.min(...p.map(p=>p[1]))+1);};
  const before=aspect();s.advance(70);assert.ok(aspect()<before*.8,`actual aspect ratio ${before} -> ${aspect()}`);assert.equal(s.components(id).length,1);
});
test('death colours distinguish kill, apoptosis and environmental stress independently of the living palette',()=>{
  const base=[30,40,50],style=cause=>CellLabDisplay.deathColor(base,{dying:true,deathCause:cause,deathProgress:1});
  assert.equal(typeof CellLabDisplay.deathColor,'function');
  const pink=style('kill');assert.ok(pink[0]>220&&pink[2]>140&&pink[1]<200);
  assert.notDeepEqual(pink,style('spontaneous'));assert.notDeepEqual(style('spontaneous'),style('environment'));
  assert.deepEqual(CellLabDisplay.deathColor(base,{dying:false}),base);
});
test('kill rupture effects expire in model time and do not create extra deaths',()=>{
  const s=make(),id=s.seed(2,40,36,7);s.beginDeath(id,'kill');
  for(let n=0;n<160&&s.cells[id];n++)s.advance(1);
  const snap=s.snapshot();assert.equal(snap.deathEffects.length,1);assert.equal(snap.deathEffects[0].cause,'kill');assert.equal(snap.deathEffects[0].startedAt,s.C.time);
  s.advance(80);assert.equal(s.snapshot().deathEffects.length,0);assert.equal(s.counters.kills,1);
});
test('kill swelling cannot penetrate a solid barrier and remains identical in JS and WASM',async()=>{
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),runs=[];
  for(const kernel of ['fast','wasm']){
    const s=make(),id=s.seed(2,40,36,7);for(let y=0;y<72;y++)s.paint(49,y,1,false);s.beginDeath(id,'kill');if(kernel==='wasm')await CellLabWasm.install(s,module);
    s.advance(70);for(const [p,cid] of s.C.pixels())if(cid===id)assert.ok(p[0]<48);
    assert.ok(s.cells[id]);assert.equal(s.components(id).length,1);runs.push(s);
  }
  assert.deepEqual(runs[0].C.grid._pixels,runs[1].C.grid._pixels);assert.deepEqual(runs[0].snapshot().cells,runs[1].snapshot().cells);
});
