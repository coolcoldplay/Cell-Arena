import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
try{vm.runInThisContext(await readFile('src/adaptive-performance.js','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const controller=options=>{assert.ok(globalThis.CellLabPerformance,'Adaptive performance controller must exist');return new CellLabPerformance.Controller(options);};
function run(c,from,to,metrics){for(let now=from;now<=to;now+=100){c.sample(metrics);c.frameGap(16.7);c.tick(now);}return c.status();}
const light={renderMs:2,snapshotMs:1,stepMs:4,rate:30,targetRate:30};
test('low MCS throughput alone never reduces display resolution',()=>{
  const c=controller({now:0});const start=c.status();run(c,0,12000,{...light,stepMs:80,rate:12,targetRate:240});
  assert.equal(c.status().resolutionLevel,start.resolutionLevel);assert.equal(c.status().bottleneck,'simulation');
});
test('sustained rendering pressure lowers resolution, a single spike does not',()=>{
  const c=controller({now:0});run(c,0,4000,light);c.sample({...light,renderMs:150});c.tick(4100);
  assert.equal(c.status().resolutionLevel,0);run(c,4200,9500,{...light,renderMs:35});assert.ok(c.status().resolutionLevel>0);
});
test('snapshot pressure reduces publication rate without lowering pixel quality',()=>{
  const c=controller({now:0});run(c,0,9000,{...light,snapshotMs:14});
  assert.ok(c.status().fps<60);assert.equal(c.status().resolutionLevel,0);
});
test('moderate snapshot cost on a compute-limited scene does not halve frame throughput',()=>{
  const c=controller({now:0});run(c,0,12000,{renderMs:4,snapshotMs:8,stepMs:35,rate:24,targetRate:240});
  assert.equal(c.status().publicationLevel,0);assert.equal(c.status().resolutionLevel,0);assert.equal(c.status().bottleneck,'simulation');
});
test('recovery is gradual and requires sustained headroom',()=>{
  const c=controller({now:0});run(c,0,6000,{...light,renderMs:35});const degraded=c.status().resolutionLevel;assert.ok(degraded>0);
  run(c,6100,15000,light);assert.equal(c.status().resolutionLevel,degraded);
  run(c,15100,32000,light);assert.ok(c.status().resolutionLevel<degraded);
});
test('manual resolution and video source resolution override automatic reductions',()=>{
  const c=controller({now:0});run(c,0,10000,{...light,renderMs:40});
  const context={cssWidth:600,ratio:4/3,dpr:3};assert.ok(c.display(context).width<1800);
  assert.equal(c.display({...context,manualWidth:2560}).width,2560);
  assert.ok(c.display({...context,recordingScale:4}).width>=2400);
});
test('high-DPI mobile preview has bounded pixels without changing model dimensions',()=>{
  const c=controller({now:0});c.context({mobile:true,preview:true},0);
  const d=c.display({cssWidth:600,ratio:4/3,dpr:3});assert.ok(d.width<=1200);assert.ok(c.status().fps<=15);
  c.context({recording:true},100);assert.ok(c.status().fps>=30);
});
test('pause, recording and visibility transitions do not train on artificial stalls',()=>{
  const c=controller({now:0});for(const state of [{playing:false},{playing:true,hidden:true},{hidden:false,recording:true}]){c.context(state,0);run(c,0,10000,{...light,renderMs:80,snapshotMs:50});}
  assert.equal(c.status().resolutionLevel,0);assert.equal(c.status().publicationLevel,0);
  c.context({recording:false,playing:true},11000);run(c,11000,12000,{...light,renderMs:80});assert.equal(c.status().resolutionLevel,0);
});
test('preferences are bounded, versioned and contain no model state',()=>{
  const c=controller({mode:'power',now:0});assert.equal(c.status().fps,30);assert.ok(c.display({cssWidth:900,ratio:4/3,dpr:3}).width<=1200);
  const pref=c.preferences();assert.equal(pref.mode,'power');assert.equal(pref.version,1);
  const restored=controller({preferences:pref,now:0});assert.equal(restored.status().mode,'power');
  const invalid=controller({preferences:{version:1,mode:'bogus',resolutionLevel:Infinity,publicationLevel:900},now:0});assert.equal(invalid.status().mode,'auto');assert.equal(invalid.status().resolutionLevel,0);
});
test('a steady 30 Hz screen can recover quality without being classified as stalled',()=>{
  const c=controller({now:0});run(c,0,6000,{...light,renderMs:35});const reduced=c.status().resolutionLevel;
  for(let now=6100;now<=32000;now+=100){c.sample(light);c.frameGap(33.3);c.tick(now);}
  assert.ok(c.status().resolutionLevel<reduced);assert.equal(c.status().bottleneck,'balanced');
});
