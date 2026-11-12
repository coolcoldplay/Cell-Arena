import {peptide,trait} from './cognate-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const options={width:100,height:80,scene:'empty',warmup:0,seed:31,vessels:[{x:50,y:40,radius:11}],settings:{vesselImmuneRate:0,vesselLifespan:0,normalRepair:0,apoptosis:0}};
const create=extra=>new CellLab.Simulation({...options,...extra,settings:{...options.settings,...extra?.settings}});

test('vascular lumen is hollow, living endothelium is distinct from host normal tissue',()=>{
  const s=create(),v=s.vascular.vessels[0];assert.ok(v.active);assert.ok(v.cells.length>=6);assert.equal(s.C.pixt([50,40]),0);
  assert.equal(s.normalLivingCount(),0);assert.equal(s.populationRow().normal,0);assert.equal(s.populationRow().endothelial,v.cells.length);
  assert.ok(v.perfusion>.8);for(const id of v.cells){assert.equal(s.cells[id].state,'endothelial');assert.equal(s.components(id).length,1);assert.ok(s.cells[id].hasNucleus);}
  const first=s.cells[v.cells[0]],source=s.C.grid.p2i([Math.round(first.x),Math.round(first.y)]),center=s.C.grid.p2i([50,40]);
  assert.equal(s.vascular.allowed(source,center,first.id,0),false);
});

for(const boundary of ['solid','wrap'])test('vascular JS and WASM preserve geometry, RNG and biology: '+boundary,async()=>{
  const a=create({boundary}),b=create({boundary});for(const s of [a,b])s.vascular.enter(s.vascular.vessels[0]);const wasm=await CellLabWasm.install(b,module);
  for(let j=0;j<64;j++){
    wasm.sync();for(const tgt of a.C.borderpixels.elements.filter((_,i)=>i%31===0))for(const src of a.neighbors[tgt]){const x=a.C.pixti(src),y=a.C.pixti(tgt);if(x===y)continue;assert.ok(Math.abs(a.C.deltaH(src,tgt,x,y)-wasm.e.energy(src,tgt,x,y))<1e-8,'same vascular energy');}
    a.advance(1);b.advance(1);assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels,'lattice at '+j);assert.equal(b.C.mt.mti,a.C.mt.mti);assert.deepEqual(Uint32Array.from(b.C.mt.mt),Uint32Array.from(a.C.mt.mt));assert.deepEqual(b.contacts,a.contacts);
  }
  assert.deepEqual(b.snapshot().cells,a.snapshot().cells);assert.deepEqual(b.vascular.report(),a.vascular.report());
});

test('finite local exchange supplies oxygen/glucose and clears acid; collapse removes exchange',()=>{
  const s=create({settings:{vesselDependence:100,metabolism:0}});s.fields.oxygen.values.fill(.1);s.fields.glucose.values.fill(.1);s.fields.acid.values.fill(.8);s.updateEnvironment(4);
  const center=s.fieldIndex(50,40),far=s.fieldIndex(4,4);assert.ok(s.fields.oxygen.values[center]>.1&&s.fields.oxygen.values[center]<1);assert.ok(s.fields.glucose.values[center]>s.fields.glucose.values[far]);assert.ok(s.fields.acid.values[center]<s.fields.acid.values[far]);
  for(const id of [...s.vascular.vessels[0].cells])s.eraseCell(id);s.vascular.measure(4);assert.equal(s.vascular.report().functional,0);assert.ok(s.vascular.exchange.every(v=>v===0));
});

test('endothelium does not become precancerous, age and injury have explicit death causes',()=>{
  const s=create({settings:{vesselLifespan:100,vesselInflammation:5}}),m=s.cells[s.vascular.vessels[0].cells[0]];
  m.age=10000;s.vascular.biology(m,100);assert.ok(m.dying);assert.equal(m.deathCause,'lifespan');assert.equal(m.deathRecord.trigger,'endothelial-age');s.eraseCell(m.id);assert.equal(s.counters.endothelialDeaths,1);assert.equal(s.counters.normalEnvironmentDeaths,0);
  s.countDeath('lifespan',m);assert.equal(s.counters.endothelialDeaths,1,'repeat clearance is idempotent');
  const n=s.cells[s.vascular.vessels[0].cells[1]];n.glucose=0;n.oxygen=0;n.acid=1;s.vascular.endothelialMetabolism(n,5000);assert.ok(n.dying);assert.equal(n.state,'endothelial');assert.equal(n.deathCause,'environment');
});

test('new vascular presets keep central tumor sizes and valid connected nuclei',()=>{
  for(const [scene,n]of [['oncogenesis',0],['cold',19],['hot',37],['random',0]]){
    const s=new CellLab.Simulation({scene,worldWidth:240,worldHeight:180,refinement:1,warmup:0,seed:17});assert.equal(s.live().filter(m=>m.kind===2).length,n);assert.ok(s.vascular.report().functional>=2,scene);
    for(const m of s.live()){assert.ok(m.hasNucleus,scene+' nucleus '+m.id);assert.equal(s.components(m.id).length,1,scene+' connected '+m.id);}
  }
});

test('immune exits and tumor entry require continuous bodies and nuclei, never teleportation or a death event',async()=>{
  for(const kind of [3,2]){
    const s=create({width:110,height:90,vessels:[{x:50,y:45,radius:11}],settings:{vesselPassage:3,tumorIntravasation:3,metabolism:.3,growth:0,immuneGrowth:0}});await CellLabWasm.install(s,module);
    const v=s.vascular.vessels[0],id=kind===3?s.vascular.enter(v):s.seed(2,76,45,7),m=s.cells[id];assert.ok(m);
    // Test the crossing geometry, not whether an unconstrained initial random
    // polarity happens to bring the tumor back from the far side of the dish.
    // Only its initial direction is prescribed; contact, passage permission
    // and every subsequent membrane/nuclear step remain part of the model.
    if(kind===3)s.addSource(78,45,'trail',12);else{trait(s,m,'invasion',2.8);m.px=-1;m.py=0;s.updateMechanics(m);}
    let previous=[m.nucleusX,m.nucleusY],seenTransit=false,seenInside=false;
    for(let t=0;t<1200&&!(kind===3?s.counters.extravasations:s.counters.bloodstreamExports);t++){
      s.advance(1);if(!s.cells[id])break;
      assert.ok(Math.hypot(m.nucleusX-previous[0],m.nucleusY-previous[1])<=1.01,'nucleus moves by local lattice steps');previous=[m.nucleusX,m.nucleusY];
      assert.ok(s.section.fits(m,...previous));assert.equal(s.components(id).length,1);
      if(m.vascularPhase>=2)seenTransit=true;if(m.vascularPhase===4){seenInside=true;assert.ok(s.vascular.extent(m,v).nucleusInside);}
    }
    assert.ok(seenTransit,`kind ${kind} enters a real local transit`);assert.equal(s.counters.kills+s.counters.environment+s.counters.apoptosis+s.counters.lifespan,0);
    if(kind===3){assert.equal(s.counters.extravasations,1);assert.equal(m.vascularPhase,0);assert.ok(s.vascular.extent(m,v).nucleusOutside);}
    else{assert.ok(seenInside);assert.equal(s.counters.intravasations,1);assert.equal(s.counters.bloodstreamExports,1);assert.equal(s.cells[id],undefined);}
  }
});

test('noninvasive tumors cannot enter; no-contact geometry never licenses intravasation',async()=>{
  const s=create({settings:{tumorIntravasation:3,metabolism:0,growth:0}});await CellLabWasm.install(s,module);
  const id=s.seed(2,76,40,6),m=s.cells[id];trait(s,m,'invasion',.4);s.updateMechanics(m);s.advance(800);
  assert.equal(s.counters.intravasations,0);assert.equal(m.vascularPhase||0,0);
  const center=s.C.grid.p2i([50,40]);assert.equal(s.vascular.allowed(0,center,id,0),false);
  // Even an artificially high inherited contact counter cannot replace a
  // current geometric contact. Clearing it resets the encounter.
  trait(s,m,'invasion',3);m.vascularContact=1000;s.contacts.set(id,new Map());s.vascular.tick(100);assert.equal(m.vascularPhase||0,0);assert.equal(m.vascularContact,0);
});

test('local endothelial gaps trigger finite repair; exhausted lineages can shrink without dividing',async()=>{
  for(const budget of [0,1]){
    const s=create({width:110,height:90,vessels:[{x:50,y:45,radius:11}],settings:{vesselDivisions:budget,metabolism:.3}});await CellLabWasm.install(s,module);const v=s.vascular.vessels[0];
    for(const id of v.cells.slice(0,3))s.beginDeath(id,'environment');s.advance(250);const injured=v.perfusion;
    assert.ok(v.radius<v.initialRadius);s.advance(1750);
    assert.equal(s.counters.endothelialDeaths,3);assert.equal(s.counters.normalDivisions,0);
    if(budget){assert.ok(s.counters.endothelialDivisions>0);assert.ok(v.perfusion>injured);assert.ok(s.live().filter(m=>m.vesselID).every(m=>m.divisionsLeft>=0&&m.generation<=1));}
    else assert.equal(s.counters.endothelialDivisions,0);
    for(const m of s.live()){assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));assert.equal(s.components(m.id).length,1);}
  }
});

test('manual placement cannot overwrite vascular geometry and erasing a vessel removes its exchange immediately',()=>{
  const s=create(),v=s.vascular.vessels[0],before=s.C.grid._pixels.slice();assert.equal(s.seed(2,50,40,5),0);assert.deepEqual(s.C.grid._pixels,before);
  assert.ok(s.vascular.add(50,40,11).reason);assert.deepEqual(s.C.grid._pixels,before);
  const ctl=s.seed(3,50,40,3);assert.ok(ctl);assert.equal(s.cells[ctl].vascularPhase,1);
  for(const id of [...v.cells])s.eraseCell(id);s.vascular.measure(0);assert.equal(s.vascular.report().canRecruit,false);assert.ok(s.vascular.exchange.every(x=>!x));
});

test('health loss reduces immune availability; recruitable vessels defer no-immune restart but preserve the idle timeout',async()=>{
  vm.runInThisContext(await readFile('src/auto-random.js','utf8'));
  const s=create({settings:{vesselImmuneRate:3,vesselImmuneHealth:100}}),id=s.seed(1,12,15,5);assert.ok(id);s.updateNormalReference();s.eraseCell(id);
  const before=s.vascular.report();assert.equal(before.immuneAvailability,1);s.vascular.tick(400);const after=s.vascular.report();assert.ok(after.immuneAvailability<.38&&after.immuneAvailability>.36);
  s.set('vesselImmuneHealth',0);assert.equal(s.vascular.report().immuneAvailability,1);
  const a=create({settings:{vesselImmuneRate:3}}),snap={...a.snapshot(),playing:true,revision:1};const ctrl=new CellLabAutoRandom.Controller();ctrl.configure(1,0);ctrl.observe(snap,0);assert.equal(ctrl.reason(snap),null);
  ctrl.elapsed=60000;assert.equal(ctrl.reason(snap),'idle');snap.vascular.canRecruit=false;assert.equal(ctrl.reason(snap),'no-immune');
});

test('WASM tumor crossing retains the JavaScript lattice and seeded random trajectory',async()=>{
  const a=create({settings:{tumorIntravasation:3,metabolism:0,growth:0}}),b=create({settings:{tumorIntravasation:3,metabolism:0,growth:0}});await CellLabWasm.install(b,module);
  for(const s of [a,b]){const id=s.seed(2,76,40,6);trait(s,s.cells[id],'invasion',2.8);s.updateMechanics(s.cells[id]);}
  for(let n=0;n<400;n++){a.advance(1);b.advance(1);assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels,'crossing lattice '+n);}
  assert.deepEqual(b.counters,a.counters);assert.deepEqual(Uint32Array.from(b.C.mt.mt),Uint32Array.from(a.C.mt.mt));
});

test('vascular configuration and geometry round-trip, locks cover all controls, and translations are complete',async()=>{
  for(const f of ['src/experiment.js','src/i18n.js','src/round-history.js'])vm.runInThisContext(await readFile(f,'utf8'));
  const s=create(),snap=s.snapshot();const data={...snap,vessels:s.vascular.initial};const imported=CellLabExperiment.parse(data);
  const config=imported.config||imported;const replay=new CellLab.Simulation({...config,warmup:0});assert.deepEqual(replay.C.grid._pixels,s.C.grid._pixels);assert.deepEqual(replay.vascular.report(),s.vascular.report());
  const app=await readFile('src/app.js','utf8');for(const line of app.split('\n').filter(l=>/^\s*\['(?:vessel|tumorIntravasation)/.test(l))){const row=vm.runInNewContext(line.trim().replace(/,$/,''));for(const text of [row[1],row[5]])assert.doesNotMatch(CellLabI18n.translate(text),/[\p{Script=Han}]/u);assert.ok(CellLabExperiment.ranges[row[0]]);}
  const journal=new CellLabRounds.Journal();journal.begin(snap,0,new Date().toISOString(),{});const r=journal.finish('manual-restart',10,new Date().toISOString(),{});assert.deepEqual(r.initialVessels,s.vascular.initial);assert.equal(r.population.endothelial,8);assert.ok(JSON.stringify(r.vascular).includes('perfusion'));
});
