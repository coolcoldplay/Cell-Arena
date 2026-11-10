import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/history-chart.js','utf8'));
const H=CellLabHistory;
const rows=[{time:0,normal:1000,tumor:5,immune:10,immuneResting:7,immuneActive:2,immuneSuppressive:1,immuneDying:0},{time:300,normal:800,tumor:20,immune:20,immuneResting:8,immuneActive:6,immuneSuppressive:4,immuneDying:2}];
test('population filters fit the Y axis only to checked series and retain full model time',()=>{
 const all=H.plan(rows,['normal','tumor','immune'],false,350),filtered=H.plan(rows,['tumor','immune'],false,350);
 assert.ok(all.max>=1000);assert.ok(filtered.max>=20&&filtered.max<=25);assert.equal(filtered.end,350);assert.equal(filtered.mode,'lines');assert.deepEqual(filtered.series.map(s=>s.key),['tumor','immune']);
});
test('one selected type becomes exclusive stacked states with correct counts and percentages',()=>{
 const p=H.plan(rows,['immune'],false,300);assert.equal(p.mode,'stack');assert.equal(p.type,'immune');assert.equal(p.max,20);
 assert.deepEqual(p.values[1],[4,6,8,2]);assert.equal(p.values[1].reduce((a,b)=>a+b,0),rows[1].immune);
 const pct=H.plan(rows,['immune'],true,300);assert.equal(pct.max,100);assert.deepEqual(pct.values[1],[20,30,40,10]);
});
test('single-type experiments switch automatically, zero population and deselect-all remain valid',()=>{
 const only=[{time:0,immune:0,immuneResting:0},{time:30,immune:4,immuneResting:4}];
 const p=H.plan(only,['normal','abnormal','tumor','immune'],true,30);assert.equal(p.type,'immune');assert.equal(p.mode,'stack');assert.ok(p.values[0].every(v=>v===0));
 const empty=H.plan(only,[],false,30);assert.equal(empty.mode,'empty');assert.equal(empty.series.length,0);
});
test('legacy state history is explicitly unknown, never backfilled with present states',()=>{
 const p=H.plan([{time:0,immune:9},rows[1]],['immune'],false,300);assert.equal(p.series.at(-1).key,'unknown');assert.deepEqual(p.values[0],[0,0,0,0,9]);assert.deepEqual(p.values[1],[4,6,8,2,0]);
});
test('nearest recorded sample handles duplicate event times and beginning/end',()=>{
 const data=[{time:0},{time:30},{time:30},{time:60}];assert.equal(H.nearest(data,30),2);assert.equal(H.nearest(data,-1),0);assert.equal(H.nearest(data,100),3);
});
