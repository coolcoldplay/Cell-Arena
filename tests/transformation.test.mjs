import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(settings={},options={})=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,seed:17,settings:{growth:0,apoptosis:0,progression:0,...settings},...options});
const adverse=s=>{s.fields.oxygen.values.fill(.01);s.fields.glucose.values.fill(.01);s.fields.acid.values.fill(.99);};
const checkOccupancy=s=>{const expected=s.occupancy.map(a=>a&&new Float32Array(a.length));for(const [p,id] of s.C.pixels())if(s.cells[id])expected[s.cells[id].kind][s.fieldIndex(...p)]++;for(let k=1;k<=3;k++)assert.deepEqual(s.occupancy[k],expected[k]);};

test('normal cells survive short exposure but die under sustained stress, with a separate clearance count',()=>{
  const s=make({stressMutation:0}),id=s.seed(1,30,30,7);adverse(s);s.updateMetabolism(4);assert.equal(s.cells[id].dying,false);
  for(let n=0;n<100;n++)s.updateMetabolism(4);assert.equal(s.cells[id].deathCause,'environment');
  for(const [p,cid] of [...s.C.pixels()])if(cid===id)s.C.setpix(p,0);s.cleanup();
  assert.equal(s.counters.normalEnvironmentDeaths,1);assert.equal(s.counters.environment,1);s.cleanup();assert.equal(s.counters.environment,1);
});
test('healthy and briefly stressed normal cells cannot initiate; abnormal cells retain normal mechanics and do not divide',()=>{
  const s=make(),id=s.seed(1,30,30,7),m=s.cells[id],drive=m.drive,base=m.base;const random=s.C.random;s.C.random=()=>0;
  s.transformation(m,1000);assert.equal(m.state,'normal');m.adversity=1;m.stress=.01;s.transformation(m,4);assert.equal(m.state,'normal');
  m.stress=.4;s.transformation(m,1);assert.equal(m.state,'abnormal');assert.equal(m.kind,1);assert.equal(m.genome,null);assert.ok(m.antigen);assert.equal(m.drive,drive);assert.equal(m.base,base);
  s.C.random=random;s.biology(1000);assert.equal(m.kind,1);assert.equal(s.live().length,1);assert.equal(s.divide(id),0);assert.equal(m.target,base);
});
test('progression has a real intermediate dwell, preserves occupied geometry, injury, target mass and nucleus, and reassigns metabolism',()=>{
  const s=make({progression:4}),id=s.seed(1,30,30,7),m=s.cells[id];s.beginAbnormal(id);m.damage=.3;m.stress=.4;
  const grid=s.C.grid._pixels.slice(),target=m.target,nucleus=[m.nucleusX,m.nucleusY,m.nucleusRadius],birth=m.birth,antigen=m.antigenLevel;
  s.C.random=()=>0;s.transformation(m,160);assert.equal(m.state,'abnormal');s.transformation(m,1);
  assert.equal(m.state,'tumor');assert.equal(s.C.cellKind(id),2);assert.deepEqual(s.C.grid._pixels,grid);assert.equal(m.target,target);assert.equal(m.damage,.3);assert.equal(m.stress,.4);assert.equal(m.birth,birth);assert.equal(m.genome.antigen,antigen);assert.equal(m.origin,'normal');assert.deepEqual([m.nucleusX,m.nucleusY,m.nucleusRadius],nucleus);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));checkOccupancy(s);
  s.prepareEnvironment();assert.ok(s.densities[2].some(v=>v>0));assert.ok(s.densities[1].every(v=>v===0));assert.equal(s.counters.malignantTransitions,1);
});
test('stress-associated initiation is stochastic, seed-reproducible and switchable off',()=>{
  const run=rate=>{const s=make({stressMutation:rate},{width:192,height:144});for(let y=12;y<135;y+=15)for(let x=12;x<185;x+=15)s.seed(1,x,y,4);for(const m of s.live()){m.stress=.5;m.adversity=.8;s.transformation(m,180);}return s.live().map(m=>m.state);};
  const a=run(1),b=run(1);assert.deepEqual(a,b);assert.ok(a.includes('normal')&&a.includes('abnormal'));assert.ok(run(0).every(v=>v==='normal'));
});
test('immune surveillance recognizes only antigen-positive abnormal contact, recruits, stops on detachment and clears the abnormal cell',()=>{
  const s=make({kill:2}),target=s.seed(1,30,24,5),ctl=s.seed(3,40,24,4),healthy=s.seed(1,40,34,5),remote=s.seed(1,14,12,4);
  s.beginAbnormal(target);s.beginAbnormal(remote);s.cells[target].antigenLevel=.5;s.updateLocal(120);assert.equal(s.cells[ctl].phase,'kill');assert.ok(s.cells[ctl].recruitment>0);assert.ok(s.cells[target].damage>0);
  s.updateSignals(4);assert.ok(s.fields.trail.values.some(v=>v>0));const damage=s.cells[target].damage;s.moveCell(ctl,58,24);s.updateLocal(100);assert.equal(s.cells[ctl].targetID,0);assert.ok(s.cells[target].damage<=damage);
  s.moveCell(ctl,40,24);for(let n=0;n<180;n++)s.updateLocal(4);assert.equal(s.cells[target].deathCause,'kill');assert.equal(s.cells[healthy].damage,0);assert.equal(s.cells[remote].damage,0);
  for(const [p,id] of [...s.C.pixels()])if(id===target)s.C.setpix(p,0);s.cleanup();assert.equal(s.counters.abnormalKills,1);assert.equal(s.counters.kills,1);
});
test('antigen-negative abnormal cells are not attacked and lethal environment prevents transformation',()=>{
  const s=make({progression:4}),id=s.seed(1,30,24,5),ctl=s.seed(3,40,24,4);s.beginAbnormal(id);s.cells[id].antigen=false;
  s.updateLocal(1000);assert.equal(s.cells[id].damage,0);assert.equal(s.cells[ctl].targetID,0);assert.equal(s.counters.recognitions,0);
  s.cells[id].stress=.999;adverse(s);s.updateMetabolism(4);s.C.random=()=>0;s.transformation(s.cells[id],2000);assert.equal(s.cells[id].state,'abnormal');assert.equal(s.cells[id].deathCause,'environment');
});
test('converted cells remain equivalent on JS and WASM, including later movement, division and phenotype inheritance',async()=>{
  const a=make(),b=make();for(const s of [a,b]){const id=s.seed(1,35,34,8);s.seed(3,50,34,5);s.beginAbnormal(id);s.becomeTumor(id);s.moveCell(id,34,33);assert.ok(s.divide(id));checkOccupancy(s);assert.ok(s.live().filter(m=>m.kind===2).every(m=>m.origin==='normal'&&m.state==='tumor'));}
  const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));await CellLabWasm.install(b,module);
  for(let n=0;n<80;n++){a.advance(1);b.advance(1);assert.deepEqual(b.C.grid._pixels,a.C.grid._pixels);}
  assert.deepEqual(b.snapshot().cells,a.snapshot().cells);assert.deepEqual(Uint32Array.from(b.C.mt.mt),Uint32Array.from(a.C.mt.mt));assert.equal(b.C.mt.mti,a.C.mt.mti);checkOccupancy(a);checkOccupancy(b);assert.deepEqual(b.contacts,a.contacts);
});
test('surveillance scene starts only with normal and immune cells; snapshots and history distinguish all states',()=>{
  const s=make({}, {scene:'surveillance',width:192,height:144});assert.ok(s.live().some(m=>m.kind===3));assert.ok(s.live().filter(m=>m.kind===1).length>30);assert.equal(s.live().filter(m=>m.kind===2).length,0);
  s.beginAbnormal(s.live().find(m=>m.kind===1).id);s.record();const row=s.history.at(-1),snap=s.snapshot();assert.equal(row.abnormal,1);assert.equal(row.normal+row.abnormal+row.immune,s.live().length);assert.equal(snap.cells.filter(m=>m.state==='abnormal').length,1);assert.equal(snap.fieldMask.length,s.fields.oxygen.blocked.length);
});
