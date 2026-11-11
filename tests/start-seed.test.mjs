import {assertConfluentTissue} from './vascular-layout-helper.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/model.js','src/experiment.js','src/start-seed.js'])vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
const inputs={now:()=>1794300000123,precise:()=>12.345,random:()=>0xa812f035};
const first=overrides=>CellLabStartSeed.createGenerator({...inputs,...overrides})();
const fingerprint=s=>createHash('sha256').update(new Uint8Array(s.C.grid._pixels.buffer)).digest('hex');

test('new visit seeds mix wall-clock time and independent same-millisecond entropy over uint32',()=>{
  const base=first();assert.equal(first(),base,'controlled inputs are testable');
  assert.notEqual(first({now:()=>1794300000124}),base,'wall-clock arrival changes seed');
  assert.notEqual(first({now:()=>1794300000123+4294967296}),base,'do not wrap timestamps every 49.7 days');
  assert.notEqual(first({random:()=>0xa812f034}),base,'simultaneous visitors get independent entropy');
  assert.notEqual(first({precise:()=>12.346}),base,'include sub-ms timing');
  const next=CellLabStartSeed.createGenerator(inputs),seeds=Array.from({length:1000},()=>next());
  assert.equal(new Set(seeds).size,seeds.length,'repeated starts work even with frozen time/entropy');
  assert.ok(seeds.every(s=>Number.isInteger(s)&&s>=0&&s<=0xffffffff));
  assert.ok(seeds.some(s=>s>0x7fffffff),'retain full 32-bit range instead of six-digit truncation');
});

test('startup still works without crypto or performance in an offline browser',async()=>{
  const context=vm.createContext({});vm.runInContext(await readFile('src/start-seed.js','utf8'),context);
  const seeds=vm.runInContext('Array.from({length:20},CellLabStartSeed.createGenerator())',context);
  assert.equal(new Set(seeds).size,20);assert.ok(seeds.every(Number.isInteger));
});

test('visit seeds diversify actual onset geometry while retaining the bounded competitive preset',()=>{
  const hashes=new Set();let baseline;
  for(let i=0;i<12;i++){
    const seed=first({now:()=>1794300000123+i*1111,random:()=>Math.imul(i+1,0x9e3779b9)>>>0});
    const s=new CellLab.Simulation({scene:'oncogenesis',seed,worldWidth:192,worldHeight:144,refinement:1,warmup:0,boundary:'wrap'});
    assert.deepEqual(s.settings,{...CellLab.DEFAULTS,...CellLab.PRESETS.oncogenesis.settings});
    const report=s.scenarioReport();assert.equal(report.initial.tumor,0);assert.equal(report.initial.immune,12);assert.ok(s.live().every(m=>m.state!=='abnormal'&&m.stress===0));
    assertConfluentTissue(s);
    assert.ok(s.supplyMap.some(v=>v<.3)&&s.supplyMap.some(v=>v>.95),'weak niches and viable edges remain');
    if(baseline)assert.deepEqual(s.supplyMap,baseline);else baseline=s.supplyMap.slice();
    assert.ok(s.live().every(m=>s.section.fits(m,m.nucleusX,m.nucleusY)));hashes.add(fingerprint(s));
  }
  assert.equal(hashes.size,12);
});

test('a generated unsigned seed survives parameter import and exactly replays model evolution',()=>{
  const seed=0xfea5c123,config={scene:'oncogenesis',seed,worldWidth:192,worldHeight:144,refinement:1,boundary:'wrap',settings:{...CellLab.PRESETS.oncogenesis.settings}};
  const imported=CellLabExperiment.parse(config).config,a=new CellLab.Simulation(config),b=new CellLab.Simulation(imported);
  assert.equal(imported.seed,seed);assert.equal(fingerprint(a),fingerprint(b));
  a.advance(40);b.advance(40);
  assert.equal(fingerprint(a),fingerprint(b));assert.deepEqual(a.counters,b.counters);assert.deepEqual(a.C.mt.mt,b.C.mt.mt);
});
