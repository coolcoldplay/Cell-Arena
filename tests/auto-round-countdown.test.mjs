import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/auto-random.js','utf8'));
const cells=kinds=>kinds.map((kind,i)=>({id:i+1,birth:i+1,kind,state:kind===1?'normal':'',cycle:{phase:'G0'}}));
const scene=kinds=>({scene:'empty',revision:1,seed:1,time:0,playing:true,counters:{},cells:cells(kinds)});
const enabled=()=>{const c=new CellLabAutoRandom.Controller();c.configure(1,0);return c;};
test('empty, tumor-only, absent immune and absent normal states announce ten seconds before one restart',()=>{
  for(const [kinds,reason] of [[[],'empty'],[[2],'tumor-only'],[[1,2],'no-immune'],[[2,3],'no-normal']]){
    const c=enabled(),s=scene(kinds);assert.equal(c.tick(s,0),null);assert.equal(c.status().pendingReason,reason);assert.equal(c.status().countdownMs,10000);
    assert.equal(c.tick(s,9999),null);assert.equal(c.tick(s,10000),reason);assert.equal(c.tick(s,20000),null);
  }
});
test('stagnation waits for its minutes and then its own ten-second notice',()=>{
  const c=enabled(),s=scene([1,3]);c.tick(s,0);assert.equal(c.tick(s,60000),null);assert.equal(c.status().pendingReason,'idle');assert.equal(c.tick(s,69999),null);assert.equal(c.tick(s,70000),'idle');
});
test('unrelated activity does not stall an extinction notice; restored populations cancel it',()=>{
  const c=enabled(),s=scene([1,2]);c.tick(s,0);
  for(let t=1000;t<=9000;t+=1000){s.time++;s.cells[1].cycle.phase=t%2000?'S':'G2';c.tick(structuredClone(s),t);}assert.equal(c.status().countdownMs,1000);
  s.cells.push({id:3,birth:3,kind:3});assert.equal(c.tick(structuredClone(s),9500),null);assert.equal(c.status().pendingReason,null);assert.equal(c.tick(s,10000),null);
});
test('state activity cancels an idle notice and re-arms a full observation period',()=>{
  const c=enabled(),s=scene([1,3]);c.tick(s,0);c.tick(s,60000);s.cells[1].activation=50;
  c.tick(structuredClone(s),65000);assert.equal(c.status().pendingReason,null);c.tick(s,125000);assert.equal(c.status().pendingReason,'idle');
});
test('pause, hidden time and input handling freeze the countdown; disabling or new setup removes it',()=>{
  const c=enabled(),s=scene([2]);c.tick(s,0);c.tick(s,4000);assert.equal(c.status().countdownMs,6000);
  c.suspend(4000);c.tick(s,100000,false);c.tick(s,200000,true);assert.equal(c.status().countdownMs,6000);assert.equal(c.tick(s,205999),null);assert.equal(c.tick(s,206000),'tumor-only');
  c.configure(1,206000);c.tick(s,206000);c.configure(0,207000);assert.equal(c.status().pendingReason,null);assert.equal(c.tick(s,999999),null);
  c.configure(1,0);c.tick(s,0);c.tick({...scene([1,3]),revision:2},8000);assert.equal(c.status().pendingReason,null);
});
test('dying bodies do not masquerade as living populations; the immune maze has no normal-cell extinction rule',()=>{
  const c=enabled(),s=scene([1,2,3]);s.cells[2].dying=true;c.tick(s,0);assert.equal(c.status().pendingReason,'no-immune');
  c.reset();const maze={...scene([3,3]),scene:'maze'};c.tick(maze,0);assert.equal(c.status().pendingReason,null);
  c.tick({...maze,cells:[]},1000);assert.equal(c.status().pendingReason,'empty');
});
