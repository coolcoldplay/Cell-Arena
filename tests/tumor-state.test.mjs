import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/tumor-state.js';
const {assess,names}=CellLabTumorState;
const row=(t,i,extra={})=>({time:i*30,tumor:t,tumorDying:0,tumorG0:0,tumorNegative:0,abnormal:0,immune:6,immuneDying:0,immuneSuppressive:0,immuneExhausted:0,malignantTransitions:0,recognitions:0,divisions:0,normalDivisions:0,endothelialDivisions:0,immuneDivisions:0,kills:0,...extra});
const make=(ts,extra=()=>({}))=>ts.map((t,i)=>row(t,i,extra(i,t)));
const cases=[
  ['absent',[0]],['observing',[4]],['precancer',[0],()=>({abnormal:2})],
  ['clearing',[3,1],i=>({tumorDying:i})],['undetected',[4,0,0]],
  ['detected',[0,1]],['onset',[0,1],i=>({malignantTransitions:i})],['redetected',[4,0,2]],
  ['growing',[4,5,6,7]],['declining',[8,7,5,4]],['fluctuating',[4,10,3,4]],
  ['dormant',[6,6,6,6],()=>({tumorG0:5})],['stable',[6,6,6,6]],
  ['turnover',[6,6,6,6],i=>({divisions:i})],['rebound',[24,10,8,8,8,8,9,11,14]],
  ['scant',[3,3,3],i=>({time:i*90})]
];
for(const [expected,ts,fields] of cases)test('interprets '+expected,()=>assert.equal(assess(make(ts,fields)).phase,expected));
test('growth, exhaustion, suppressive phenotype, escape clues and dissemination coexist',()=>{
  const result=assess(make([8,9,11,14],i=>({tumorNegative:1+2*i,recognitions:2*i,immuneExhausted:4,immuneSuppressive:3,intravasations:i,distalTumorDivisions:i,kills:i})));
  assert.equal(result.phase,'growing');
  assert.deepEqual(new Set(result.signals),new Set(['exhausted','suppressed','escapeHint','export','distal','immuneActive']));
});
test('partial exhaustion, absent immune cells and manual edits are distinguishable',()=>{
  assert.deepEqual(assess(make([8,8,8,8],()=>({immuneExhausted:1}))).signals,['focalExhaustion']);
  assert.deepEqual(assess(make([8,8,8,8],i=>({immune:0,manualRemoved:i}))).signals,['immuneAbsent','manual']);
});
test('stable counts with divisions, transient exhaustion and absence of immune contact do not imply dormancy or escape',()=>{
  const r=assess(make([8,8,8,8],i=>({tumorG0:8,divisions:i,tumorNegative:i,immuneExhausted:i===3?6:0})));
  assert.equal(r.phase,'turnover');assert.deepEqual(r.signals,[]);
});
test('duplicate ticks, empty histories and missing archived measurements do not manufacture sustained states',()=>{
  assert.equal(assess([]).phase,'observing');
  const r=assess([row(0,0),row(4,0),row(4,1)]);assert.equal(r.phase,'observing');assert.equal(r.recent.length,2);
  const history=make([3,3,3,3]);for(const r of history){delete r.tumorG0;delete r.immuneExhausted;}
  assert.equal(assess(history).phase,'stable');assert.deepEqual(assess(history).signals,[]);
});
test('all state names have two display languages',()=>assert.ok(Object.values(names).every(v=>v.length===2&&v.every(Boolean))));
