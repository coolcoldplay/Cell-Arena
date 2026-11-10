import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/model.js','src/experiment.js','src/signal-gesture.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
function clock(){let time=0,id=0;const jobs=new Map(),events=[];const gesture=new CellLabSignalGesture({emit:(mode,payload)=>events.push({mode,...payload}),now:()=>time,setTimer:(fn,ms)=>{jobs.set(++id,{at:time+ms,fn});return id;},clearTimer:key=>jobs.delete(key)});return{gesture,events,tick(ms){const end=time+ms;while(true){const next=[...jobs].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;jobs.delete(next[0]);next[1].fn();}time=end;}};}
const point=(x=20,type='trail')=>({point:[x,20],screen:[x,20],type,radius:10});
test('a tap emits one finite pulse; a double tap emits exactly one source and no pulses',()=>{
 const c=clock();c.gesture.down(point());c.tick(70);c.gesture.up();c.tick(321);assert.deepEqual(c.events.map(e=>e.mode),['pulse']);
 c.events.length=0;c.gesture.down(point());c.gesture.up();c.tick(100);c.gesture.down(point(22));c.tick(50);c.gesture.up();c.tick(1000);assert.deepEqual(c.events.map(e=>e.mode),['source']);
});
test('holding emits at the current position until release, without leaving a permanent source',()=>{
 const c=clock();c.gesture.down(point());c.tick(399);assert.equal(c.events.length,0);c.tick(1);c.gesture.move([50,30],[50,30]);c.tick(240);c.gesture.up();const count=c.events.length;c.tick(1000);assert.equal(c.events.length,count);assert.equal(count,3);assert.ok(c.events.every(e=>e.mode==='repeat'));assert.deepEqual(c.events.at(-1).point,[50,30]);
});
test('dragging starts a continuous brush; different positions/types are independent taps; cancellation leaves no delayed writes',()=>{
 const c=clock();c.gesture.down(point());c.gesture.move([40,20],[40,20]);assert.equal(c.events[0].mode,'repeat');c.gesture.cancel();const n=c.events.length;c.tick(1000);assert.equal(c.events.length,n);
 c.events.length=0;c.gesture.down(point());c.gesture.up();c.tick(100);c.gesture.down(point(70));c.gesture.up();c.tick(321);assert.deepEqual(c.events.map(e=>e.mode),['pulse','pulse']);
 c.events.length=0;c.gesture.down(point());c.gesture.up();c.gesture.cancel();c.tick(1000);assert.equal(c.events.length,0);
});
const make=(extra={})=>new CellLab.Simulation({scene:'empty',width:80,height:60,warmup:0,seed:17,settings:{noise:0,metabolism:0,growth:0,apoptosis:0,immuneGrowth:0,alignment:0,repulsion:0,escape:0},...extra});
test('oxygen, glucose and acid pulses are finite, bounded, independent, and never inject into a wall',()=>{
 for(const key of ['oxygen','glucose','acid']){const s=make();for(const k of ['oxygen','glucose','acid'])s.fields[k].values.fill(.2);const i=s.fieldIndex(30,30);s.pulse(30,30,key,8);assert.ok(s.fields[key].values[i]>.3);for(const other of ['oxygen','glucose','acid'].filter(k=>k!==key))assert.ok(Math.abs(s.fields[other].values[i]-.2)<1e-6);assert.equal(s.sources.length,0);for(let n=0;n<20;n++)s.pulse(30,30,key,8);assert.equal(s.fields[key].values[i],1);s.fields.oxygen.blocked[i]=1;s.fields[key].blocked[i]=1;s.fields[key].values[i]=0;s.pulse(30,30,key,8);assert.equal(s.fields[key].values[i],0);}
});
test('new continuous resource sources persist independently and round trip with parameters',()=>{
 const s=make();for(const key of ['oxygen','glucose','acid']){const id=s.addSource(30,30,key,8);assert.ok(id);assert.equal(s.addSource(30,30,key,8),id);s.fields[key].values.fill(.2);}s.applySources();const i=s.fieldIndex(30,30);for(const key of ['oxygen','glucose','acid'])assert.equal(s.fields[key].values[i],1);
 const profile=CellLabExperiment.parse({scene:'empty',worldWidth:80,worldHeight:60,refinement:1,boundary:'solid',seed:17,settings:s.settings,sources:s.sources});const copy=new CellLab.Simulation(profile.config);assert.equal(copy.sources.length,3);assert.equal(copy.removeSources(30,30,2),3);
});
test('circular sources and pulses cross periodic seams, while solid boundaries do not wrap',()=>{
 for(const boundary of ['wrap','solid']){const s=make({boundary});s.fields.acid.values.fill(0);s.pulse(1,30,'acid',8);const i=s.fieldIndex(78,30);assert.equal(s.fields.acid.values[i]>0,boundary==='wrap');const id=s.addSource(1,30,'glucose',8);if(boundary==='wrap'){assert.equal(s.addSource(79,30,'glucose',8),id);assert.equal(s.removeSources(79,30,2),1);}}
});
test('tumors turn up either local nutrient gradient even without stress; immune cells retain their own cues',()=>{
 for(const kind of [2,3])for(const key of ['oxygen','glucose'])for(const sign of [-1,1]){const s=make(),id=s.seed(kind,35,30,4),m=s.cells[id];m.px=0;m.py=1;m.adversity=0;const f=s.fields[key];for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=.7+sign*(x-f.width/2)*.005;s.updatePolarity(4);if(kind===2)assert.ok(m.px*sign>0,`${key} should attract a healthy tumor`);else assert.equal(m.px,0);}
 const s=make(),id=s.seed(2,35,30,4),m=s.cells[id];m.px=0;m.py=1;s.updatePolarity(4);assert.equal(m.px,0,'uniform nutrients have no directional cue');
 // A distant enriched patch outside the sampled neighborhood conveys no target position.
 s.fields.oxygen.values.fill(.7);s.fields.glucose.values.fill(.7);s.addSource(70,50,'nutrient',4);s.updatePolarity(4);assert.equal(m.px,0);
});
