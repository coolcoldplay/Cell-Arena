import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(settings={})=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,seed:17,sectionModel:false,settings:{stemFraction:100,stemPlasticity:0,apoptosis:0,growth:0,normalRepair:0,metabolism:0,mutation:0,...settings}});
function body(s,kind=2){const id=s.C.makeNewCellID(kind);for(let x=30;x<50;x++)for(let y=20;y<40;y++)s.C.setpix([x,y],id);s.refreshPositions();s.scanContacts();return s.cells[id];}
test('initial stemness is seeded, tumor-specific, and independent of antigen visibility',()=>{
 const s=make({antigen:100}),m=body(s),n=body(make({stemFraction:0}));assert.equal(m.isStem,true);assert.equal(m.antigen,true);assert.equal(n.isStem,false);assert.equal(body(make(),1).isStem,false);
});
test('actual asymmetric cytokinesis creates one stem and one differentiated daughter',()=>{
 const s=make({stemSymmetry:0}),m=body(s);assert.equal(m.isStem,true);const child=s.divide(m.id);assert.ok(child);assert.equal([m,s.cells[child]].filter(c=>c.isStem).length,1);assert.equal(s.counters.stemAsymmetric,1);assert.equal(s.counters.stemSelfRenewal,0);
});
test('both symmetric modes act on the two real daughter identities',()=>{
 for(const renewal of [0,100]){const s=make({stemSymmetry:100,stemRenewal:renewal}),m=body(s),child=s.divide(m.id);assert.ok(child);assert.equal([m,s.cells[child]].filter(c=>c.isStem).length,renewal?2:0);assert.equal(s.counters[renewal?'stemSelfRenewal':'stemDifferentiation'],1);}
});
test('stem repair can improve DNA repair without removing immune damage or granting antigen invisibility',()=>{
 const s=make({stemRepair:2}),m=body(s);assert.equal(m.isStem,true);m.cycle.phase='G2';m.resources.dnaDamage=.4;m.damage=.3;const a=m.resources.dnaDamage;s.updateResources(m,30);const stemRepair=a-m.resources.dnaDamage;
 m.isStem=false;m.resources.dnaDamage=.4;s.updateResources(m,30);assert.ok(stemRepair>.4-m.resources.dnaDamage);assert.equal(m.damage,.3);
});
test('plasticity requires viable, sustained local hypoxic exposure and never rescues a dying cell',()=>{
 const s=make({stemFraction:0,stemPlasticity:3}),m=body(s);assert.equal(typeof s.stemProgram,'function');s.C.random=()=>0;s.stemProgram(m,10);assert.equal(m.isStem,false);
 m.oxygen=.2;m.glucose=.7;m.fitness=.4;s.stemProgram(m,1);assert.equal(m.isStem,false);m.stemNiche=.8;s.stemProgram(m,1);assert.equal(m.isStem,true);assert.equal(s.counters.stemReversions,1);
 m.isStem=false;m.dying=true;s.stemProgram(m,1000);assert.equal(m.isStem,false);
});
test('default malignant lineages remain unlimited; optional differentiated budgets deplete without restricting stem renewal',()=>{
 const a=make({stemFraction:0}),x=body(a);assert.equal(x.tumorDivisionsLeft,null);assert.ok(a.divide(x.id));
 const b=make({stemFraction:0,tumorProgenyLimit:1}),y=body(b),child=b.divide(y.id);assert.ok(child);assert.equal(y.tumorDivisionsLeft,0);assert.equal(b.cells[child].tumorDivisionsLeft,0);assert.equal(b.divide(y.id),0);
 const c=make({tumorProgenyLimit:1,stemSymmetry:100,stemRenewal:100}),z=body(c);assert.ok(c.divide(z.id));assert.equal(z.tumorDivisionsLeft,null);
});
test('all stem controls import, snapshot, and states export without relabeling the CPM cell kind',()=>{
 const s=make(),m=body(s),snap=s.snapshot();assert.equal(snap.cells[0].isStem,true);assert.equal(snap.cells[0].kind,2);
 const settings={stemFraction:20,stemSymmetry:30,stemRenewal:60,stemCycleSlowdown:1.35,stemRepair:1.4,stemPlasticity:.25,tumorProgenyLimit:0};
 assert.deepEqual(CellLabExperiment.parse({scene:'empty',seed:17,boundary:'wrap',refinement:1,worldWidth:96,worldHeight:72,settings}).config.settings,settings);
});
