import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const make=(extra={})=>new CellLab.Simulation({worldWidth:144,worldHeight:112,refinement:1,scene:'empty',warmup:0,seed:17,vessels:[{x:72,y:56,radius:11}],...extra,settings:{metabolism:.25,supply:3,apoptosis:0,vesselLifespan:0,vesselImmuneRate:0,vesselDivisions:12,angiogenesis:3,...extra.settings}});
const intact=s=>{for(const m of s.live().filter(m=>!m.dying)){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));}};
const bounded=s=>{const limit=s.vascular.outerLimit();for(const [p,id]of s.C.pixels()){const m=s.cells[id];if(m?.vesselID&&!m.dying)assert.ok(s.vascular.distance(...p,s.vascular.at(m.vesselID))<=limit+1e-7,'actual endothelial pixel remains inside outer limit');}for(const v of s.vascular.report().vessels)assert.ok(v.outerDiameter<=v.maxDiameter+1e-7);};

test('strong sustained induction reaches the limit and cannot restart any endothelial cycle or division',async()=>{
 const a=make(),b=make();await CellLabWasm.install(b,module);let stopped=null,cycled=false;
 // The mass guard can cancel G1 within the first 100 MCS, before radius catches up.
 for(let t=0;t<6000;){const dt=t<100?10:100;t+=dt;for(const s of [a,b]){s.fields.angiogenicNormal.values.fill(2);s.advance(dt);bounded(s);}assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.vascular.report(),b.vascular.report());
  if(a.live().some(m=>m.cycle.phase!=='G0'))cycled=true;
  if(a.vascular.vessels[0].growthStopped){if(!stopped)stopped={time:a.C.time,divisions:a.counters.endothelialDivisions};assert.equal(a.counters.endothelialDivisions,stopped.divisions);for(const m of a.live()){assert.equal(m.cycle.phase,'G0');assert.equal(m.cycle.arrest,'vessel-size');assert.equal(m.repairProgress,0);}}
 }
 assert.ok(stopped&&stopped.time<3000);assert.ok(cycled);assert.ok(a.vascular.vessels[0].radius>a.vascular.vessels[0].initialRadius);assert.ok(a.vascular.vessels[0].perfusion>0);intact(a);intact(b);
 const m=a.live()[0],rng=JSON.stringify(a.C.mt),grid=a.C.grid._pixels.slice();assert.equal(a.divide(m.id),0);assert.equal(JSON.stringify(a.C.mt),rng);assert.deepEqual(a.C.grid._pixels,grid);
});

test('limit cancels committed cycles per vessel, latches through shrinkage, and resets only when raised',()=>{
 const s=make({worldWidth:180,vessels:[{x:45,y:56,radius:17},{x:130,y:56,radius:8}]}),[v,w]=s.vascular.vessels;
 assert.ok(v.growthStopped);assert.ok(!w.growthStopped);const m=s.cells[v.cells[0]];m.cycle.phase='S';m.cycle.progress=.8;m.repairProgress=.8;m.repairCycleDrive=3;m.target*=1.7;s.vascular.checkGrowthLimit(v);
 assert.equal(m.cycle.phase,'G0');assert.equal(m.repairProgress,0);assert.equal(m.repairCycleDrive,0);assert.ok(!w.growthStopped);
 v.radius-=2;s.fields.angiogenicNormal.values.fill(2);s.vascular.biology(m,1);assert.equal(m.cycle.phase,'G0');s.set('vesselMaxDiameter',48);assert.ok(v.growthStopped);
 const remaining=m.divisionsLeft;s.set('vesselMaxDiameter',60);assert.equal(v.growthStopped,false);assert.equal(m.cycle.arrest,'');assert.equal(m.divisionsLeft,remaining);
 s.vascular.biology(m,1);assert.equal(m.cycle.phase,'G1');
});

test('a new local cluster divides and forms a lumen, then keeps all descendants in G0 under continued induction',async()=>{
 const s=make({vessels:[]});assert.ok(s.vascular.initiate(72,56,{normal:2,tumor:0,total:2,fraction:0}));await CellLabWasm.install(s,module);let stopped=null;
 for(let t=0;t<6000;t+=100){s.fields.angiogenicNormal.values.fill(2);s.advance(100);bounded(s);const v=s.vascular.vessels[0];if(v.growthStopped){stopped??=s.counters.endothelialDivisions;assert.equal(s.counters.endothelialDivisions,stopped);assert.ok(s.live().every(m=>m.cycle.phase==='G0'&&m.cycle.arrest==='vessel-size'));}}
 const v=s.vascular.vessels[0];assert.ok(stopped>0);assert.equal(v.nascent,false);assert.ok(v.patency>.85&&v.perfusion>0);intact(s);
});

test('initial/manual vessels honor the cap at different refinements; lowering never deletes tissue',async()=>{
 for(const refinement of [1,1.5,2]){const s=make({refinement,vessels:[{x:72,y:56,radius:20}],settings:{vesselMaxDiameter:30}});assert.equal(s.vascular.vessels[0].initialRadius,8*s.scale);assert.ok(s.vascular.vessels[0].growthStopped);bounded(s);intact(s);}
 const a=make({vessels:[{x:72,y:56,radius:20}],settings:{vesselMaxDiameter:80}}),b=make({vessels:[{x:72,y:56,radius:20}],settings:{vesselMaxDiameter:80}});await CellLabWasm.install(b,module);
 const before=a.C.grid._pixels.slice(),count=a.live().length;for(const s of [a,b])s.set('vesselMaxDiameter',30);assert.deepEqual(a.C.grid._pixels,before);assert.equal(a.live().length,count);assert.ok(a.vascular.vessels[0].growthStopped);
 for(let t=0;t<300;t++){a.advance(1);b.advance(1);assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);}assert.equal(a.counters.endothelialDivisions,0);intact(a);intact(b);
});

test('diameter settings and stopped status survive export; an older recipe gets the default limit',()=>{
 const s=make({settings:{vesselMaxDiameter:36}}),data={...s.snapshot(),schemaVersion:3,vessels:s.vascular.initial};assert.ok(data.vascular.vessels[0].growthStopped);
 const parsed=CellLabExperiment.parse(data),r=new CellLab.Simulation({...parsed.config,warmup:0});assert.equal(r.settings.vesselMaxDiameter,36);assert.deepEqual(r.vascular.report(),s.vascular.report());
 delete data.settings.vesselMaxDiameter;const legacy=new CellLab.Simulation({...CellLabExperiment.parse(data).config,warmup:0});assert.equal(legacy.settings.vesselMaxDiameter,48);
});
