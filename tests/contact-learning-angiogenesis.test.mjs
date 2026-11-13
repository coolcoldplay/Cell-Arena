import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/display-fields.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(extra={})=>new CellLab.Simulation({width:144,height:112,scene:'empty',warmup:0,seed:17,sectionModel:false,...extra,settings:{metabolism:0,apoptosis:0,growth:0,immuneGrowth:0,mutation:0,stressMutation:0,immuneLearning:1,immuneLearningTime:40,immuneLearningLimit:3,primingRate:0,damagePolarization:0,damageDeactivation:0,vesselImmuneRate:0,vesselLifespan:0,...extra.settings}});
function body(s,kind,x,y=30){const id=s.C.makeNewCellID(kind);for(let a=x;a<x+8;a++)for(let b=y;b<y+8;b++)s.C.setpix([a,b],id);s.refreshPositions();s.scanContacts();const m=s.cells[id];m.fitness=1;m.immuneRefractory=0;return m;}
function antigen(s,m){s.immunity.alter(m,g=>{Object.assign(g.peptides[0],{sequence:'AAAAAA',channel:0,present:true,base:1});g.presentation=[1,1];});m.expression.peptides=[1];m.expression.presentation=[1,1];}
function mismatch(s,m){s.immunity.alter(m,g=>g.receptor={sequence:'CCCCCC',channel:1});m.primed=false;}
function learn(s,n){for(let i=0;i<n;i++){s.C.time++;s.immunity.contactLearning(1);}}
test('contact cargo teaches a previously mismatching immune cell without changing inherited genes or tumor slot',()=>{
 const s=make(),target=body(s,2,20),donor=body(s,3,28),receiver=body(s,3,36),far=body(s,3,70);antigen(s,target);for(const m of [donor,receiver,far])mismatch(s,m);
 const genes=JSON.stringify(s.immunity.genes(receiver));assert.equal(s.immunity.evaluate(receiver,target).score,0);
 learn(s,20);assert.equal(donor.antigenCargo.length,1);assert.equal(receiver.learnedReceptors.length,0);assert.equal(s.immunity.metrics.antigenUptakes,1);
 learn(s,50);assert.equal(receiver.learnedReceptors.length,1);assert.equal(s.immunity.evaluate(receiver,target).score,1);assert.equal(JSON.stringify(s.immunity.genes(receiver)),genes);assert.equal(far.learnedReceptors.length,0);assert.equal(s.immunity.genes(target).peptides.length,1);assert.ok(s.immunity.metrics.antigenTransfers>0);
 assert.equal(target.damage,0,'learning does not deliver remote damage');s.immunity.alter(target,g=>g.peptides[0].present=false);assert.equal(s.immunity.evaluate(receiver,target).stimulus,0,'learning cannot bypass antigen loss');
});
test('learning requires continuous contact and immutable source lifetime; no in-step multi-hop relay',()=>{
 const s=make(),a=body(s,3,20),b=body(s,3,28),c=body(s,3,36);for(const m of [a,b,c])mismatch(s,m);
 a.antigenCargo=[{sequence:'AAAAAA',channel:0,sourceBirth:99,collectedAt:0,expiresAt:200,hops:0}];
 learn(s,24);assert.equal(b.antigenCargo.length,1);assert.equal(c.antigenCargo.length,0);assert.equal(b.antigenCargo[0].expiresAt,200);
 const contacts=s.contacts.get(b.id);s.contacts.set(b.id,new Map());learn(s,1);s.contacts.set(b.id,contacts);learn(s,20);assert.equal(b.learnedReceptors.length,0);learn(s,20);assert.equal(b.learnedReceptors.length,1);
 s.C.time=201;learn(s,1);assert.equal(a.antigenCargo.length,0);assert.equal(b.antigenCargo.length,0);assert.equal(c.antigenCargo.length,0);
});
test('learned recognition does not expire; lowering a limit or disabling new learning does not erase it',()=>{
 const s=make(),m=body(s,3,30);mismatch(s,m);m.learnedReceptors=[{sequence:'AAAAAA',channel:0,learnedAt:0}];s.C.time=100000;s.settings.immuneLearning=0;s.settings.immuneLearningLimit=0;learn(s,10);assert.equal(m.learnedReceptors.length,1);assert.equal(s.immunity.match(m,{sequence:'AAAAAA',channel:0},false),1);
});
test('learned recognition is inherited by both daughters with independent arrays',()=>{
 const s=make(),m=body(s,3,30);m.learnedReceptors=[{sequence:'AAAAAA',channel:0,learnedAt:0}];m.divisionsLeft=3;for(let x=38;x<48;x++)for(let y=30;y<38;y++)s.C.setpix([x,y],m.id);s.refreshPositions();const child=s.divide(m.id);assert.ok(child);assert.deepEqual(s.cells[child].learnedReceptors,m.learnedReceptors);assert.notEqual(s.cells[child].learnedReceptors,m.learnedReceptors);s.cells[child].learnedReceptors[0].sequence='AAAACC';assert.equal(m.learnedReceptors[0].sequence,'AAAAAA');
});
test('learned outline belongs to an individual cell, not every member of its genetic clone',()=>{
 const s=make(),target=body(s,2,20),a=body(s,3,40),b=body(s,3,60);antigen(s,target);mismatch(s,a);s.immunity.bind(b,a.geneClone);a.learnedReceptors=[{sequence:'AAAAAA',channel:0,learnedAt:0}];
 const rng=JSON.stringify(s.immunity.rng),v=CellLabDisplay.antigenVisuals(s.snapshot());assert.equal(v.outlines.get(a.id).segments.length,1);assert.equal(v.outlines.has(b.id),false);assert.equal(JSON.stringify(s.immunity.rng),rng);
});
test('hypoxic normal and tumor cells secrete separate factors; oxygen recovery, death and endothelium stop sources',()=>{
 const s=make(),normal=body(s,1,20),tumor=body(s,2,80);normal.oxygen=tumor.oxygen=.1;s.updateSignals(4);assert.ok(s.fields.angiogenicNormal.values.some(x=>x>0));assert.ok(s.fields.angiogenicTumor.values.some(x=>x>0));const n=[...s.fields.angiogenicNormal.values].reduce((a,b)=>a+b),t=[...s.fields.angiogenicTumor.values].reduce((a,b)=>a+b);assert.ok(Math.abs(n-t)<1e-6);
 normal.oxygen=1;tumor.dying=true;s.updateSignals(4);assert.ok([...s.fields.angiogenicNormal.values].reduce((a,b)=>a+b)<n);assert.ok([...s.fields.angiogenicTumor.values].reduce((a,b)=>a+b)<t);
});
test('mixed provenance monotonically lowers oxygen/glucose supply and acid removal at equal total signal',()=>{
 const outcomes=[];for(const fraction of [0,.5,1]){const s=make({vessels:[{x:72,y:56,radius:11}],settings:{vesselDependence:100}}),v=s.vascular.vessels[0];s.fields.angiogenicNormal.values.fill(2*(1-fraction));s.fields.angiogenicTumor.values.fill(2*fraction);s.vascular.measure(1200);s.fields.oxygen.values.fill(.1);s.fields.glucose.values.fill(.1);s.fields.acid.values.fill(.8);s.updateEnvironment(4);const i=s.fieldIndex(72,56);outcomes.push({quality:v.quality,oxygen:s.fields.oxygen.values[i],glucose:s.fields.glucose.values[i],acid:s.fields.acid.values[i]});}
 for(let i=1;i<3;i++){assert.ok(outcomes[i].quality<outcomes[i-1].quality);assert.ok(outcomes[i].oxygen<outcomes[i-1].oxygen);assert.ok(outcomes[i].glucose<outcomes[i-1].glucose);assert.ok(outcomes[i].acid>outcomes[i-1].acid);}
});
test('a vascular sprout transfers existing endothelium, supplies nothing until mature and never overwrites tissue',()=>{
 const s=make({vessels:[{x:72,y:56,radius:11}],sectionModel:true}),v=s.vascular.vessels[0],m=s.cells[v.cells[0]];
 assert.equal(s.vascular.sprout(m,v),false,'no induction below threshold');s.fields.angiogenicNormal.values.fill(2);const pixels=s.C.grid._pixels.slice(),count=s.live().length;assert.ok(s.vascular.sprout(m,v));assert.deepEqual(s.C.grid._pixels,pixels);assert.equal(s.live().length,count);const bud=s.vascular.vessels.at(-1);assert.equal(bud.nascent,true);assert.equal(bud.perfusion,0);assert.equal(bud.parent,v.id);s.vascular.measure(4);assert.equal(bud.perfusion,0);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));
});
test('only tumors confirmed inside the lumen leave within 40 MCS, even if perfusion collapses',()=>{
 const s=make({vessels:[{x:72,y:56,radius:11}]}),v=s.vascular.vessels[0],tumor=body(s,2,68,52),immune=body(s,3,71,42);Object.assign(tumor,{vascularID:v.id,vascularPhase:4,bloodstreamEnteredAt:0});Object.assign(immune,{vascularID:v.id,vascularPhase:1});v.perfusion=0;const deaths=s.deathHistory.length;
 s.C.time=39;s.vascular.tick(1);assert.ok(s.cells[tumor.id]);s.C.time=40;s.vascular.tick(1);assert.equal(s.cells[tumor.id],undefined);assert.ok(s.cells[immune.id]);assert.equal(s.counters.bloodstreamExports,1);assert.equal(s.deathHistory.length,deaths);assert.equal(s.counters.kills,0);
});
test('actual endothelial budding preserves JS/WASM trajectories and connected nuclei',async()=>{
 const config={width:160,height:128,scene:'empty',seed:31,warmup:0,vessels:[{x:80,y:64,radius:11}],settings:{metabolism:.25,supply:3,apoptosis:0,vesselLifespan:0,vesselImmuneRate:0,vesselDivisions:6,immuneLearning:0}},a=new CellLab.Simulation(config),b=new CellLab.Simulation(config);
 await CellLabWasm.install(b,await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')));
 for(let t=0;t<1800;t+=100){for(const s of [a,b]){s.fields.angiogenicNormal.values.fill(2);s.advance(100);}assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels);assert.deepEqual(b.counters,a.counters);assert.deepEqual(b.vascular.report(),a.vascular.report());}
 assert.ok(a.counters.vascularSprouts>0);assert.ok(a.vascular.vessels[0].radius>a.vascular.vessels[0].initialRadius);
 for(const m of a.live()){assert.equal(a.components(m.id).length,1);assert.ok(a.section.fits(m,m.nucleusX,m.nucleusY));assert.ok(m.divisionsLeft>=0);}
});
test('new controls serialize, validate limits, randomize within bounds and translate completely',async()=>{
 for(const f of ['src/experiment.js','src/i18n.js'])vm.runInThisContext(await readFile(f,'utf8'));
 const app=await readFile('src/app.js','utf8');for(const line of app.split('\n').filter(l=>/^\s*\['(?:immuneLearning|angiogen|tumorVesselPenalty)/.test(l))){const row=vm.runInNewContext(line.trim().replace(/,$/,''));assert.ok(CellLabExperiment.ranges[row[0]]);for(const text of [row[1],row[5]])assert.doesNotMatch(CellLabI18n.translate(text),/\p{Script=Han}/u);}
 for(let seed=1;seed<=30;seed++){const settings=CellLab.randomSettings(seed),s=make({settings}),d={...s.snapshot(),schemaVersion:3,vessels:[]};assert.equal(CellLabExperiment.parse(d).migration,false);for(const key of ['immuneLearning','immuneLearningTime','immuneLearningLimit','angiogenesis','angiogenicThreshold','angiogenicHalfLife']){const range=CellLabExperiment.ranges[key];assert.ok(settings[key]>=range[0]&&settings[key]<=range[1]);}}
});
