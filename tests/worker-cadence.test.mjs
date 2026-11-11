import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile('src/worker.js','utf8');
function worker(){
  const context=vm.createContext({now:0,performance:{now:()=>context.now},setTimeout(){},MessageChannel:class{port1={};port2={postMessage(){}}},CellLab:{StepClock:class{}},CellLabGPU:{ComputeBackend:class{info(){return {};}}},frames:[],postMessage:m=>context.frames.push(context.now)});
  vm.runInContext(source,context);
  vm.runInContext(`sim={C:{time:0},snapshot(){now+=5;return {grid:new Uint16Array(1),activity:new Uint8Array(1),walls:new Uint8Array(1),fieldMask:new Uint8Array(1),fields:{}};}};presentation.fps=30;`,context);
  return context;
}
test('snapshot pacing keeps its deadline across slow whole MCS and packing cost',()=>{
  const c=worker();vm.runInContext(`sendSnapshot(true);while(now<4000){now+=25;sim.C.time++;presentedFrame=frameSerial;if(now-lastSnapshot>=1000/presentation.fps)sendSnapshot();}`,c);
  const fps=(c.frames.length-1)*1000/(c.frames.at(-1)-c.frames[0]);
  assert.ok(fps>=28&&fps<=31,'25 ms MCS should sustain near 30 snapshots/s, not accidentally halve the display cadence: '+fps);
});
test('deadline pacing retains backpressure and never serializes unchanged model time',()=>{
  const c=worker();vm.runInContext(`sendSnapshot(true);now=100;sendSnapshot();sim.C.time++;sendSnapshot();now=200;sim.C.time++;sendSnapshot();`,c);
  assert.equal(c.frames.length,2,'at most two frames in flight');
  vm.runInContext(`presentedFrame=frameSerial;sendSnapshot();sendSnapshot();`,c);
  assert.equal(c.frames.length,3,'acknowledgement releases one new state, unchanged state is skipped');
});
