import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/auto-random.js','utf8'));
vm.runInThisContext(await readFile('src/experiment.js','utf8'));
const scene=changes=>({revision:1,seed:123,time:35,playing:true,counters:{},cells:[{id:1,birth:1,kind:1,state:'normal',cycle:{phase:'G0'}}],...changes});
function active(minutes=1){const c=new CellLabAutoRandom.Controller();c.configure(minutes,0);c.tick(scene(),0);return c;}

test('elapsed minutes are wall-clock running time and a trigger fires once per round',()=>{
  const c=active(),s=scene();assert.equal(c.tick(s,59999),null);assert.equal(c.tick(s,60000),'idle');
  assert.equal(c.tick(s,999999),null);assert.equal(c.status().fired,true);
  assert.equal(c.tick(scene({revision:2}),999999),null);assert.equal(c.elapsed,0);assert.equal(c.tick(c.observed,1059999),'idle');
});
test('zero disables even empty arenas; an enabled running empty arena triggers immediately',()=>{
  const c=new CellLabAutoRandom.Controller(),empty=scene({cells:[{id:7,birth:7,kind:4}]});
  assert.equal(c.tick(empty,999999),null);c.configure(10,999999);assert.equal(c.tick({...empty,playing:false},999999),null);
  assert.equal(c.tick({...empty,playing:true},1000000),'empty');assert.equal(c.tick(empty,1000001),null);
});
test('motion, shape, concentration, continuous progress and contact counts do not count as state changes',()=>{
  const c=active(),s=scene(),before=structuredClone(s);
  for(let i=1;i<=5;i++){const next=structuredClone(s);Object.assign(next.cells[0],{x:i,area:200+i,stress:i/100,oxygen:1-i/100});next.cells[0].cycle.progress=i/10;next.time+=i*100;next.counters.recognitions=i;assert.equal(c.tick(next,i*10000),null);}
  assert.equal(c.tick(c.observed,60000),'idle');assert.deepEqual(s,before);
});
test('normal transformation, antigen, immune phenotypes, cycle phases/arrest and death all reset idle time',()=>{
  for(const patch of [{state:'abnormal'},{kind:2},{antigen:true},{activation:10},{immunePhenotype:'suppressive'},{cycle:{phase:'S'}},{cycle:{phase:'G1',arrest:'space'}},{dying:true,deathCause:'kill'}]){
    const c=active(),s=scene();c.tick(s,50000);const changed=scene({cells:[{...s.cells[0],...patch}]});assert.equal(c.tick(changed,59000),null);assert.equal(c.elapsed,0);assert.equal(c.tick(changed,118999),null);assert.equal(c.tick(changed,119000),'idle');
  }
});
test('balanced births and deaths, reused lattice IDs and genetic events are not mistaken for stagnation',()=>{
  const c=active();c.tick(scene(),55000);
  const replacement=scene({cells:[{id:1,birth:2,kind:1}]});assert.equal(c.tick(replacement,59000),null);assert.equal(c.elapsed,0);
  c.tick(replacement,110000);const mutation={...replacement,counters:{mutations:1}};assert.equal(c.tick(mutation,115000),null);assert.equal(c.elapsed,0);
  c.tick(mutation,170000);const added={...mutation,cells:[...mutation.cells,{id:2,birth:3,kind:3}]};assert.equal(c.tick(added,174000),null);assert.equal(c.elapsed,0);
});
test('pause, hidden tab, open dialogs and drawing suspend counting without a resume-time jump',()=>{
  const c=active(),s=scene();c.tick(s,30000);assert.equal(c.elapsed,30000);
  c.tick({...s,playing:false},30000);c.tick({...s,playing:false},900000);assert.equal(c.elapsed,30000);
  c.tick(s,900001);c.tick(s,910001);assert.equal(c.elapsed,40000);
  c.tick(s,910001,false);c.tick(s,999999,false);c.tick(s,1000000,true);assert.equal(c.elapsed,40000);
  c.suspend(1001000);c.tick(s,2000000);assert.equal(c.elapsed,40000);assert.equal(c.tick(s,2020000),'idle');
});
test('manual setup, import and changing the waiting time start a new observation interval',()=>{
  const c=active();c.tick(scene(),59000);c.configure(2,59000);assert.equal(c.tick(scene(),100000),null);assert.equal(c.elapsed,0);
  c.tick(c.observed,200000);assert.equal(c.tick(scene({revision:2}),210000),null);assert.equal(c.elapsed,0);
  c.tick(c.observed,300000);assert.equal(c.tick(scene({revision:2,seed:999}),310000),null);assert.equal(c.elapsed,0);
});
test('auto-random setting imports independently from biology and rejects unsafe numeric values',()=>{
  const data={scene:'empty',seed:1,boundary:'wrap',refinement:1,worldWidth:96,worldHeight:72,settings:{}};
  assert.equal(CellLabExperiment.parse(data).display.autoRandomMinutes,undefined);
  for(const value of [0,.01,.5,5,1440])assert.equal(CellLabExperiment.parse({...data,display:{autoRandomMinutes:value}}).display.autoRandomMinutes,value);
  for(const value of [-1,1441,NaN,'2'])assert.throws(()=>CellLabExperiment.parse({...data,display:{autoRandomMinutes:value}}),/autoRandomMinutes/);
});
