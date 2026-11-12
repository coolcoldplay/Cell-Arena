import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=boundary=>new CellLab.Simulation({worldWidth:96,worldHeight:72,refinement:1,scene:'empty',seed:17,boundary,warmup:0});
test('one brush removes whole cells, source objects, wall pixels and local fields without counting a biological death',()=>{
 const s=make('solid'),a=s.seed(1,29,30,4),b=s.seed(2,76,30,4);s.paint(39,30,2);s.addSource(36,32,'trail',3);s.addSource(76,30,'trail',3);s.pulse(35,30,'hostile',10);
 const i=s.fieldIndex(35,30),far=s.fieldIndex(76,30);assert.ok(s.fields.acid.values[i]>0);
 const r=s.eraseAll([[35,30]],9);assert.equal(r.removed,1);assert.equal(r.sources,1);assert.ok(r.wallPixels>0);assert.equal(s.cells[a],undefined);assert.ok(s.cells[b]);assert.equal(s.sources.length,1);
 assert.equal(s.C.pixt([39,30]),0);assert.equal(s.fields.oxygen.blocked[i],0);assert.equal(s.fields.oxygen.values[i],1);assert.equal(s.fields.glucose.values[i],1);assert.equal(s.fields.acid.values[i],0);assert.equal(s.fields.trail.values[i],0);assert.ok(s.fields.trail.values[far]>0);
 assert.equal(s.counters.manualRemoved,1);assert.equal(s.counters.apoptosis+s.counters.kills+s.counters.environment+s.counters.lifespan,0);assert.equal(s.eraseAll([[35,30]],9).removed,0);
});
test('the universal eraser respects periodic brush geometry and rejects invalid inputs',()=>{
 const s=make('wrap');s.paint(94,30,1);s.addSource(93,30,'acid',2);const a=s.seed(3,90,35,3);const r=s.eraseAll([[1,30]],10);
 assert.equal(r.removed,1);assert.equal(s.cells[a],undefined);assert.equal(r.sources,1);assert.ok(r.wallPixels>0);assert.equal(s.C.pixt([94,30]),0);
 const before=s.snapshot();for(const [points,radius] of [[null,5],[[[NaN,3]],5],[[[20,20]],-1]]){const removed=s.eraseAll(points,radius);assert.equal(removed.removed+removed.sources+removed.wallPixels,0);}assert.deepEqual(s.snapshot().grid,before.grid);
});
test('erasing a maze wall updates both its collision grid and smooth curve cutouts',()=>{
 const s=make('solid');s.paint(30,30,3);s.maze={cutouts:[],curves:[],wallID:s.wallID};const r=s.eraseAll([[30,30]],4);
 assert.ok(r.wallPixels>0);assert.deepEqual(s.maze.cutouts,[[30.5,30.5,4]]);assert.equal(s.C.pixt([30,30]),0);
});
