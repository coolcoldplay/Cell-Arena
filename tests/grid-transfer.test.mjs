import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/grid-transfer.js','src/experiment.js','src/round-history.js','src/trajectories.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const make=(extra={})=>new CellLab.Simulation({scene:'hot',worldWidth:192,worldHeight:144,refinement:1.5,boundary:'wrap',seed:31,warmup:35,...extra});
const state=s=>structuredClone({grid:s.C.grid._pixels,cells:s.cells,rng:{...s.C.mt},immuneRng:{...s.immunity.rng},counters:s.counters,history:s.history,genes:s.immunity.clones,time:s.C.time});
function intact(s){assert.equal(s.snapshot().orphans,0);for(const m of s.live().filter(m=>!m.dying||m.deathIntact)){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));assert.ok(s.C.getVolume(m.id)>=m.minVisibleArea);}}
test('coarsening an evolving culture keeps identities, biological state, time, histories, sources, fields and both RNG streams',async()=>{
  const s=make();await CellLabWasm.install(s,module);s.advance(700);
  const immune=s.live().find(m=>m.kind===3&&!m.dying);immune.learnedReceptors=[{sequence:'AAAAAA',channel:0,learnedAt:40}];immune.antigenCargo=[{sequence:'AAAAAA',channel:0,expiresAt:2000}];s.observe(immune.id,immune.birth);s.addSource(80,50,'trail',6);
  const before=state(s);
  for(const r of [1,.75,.5,.375]){
    const n=CellLabGridTransfer.coarsen(s,r),q=r/s.scale;
    assert.deepEqual(state(s),before,'building a replacement never mutates the source');assert.equal(n.C.time,s.C.time);assert.equal(n.worldWidth,s.worldWidth);assert.equal(n.scene,s.scene);assert.equal(n.live().length,s.live().length);
    assert.deepEqual(n.C.mt,s.C.mt);assert.deepEqual(n.immunity.rng,s.immunity.rng);assert.deepEqual(n.immunity.clones,s.immunity.clones);assert.deepEqual(n.immunity.metrics,s.immunity.metrics);assert.deepEqual(n.counters,s.counters);assert.deepEqual(n.history,s.history);assert.deepEqual(n.observation,s.observation);
    for(const m of s.live()){
      const c=n.cells[m.id];for(const key of ['birth','parentBirth','geneClone','genome','expression','generation','cycle','resources','age','learnedReceptors','antigenCargo','tumorKills','divisionsLeft','immunePhenotype','activation','deathProgress','deathElapsed','dying','deathCause'])assert.deepEqual(c[key],m[key],key);
      assert.ok(Math.abs(c.target/r**2-m.target/s.scale**2)<1e-8);assert.ok(Math.abs(c.base/r**2-m.base/s.scale**2)<1e-8);
    }
    for(const key of Object.keys(s.fields).filter(k=>k!=='density'))assert.deepEqual(n.fields[key].values,s.fields[key].values,key);
    assert.equal(n.sources[0].x,s.sources[0].x*q);assert.equal(n.sources[0].radius,s.sources[0].radius*q);assert.deepEqual(n.vascular.initial,s.vascular.initial);assert.equal(n.vascular.vessels[0].radius,s.vascular.vessels[0].radius*q);
    for(let i=0;i<s.vascular.vessels.length;i++)for(const key of ['initialMass','mass','repairMass','repairDeficit'])if(s.vascular.vessels[i][key]!==undefined)assert.ok(Math.abs(n.vascular.vessels[i][key]-s.vascular.vessels[i][key]*q*q)<1e-8,key);
    assert.ok([...n.immunity.clones.values()].filter(c=>c.genes).every(c=>Object.isFrozen(c.genes)));intact(n);
  }
});
test('coarsened JS and WASM continue identically, including a second coarsening',async()=>{
  const s=make();await CellLabWasm.install(s,module);s.advance(300);
  let a=CellLabGridTransfer.coarsen(s,.75),b=CellLabGridTransfer.coarsen(s,.75);await CellLabWasm.install(b,module);
  for(let step=0;step<200;step++){
    if(step===100){a=CellLabGridTransfer.coarsen(a,.5);b=CellLabGridTransfer.coarsen(b,.5);await CellLabWasm.install(b,module);}
    a.advance(1);b.advance(1);assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.counters,b.counters);assert.deepEqual(Uint32Array.from(a.C.mt.mt),Uint32Array.from(b.C.mt.mt));assert.equal(a.C.mt.mti,b.C.mt.mti);
  }
  assert.deepEqual(a.snapshot().cells,b.snapshot().cells);assert.equal(a.initialRefinement,1.5);assert.equal(a.refinementTransitions.length,2);intact(a);intact(b);
});
test('fractional slider steps retain exact culture dimensions across consecutive transfers',()=>{
  const s=make({scene:'empty',worldWidth:240,worldHeight:180,warmup:0});s.seed(3,120,90,7);
  const middle=CellLabGridTransfer.coarsen(s,47/60),n=CellLabGridTransfer.coarsen(middle,23/60);
  for(const v of [middle,n]){assert.equal(v.worldWidth,240);assert.equal(v.worldHeight,180);assert.equal(v.live().length,1);intact(v);}
});
test('nuclear lysis retains its protected core and shared death record during transfer',()=>{
  const s=make({scene:'empty',worldWidth:160,worldHeight:128,settings:{tumorMorphology:1}}),id=s.seed(2,110,100,18),m=s.cells[id];s.section.updateBranches(8);s.beginDeath(id,'kill');assert.ok(m.deathIntact);const n=CellLabGridTransfer.coarsen(s,.5);assert.ok(n.cells[id].deathIntact);assert.ok(Math.abs(n.cells[id].deathArea-m.deathArea/9)<1e-10);assert.equal(n.cells[id].deathRecord,n.deathHistory.at(-1));intact(n);
});
test('walls and maze geometry remain physical, with field masks rebuilt at the new scale',()=>{
  const s=make({scene:'maze',worldWidth:320,worldHeight:240,boundary:'solid',warmup:0});s.paint(10,10,3,true);const n=CellLabGridTransfer.coarsen(s,.5);
  assert.equal(n.maze.radius,s.maze.radius/3);assert.equal(n.maze.corridor,s.maze.corridor);assert.deepEqual(n.maze.arrivals,s.maze.arrivals);assert.deepEqual(n.maze.cutouts,s.maze.cutouts.map(a=>a.map(v=>v/3)));assert.equal(n.fields.oxygen.width,160);assert.ok(n.fields.oxygen.blocked.some(Boolean));intact(n);
});
test('an impossible wall/nucleus projection rejects atomically instead of erasing cells or opening walls',()=>{
  const s=make({scene:'empty',worldWidth:96,worldHeight:72,refinement:4,warmup:0}),id=s.seed(3,64,64,12),m=s.cells[id],wall=s.C.makeNewCellID(4);s.wallID=wall;
  for(let y=0;y<s.height;y+=8)for(let x=0;x<s.width;x+=8){const p=[[x,y],[x+7,y],[x,y+7],[x+7,y+7]].find(([xx,yy])=>(xx-m.nucleusX)**2+(yy-m.nucleusY)**2>m.nucleusRadius**2);if(p)s.C.setpix(p,wall);}
  const before=state(s);assert.throws(()=>CellLabGridTransfer.coarsen(s,.5),/保留原进度/);assert.deepEqual(state(s),before);
});
test('the same journal and display traces retain time and coordinates through a grid change; replay warns about interventions',()=>{
  const s=make(),a={...s.snapshot(),revision:1,playing:false},journal=new CellLabRounds.Journal();journal.begin(a,0);const n=CellLabGridTransfer.coarsen(s,.5),b={...n.snapshot(),revision:1,playing:false};journal.observe(b,10);
  assert.equal(journal.active.refinement,1.5);assert.equal(journal.active.finalRefinement,.5);assert.equal(journal.active.refinementTransitions.length,1);assert.equal(journal.active.simulatedMCS,a.time);
  const recipe=CellLabRounds.replayExperiment(journal.current());assert.equal(recipe.refinement,1.5);assert.ok(CellLabExperiment.parse(recipe).warnings.some(x=>x.includes('精细度切换')));assert.match(CellLabRounds.csv([journal.current()]),/refinement_transitions/);
  const tracks=new CellLabTrajectories();tracks.configure(true,400);tracks.sample(a);const point=[...tracks.paths.values()][0].points[0];tracks.sample({...b,time:b.time+1});assert.equal(point.x,a.cells[0].x/3);assert.equal(point.time,a.time);
});
