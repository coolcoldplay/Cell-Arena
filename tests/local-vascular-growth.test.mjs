import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/display-fields.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
// Keep a high explicit diameter in these older mechanism-isolation fixtures.
// Default-limit enforcement has separate multi-scale and strong-drive tests.
const make=(extra={})=>new CellLab.Simulation({worldWidth:160,worldHeight:128,refinement:1,scene:'empty',warmup:0,seed:17,...extra,settings:{metabolism:.25,supply:3,apoptosis:0,vesselLifespan:0,vesselImmuneRate:0,vesselDivisions:6,vesselMaxDiameter:160,stressMutation:0,progression:0,...extra.settings}});
const mix=f=>({normal:2*(1-f),tumor:2*f,total:2,fraction:f});
const intact=s=>{for(const m of s.live().filter(m=>!m.dying)){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));}};
test('sustained hypoxia and induction initiate a solid three-cell cluster without any prior vessel',()=>{
 for(const [oxygen,signal,rate,expected]of [[1,2,1,0],[.1,0,1,0],[.1,2,0,0],[.1,2,1,1]]){
  const s=make({settings:{angiogenesis:rate}}),i=s.fieldIndex(80,64);s.fields.oxygen.values[i]=oxygen;s.fields.angiogenicNormal.values[i]=signal;
  for(let t=40;t<=240;t+=40){s.C.time=t;s.vascular.tick(40);}assert.equal(s.vascular.vessels.length,expected);
  if(expected){const v=s.vascular.vessels[0];assert.equal(v.parent,0);assert.equal(v.radius,0);assert.equal(v.cells.length,3);assert.equal(v.perfusion,0);assert.ok(s.C.pixt([v.x,v.y]));assert.ok(v.localOrigin);assert.deepEqual(s.vascular.initial,[]);intact(s);}
 }
});
test('a distant induction site starts independently of existing vessels',()=>{
 const s=make({worldWidth:220,worldHeight:160,vessels:[{x:40,y:40,radius:11}]}),i=s.fieldIndex(170,110);s.fields.oxygen.values[i]=.05;s.fields.angiogenicTumor.values[i]=2;
 for(let t=40;t<=240;t+=40){s.C.time=t;s.vascular.tick(40);}const v=s.vascular.vessels[1];assert.ok(v);assert.equal(v.parent,0);assert.ok(s.vascular.distance(v.x,v.y,s.vascular.vessels[0])>100);assert.equal(v.tumorFraction,1);intact(s);
});
test('cluster insertion preserves existing dense tissue; impossible insertion is atomic',()=>{
 const s=make({scene:'oncogenesis',vessels:[]}),old=s.live().map(m=>({id:m.id,birth:m.birth,target:m.target}));assert.ok(s.C.pixt([68,48]));assert.ok(s.vascular.initiate(68,48,mix(0)));assert.equal(s.live().length,old.length+3);
 for(const m of old){assert.ok(s.cells[m.id]);assert.equal(s.cells[m.id].birth,m.birth);assert.equal(s.cells[m.id].target,m.target);}assert.equal(s.counters.normalDivisions,0);assert.equal(s.counters.manualRemoved,0);intact(s);
 const grid=s.C.grid._pixels.slice(),rng=JSON.stringify(s.C.mt),count=s.live().length;assert.equal(s.vascular.initiate(68,48,mix(0)),false);assert.deepEqual(s.C.grid._pixels,grid);assert.equal(JSON.stringify(s.C.mt),rng);assert.equal(s.live().length,count);
});
test('a cluster opens a lumen through real division; JS and WASM retain the same trajectory',async()=>{
 const a=make(),b=make();for(const s of [a,b])assert.ok(s.vascular.initiate(80,64,mix(0)));await CellLabWasm.install(b,await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')));
 for(let t=0;t<4000;t+=100){for(const s of [a,b]){s.fields.angiogenicNormal.values.fill(2);s.advance(100);}assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels);assert.deepEqual(b.vascular.report(),a.vascular.report());}
 const v=a.vascular.vessels[0];assert.ok(a.counters.endothelialDivisions>=3);assert.ok(v.radius>20);assert.ok(v.patency>.85);assert.equal(v.nascent,false);assert.ok(v.perfusion>.5);intact(a);intact(b);
});
test('radius has no initial-size multiple cap; expansion waits for neighbouring tissue nuclei',()=>{
 const s=make({worldWidth:240,worldHeight:180,vessels:[{x:120,y:90,radius:8}]}),v=s.vascular.vessels[0];v.initialMass/=5;s.vascular.measure(4000);assert.ok(v.radius>v.initialRadius*1.8);
 const q=make({vessels:[]}),id=q.seed(1,102,64,5),m=q.cells[id];assert.ok(q.vascular.initiate(80,64,mix(0)));const b=q.vascular.vessels[0];b.initialMass=1;
 // Force mass well above available room; a nucleus remains a real obstacle.
 for(const id of b.cells){const c=q.cells[id];c.base=c.target=500;}b.radius=15;const original=q.C.grid._pixels.slice();q.vascular.measure(10000);
 assert.ok(b.radius<=Math.hypot(m.nucleusX-b.x,m.nucleusY-b.y)-m.nucleusRadius);assert.ok(q.cells[id]);assert.deepEqual(q.C.grid._pixels,original);intact(q);
});
test('outward tissue passage is local, protects nuclei and never deletes the trapped normal cell',async()=>{
 const s=make({settings:{growth:0,metabolism:0,angiogenesis:0,vesselDivisions:0}}),id=s.seed(1,80,64,5),m=s.cells[id],v=s.vascular.plan(80,64,11);assert.ok(s.vascular.seedRing(v));s.vascular.measure(0);
 const before=s.vascular.extent(m,v).inside;assert.equal(m.lumenExitID,v.id);await CellLabWasm.install(s,await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')));
 let previous=[m.nucleusX,m.nucleusY];for(let t=0;t<1200;t++){s.advance(1);assert.ok(s.cells[id]);assert.ok(Math.hypot(m.nucleusX-previous[0],m.nucleusY-previous[1])<=1.01);previous=[m.nucleusX,m.nucleusY];}
 assert.ok(s.vascular.extent(m,v).inside<before*.25);assert.equal(s.deathHistory.length,0);assert.equal(s.counters.bloodstreamExports,0);intact(s);
});
test('source-dependent function is inherited, controls real exchange and uses the same fixed color scale',()=>{
 const rows=[];for(const f of [0,.5,1]){const s=make({vessels:[{x:80,y:64,radius:11}],settings:{vesselDependence:100}}),v=s.vascular.vessels[0];for(const id of v.cells)s.cells[id].endothelialTumorFraction=f;s.vascular.measure(0);s.fields.oxygen.values.fill(.1);s.fields.glucose.values.fill(.1);s.fields.acid.values.fill(.8);s.updateEnvironment(4);const i=s.fieldIndex(80,64),m=s.cells[v.cells[0]],c=CellLabDisplay.bodyColor(m,CellLabDisplay.normalizeColors());rows.push({q:v.quality,o:s.fields.oxygen.values[i],g:s.fields.glucose.values[i],a:s.fields.acid.values[i],shade:CellLabDisplay.endothelialShade(m),c});
  const child=s.divide(m.id);assert.ok(child);assert.equal(s.cells[child].endothelialTumorFraction,f);m.endothelialInjury=.5;s.vascular.measure(0);assert.ok(m.endothelialFunction<s.cells[child].endothelialFunction);assert.ok(s.snapshot().cells.find(c=>c.id===m.id).endothelialFunction<1);
 }
 for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];assert.ok(b.q<a.q&&b.o<a.o&&b.g<a.g&&b.a>a.a);assert.ok(b.shade>a.shade);assert.ok(b.c.every((v,j)=>v>=a.c[j]));}
});

test('endothelial nuclei are smaller at all resolutions, including both daughters and local clusters',()=>{
 for(const refinement of [1,1.5,2]){const s=make({refinement,vessels:[{x:80,y:64,radius:11}]}),v=s.vascular.vessels[0];
  for(const id of v.cells)assert.equal(s.cells[id].nucleusRadius,1.5*s.scale);
  const parent=s.cells[v.cells.reduce((a,b)=>s.C.getVolume(a)>s.C.getVolume(b)?a:b)],child=s.divide(parent.id);assert.ok(child);assert.equal(parent.nucleusRadius,1.5*s.scale);assert.equal(s.cells[child].nucleusRadius,1.5*s.scale);intact(s);
  const q=make({refinement});assert.ok(q.vascular.initiate(80*q.scale,64*q.scale,mix(0)));for(const m of q.live())assert.equal(m.nucleusRadius,1.5*q.scale);intact(q);
 }
});

test('a gap without endothelial loss does not amplify repair; weak induction remains weak',()=>{
 const s=make({vessels:[{x:80,y:64,radius:11}],settings:{metabolism:0}}),v=s.vascular.vessels[0],m=s.cells[v.cells[0]],initial=m.target;
 // Hold the geometric gap cue high to isolate false repair-driven expansion.
 // Cells and the wall's basal mass remain present, as in a membrane fluctuation.
 s.vascular.localGap=()=>[true,true];m.fitness=1;m.glucose=m.oxygen=1;m.acid=0;
 for(let i=0;i<200;i++)s.vascular.biology(m,1);
 assert.equal(m.target,initial);assert.equal(m.repairProgress,0);assert.equal(s.counters.endothelialDivisions,0);
 s.fields.angiogenicNormal.values.fill(s.settings.angiogenicThreshold*1.01);
 for(let i=0;i<120;i++)s.vascular.biology(m,1);
 assert.ok(m.target>initial&&m.target<initial+1);assert.ok(m.repairProgress<.01);
});
