import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));

for(const [scene,seed] of [['oncogenesis',17],['random',31]])test(`${scene} retains a viable tissue frontier during spontaneous initiation`,async()=>{
  const s=new CellLab.Simulation({scene,seed,worldWidth:240,worldHeight:180,refinement:1,boundary:'wrap'});
  await CellLabWasm.install(s,module);
  const initial=s.normalLivingCount();assert.equal(s.scenarioReport().initial.tumor,0);
  s.advance(1500);
  const viable=s.live().filter(m=>!m.dying&&!m.vesselID),normal=viable.filter(m=>m.state==='normal'),immune=viable.filter(m=>m.kind===3);
  assert.ok(normal.length>initial*.5,`${normal.length}/${initial} healthy cells: early global conversion/collapse`);
  assert.ok(viable.length>initial*.7,'local injury must not erase most of the tissue before clonal expansion');
  assert.ok(immune.length>=6,'a metabolically viable patrol population remains');
  assert.ok(s.counters.abnormalInitiations>0,'local stress still creates unplanted precancerous cells');
  assert.ok(s.deathHistory.filter(d=>d.cause==='environment').length<initial*.25,'environmental injury stays localized during onset');
  assert.equal(s.snapshot().orphans,0);
});
