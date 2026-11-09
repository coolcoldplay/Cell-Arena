import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
test('random starts sample moderate ranges reproducibly, including all slider settings',()=>{
  const seen=new Set();
  for(let seed=0;seed<200;seed++){
    const settings=CellLab.randomSettings(seed);seen.add(JSON.stringify(settings));
    assert.deepEqual(settings,CellLab.randomSettings(seed));assert.deepEqual(Object.keys(settings).sort(),Object.keys(CellLab.DEFAULTS).sort());
    for(const [key,value]of Object.entries(settings)){const [min,max,step]=CellLab.RANDOM_RANGES[key];assert.ok(value>=min&&value<=max,key);assert.ok(Math.abs((value-min)/step-Math.round((value-min)/step))<1e-8,key);}
    CellLabExperiment.parse({scene:'random',seed,settings,worldWidth:240,worldHeight:180,refinement:1.5,boundary:'solid'});
  }
  assert.equal(seen.size,200);
});
test('random founder layouts differ by seed but restart and imported parameters reproduce geometry without overlapping nuclei',()=>{
  const make=(seed,settings)=>new CellLab.Simulation({scene:'random',seed,settings,worldWidth:192,worldHeight:144,refinement:1,warmup:0});
  const a=make(17),b=make(17,{...a.settings}),c=make(18);
  assert.deepEqual(a.snapshot().grid,b.snapshot().grid);assert.notDeepEqual(a.snapshot().grid,c.snapshot().grid);
  assert.deepEqual(new Set(a.live().map(m=>m.kind)),new Set([1,3]));
  assert.ok(a.snapshot().grid.every(id=>id>0),'random development also starts with a confluent normal sheet');
  assert.ok(a.live().filter(m=>m.kind===3).length>=12);assert.ok(a.live().every(m=>m.state!=='abnormal'&&m.stress===0));
  assert.deepEqual(a.supplyMap,b.supplyMap);assert.notDeepEqual(a.supplyMap,c.supplyMap);
  assert.ok(a.supplyMap.some(v=>v<.15)&&a.supplyMap.some(v=>v>.95),'both hostile niches and a viable frontier');
  assert.equal(a.scenarioReport().initial.tumor,0);assert.equal(a.scenarioReport().customized,false);assert.ok(a.settings.damagePolarization>0&&a.settings.suppressionRecovery>0);
  assert.ok(a.live().every(m=>a.section.fits(m,m.nucleusX,m.nucleusY)));assert.equal(a.C.time,0);
});
