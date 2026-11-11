import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/auto-random.js','utf8'));vm.runInThisContext(await readFile('src/experiment.js','utf8'));
const scene=changes=>({revision:1,seed:123,time:35,playing:true,counters:{},cells:[{id:1,birth:1,kind:1,state:'normal',cycle:{phase:'G0'}},{id:2,birth:2,kind:3,cycle:{phase:'G0'}}],...changes});
function active(){const c=new CellLabAutoRandom.Controller();c.configure(1,0);c.tick(scene(),0);return c;}

test('restart preferences default to one enabled minute and preserve explicit new opt-outs',()=>{
 for(const legacy of [undefined,null,'0','-1','invalid','1441'])assert.deepEqual(CellLabAutoRandom.preferences(null,legacy),{enabled:true,minutes:1});
 assert.deepEqual(CellLabAutoRandom.preferences(null,'2.5'),{enabled:true,minutes:2.5});
 assert.deepEqual(CellLabAutoRandom.preferences({enabled:false,minutes:3},'0'),{enabled:false,minutes:3});
 assert.deepEqual(CellLabAutoRandom.preferences({enabled:true,minutes:7}),{enabled:true,minutes:7});
 assert.deepEqual(CellLabAutoRandom.preferences({enabled:'no',minutes:NaN}),{enabled:true,minutes:1});
});
test('zero disables automatic notices even for an empty arena',()=>{
  const c=new CellLabAutoRandom.Controller(),s=scene({cells:[]});assert.equal(c.tick(s,999999),null);assert.equal(c.status().pendingReason,null);c.configure(10,999999);assert.equal(c.tick({...s,playing:false},999999),null);assert.equal(c.status().pendingReason,null);
});
test('motion, shape, continuous progress and contact counts leave the biological idle interval intact',()=>{
  const c=active(),s=scene(),before=structuredClone(s);
  for(let i=1;i<=5;i++){const next=structuredClone(s);Object.assign(next.cells[0],{x:i,area:200+i,stress:i/100,oxygen:1-i/100});next.cells[0].cycle.progress=i/10;next.time+=i*100;next.counters.recognitions=i;assert.equal(c.tick(next,i*10000),null);}
  assert.equal(c.tick(c.observed,60000),null);assert.equal(c.status().pendingReason,'idle');assert.equal(c.tick(c.observed,70000),'idle');assert.deepEqual(s,before);
});
test('discrete type, antigen, immune state, cycle, arrest and death changes reset biological idle time',()=>{
  for(const patch of [{state:'abnormal'},{kind:2},{antigen:true},{activation:10},{immunePhenotype:'suppressive'},{cycle:{phase:'S'}},{cycle:{phase:'G1',arrest:'space'}},{dying:true,deathCause:'kill'},{dying:true,deathCause:'lifespan'}]){
    const c=active(),s=scene();c.tick(s,50000);const next=structuredClone(s);next.cells[0]={...next.cells[0],...patch};assert.equal(c.tick(next,59000),null);assert.equal(c.elapsed,0);
  }
});
test('balanced turnover, reused grid IDs and genetic events reset the observation period',()=>{
  const c=active(),s=scene();c.tick(s,55000);const replacement=structuredClone(s);replacement.cells[0].birth=3;c.tick(replacement,59000);assert.equal(c.elapsed,0);
  c.tick(replacement,110000);c.tick({...replacement,counters:{mutations:1}},115000);assert.equal(c.elapsed,0);
});
test('pause and disallowed intervals cannot create a resume-time jump',()=>{
  const c=active(),s=scene();c.tick(s,30000);c.tick({...s,playing:false},30000);c.tick({...s,playing:false},900000);assert.equal(c.elapsed,30000);
  c.tick(s,900001);c.tick(s,910001);assert.equal(c.elapsed,40000);c.suspend(910001);c.tick(s,2000000);assert.equal(c.elapsed,40000);
  c.configure(2,2000000);c.tick(s,2100000);assert.equal(c.elapsed,0);c.tick({...s,revision:2},2200000);assert.equal(c.elapsed,0);
});
test('auto-random minutes import independently and reject unsafe numbers',()=>{
  const data={scene:'empty',seed:1,boundary:'wrap',refinement:1,worldWidth:96,worldHeight:72,settings:{}};assert.equal(CellLabExperiment.parse(data).display.autoRandomMinutes,undefined);
  for(const value of [0,.01,.5,5,1440])assert.equal(CellLabExperiment.parse({...data,display:{autoRandomMinutes:value}}).display.autoRandomMinutes,value);
  for(const value of [-1,1441,NaN,'2'])assert.throws(()=>CellLabExperiment.parse({...data,display:{autoRandomMinutes:value}}),/autoRandomMinutes/);
});
