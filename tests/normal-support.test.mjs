import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/insertion.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=settings=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,settings:{growth:0,immuneGrowth:0,apoptosis:0,metabolism:0,...settings}});
function normals(s){return [15,35,55,75].map(x=>s.seed(1,x,18,5));}
test('custom scenes default to no coupling and no-normal scenes have a neutral reference',()=>{
 const s=make();assert.equal(s.settings.normalSupport,0);assert.deepEqual(s.normalSupportReport(),{living:0,reference:0,retained:1,strength:0,factor:1,effectiveSupply:s.settings.supply});
 s.set('normalSupport',100);assert.equal(s.normalSupportReport().factor,1);assert.equal(make({normalSupport:60}).settings.normalSupport,60);
});
test('support depends on surviving healthy normal cells, not tumor dilution or dying bodies',()=>{
 const s=make({normalSupport:100}),ids=normals(s);assert.equal(s.normalSupportReport().reference,4);
 s.beginDeath(ids[0],'environment');s.beginAbnormal(ids[1]);s.seed(2,30,50,5);s.seed(3,55,50,4);
 assert.equal(s.normalSupportReport().retained,.5);assert.equal(s.normalSupportReport().factor,.5);
 s.set('normalSupport',50);assert.equal(s.normalSupportReport().factor,.75);s.set('normalSupport',0);assert.equal(s.normalSupportReport().factor,1);
 s.eraseCell(ids[0]);assert.equal(s.normalSupportReport().retained,.5,'clearing the already dying body does not subtract it twice');
});
test('reference tracks successful additions and stays independent of snapshots and slider changes',()=>{
 const s=make({normalSupport:100}),ids=normals(s);s.eraseCell(ids[0]);s.eraseCell(ids[1]);const before=s.normalSupportReport(),rng=Uint32Array.from(s.C.mt.mt);
 for(let i=0;i<12;i++)s.snapshot();assert.deepEqual(s.normalSupportReport(),before);assert.deepEqual(Uint32Array.from(s.C.mt.mt),rng);
 s.set('normalSupport',0);s.set('normalSupport',100);assert.equal(s.normalSupportReport().reference,4);
 s.seed(1,15,18,5);assert.equal(s.normalSupportReport().retained,.75);
 assert.equal(s.seed(1,55,18,5),0);assert.equal(s.normalSupportReport().reference,4,'failed placement cannot inflate the reference');
});
test('coupling multiplies oxygen, glucose supply and acid clearance by the same explicit factor',()=>{
 const a=make({normalSupport:100,supply:2}),b=make({normalSupport:0,supply:1});
 for(const s of [a,b]){const ids=normals(s);s.eraseCell(ids[0]);s.eraseCell(ids[1]);s.fields.oxygen.values.fill(.2);s.fields.glucose.values.fill(.3);s.fields.acid.values.fill(.8);s.updateEnvironment(4);}
 for(const key of ['oxygen','glucose','acid'])assert.deepEqual(a.fields[key].values,b.fields[key].values,key);
 const zero=make({normalSupport:100,supply:3}),id=zero.seed(1,30,30,5);zero.eraseCell(id);for(const key of ['oxygen','glucose','acid'])zero.fields[key].values.fill(.4);zero.updateEnvironment(4);
 assert.equal(zero.normalSupportReport().factor,0);for(const key of ['oxygen','glucose','acid'])assert.ok(zero.fields[key].values.every(v=>Math.abs(v-.4)<1e-7));
});
test('reference survives normal division and resumes after adding cells to an empty custom dish',()=>{
 const s=make({normalSupport:100}),id=s.seed(1,40,30,10);assert.equal(s.normalSupportReport().reference,1);assert.ok(s.divide(id));assert.equal(s.normalSupportReport().reference,2);s.eraseCell(id);assert.equal(s.normalSupportReport().retained,.5);
});
test('coupling settings round-trip and invalid imported values are rejected',()=>{
 const s=make({normalSupport:67}),data={scene:s.scene,seed:s.seedValue,boundary:s.boundary,worldWidth:s.worldWidth,worldHeight:s.worldHeight,refinement:s.scale,settings:s.settings};
 assert.equal(CellLabExperiment.parse(data).config.settings.normalSupport,67);assert.throws(()=>CellLabExperiment.parse({...data,settings:{...s.settings,normalSupport:101}}));s.set('normalSupport',200);assert.equal(s.settings.normalSupport,100);s.set('normalSupport',-1);assert.equal(s.settings.normalSupport,0);
});
