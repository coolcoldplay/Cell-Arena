import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/display-fields.js','utf8'));
const field=values=>({width:values.length,height:1,values:Float32Array.from(values)});
test('adversity distinguishes supplied, nutrient-deprived and acidic regions without altering physical fields',()=>{
  const fields={oxygen:field([1,0,1,0]),glucose:field([1,0,1,0]),acid:field([0,0,1,1])},before=structuredClone(fields),out=CellLabDisplay.adversity(fields);
  assert.equal(out.values[0],0);assert.ok(out.values[1]>.7);assert.ok(out.values[2]>.2&&out.values[2]<out.values[1]);assert.equal(out.values[3],1);assert.deepEqual(fields,before);
});
test('independent signal channels retain distinct hue and zero concentration stays transparent',()=>{
  const fields={cohesion:field([0,8]),danger:field([0,8]),trail:field([0,8])},before=structuredClone(fields);
  for(const key of Object.keys(fields)){const layer=CellLabDisplay.signals(fields,new Set([key]));assert.equal(layer.rgba[3],0);assert.ok(layer.rgba[7]>150);assert.deepEqual(Array.from(layer.rgba.slice(4,7)),CellLabDisplay.SIGNALS[key].color);}
  const mixed=CellLabDisplay.signals(fields,new Set(['cohesion','trail']));assert.notDeepEqual(Array.from(mixed.rgba.slice(4,7)),CellLabDisplay.SIGNALS.cohesion.color);assert.equal(CellLabDisplay.signals(fields,new Set()),null);assert.deepEqual(fields,before);
});
test('display cache reacts to channel changes and new snapshots, clearing a disabled overlay',()=>{
  const s={fields:{oxygen:field([1]),glucose:field([1]),acid:field([0]),cohesion:field([8]),danger:field([0]),trail:field([0])}},cache=new CellLabDisplay.Cache(),channels=new Set(['cohesion']);
  const a=cache.get(s,'adversity',channels);assert.equal(cache.get(s,'adversity',channels).signal,a.signal);
  channels.clear();assert.equal(cache.get(s,'none',channels).signal,null);assert.equal(cache.get(s,'none',channels).field,undefined);
  const next=structuredClone(s);next.fields.oxygen.values[0]=0;assert.ok(cache.get(next,'adversity',channels).field.values[0]>.3);assert.equal(a.field.values[0],0);
});
test('opacity endpoints and independent channel weights are read-only and invalidate the cache',()=>{
  const s={fields:{cohesion:field([8]),danger:field([8]),trail:field([8])}},cache=new CellLabDisplay.Cache(),enabled=new Set(['cohesion','trail']),opacity={cohesion:1,trail:0};
  const a=cache.get(s,'none',enabled,opacity).signal;assert.deepEqual([...a.rgba.slice(0,3)],CellLabDisplay.SIGNALS.cohesion.color);
  opacity.cohesion=0;const zero=cache.get(s,'none',enabled,opacity).signal;assert.equal(zero.rgba[3],0);assert.notEqual(zero,a);opacity.trail=1;assert.deepEqual([...cache.get(s,'none',enabled,opacity).signal.rgba.slice(0,3)],CellLabDisplay.SIGNALS.trail.color);
  opacity.trail=0;cache.get(s,'none',enabled,opacity);enabled.clear();assert.equal(cache.get(s,'none',enabled,opacity).signal,null);assert.equal(s.fields.trail.values[0],8);
});
test('hover samples the actual local field bin and masks wall-obstructed coarse bins instead of reporting zero resources',()=>{
  const s={width:4,height:2,fieldScale:2,time:12,grid:new Uint16Array(8),walls:new Uint8Array(8),fieldMask:new Uint8Array([0,1]),cells:[],fields:Object.fromEntries(['oxygen','glucose','acid','cohesion','danger','trail'].map(k=>[k,field([.123,0])]))};
  const p=CellLabDisplay.sample(s,1,1);assert.equal(p.bin,0);assert.ok(Math.abs(p.values.oxygen-.123)<1e-6);assert.equal(p.time,12);assert.equal(CellLabDisplay.sample(s,3,1).values,null);assert.equal(CellLabDisplay.sample(s,-1,0),null);
});

test('high opacity releases body protection independently per layer, while low doses and hidden channels preserve identity',()=>{
  assert.equal(CellLabDisplay.bodyOpacity(0),0);assert.equal(CellLabDisplay.bodyOpacity(1),1);assert.equal(CellLabDisplay.bodyOpacity(.5),.14);assert.equal(CellLabDisplay.bodyOpacity(.5,false),.5);
  let last=0;for(let i=0;i<=100;i++){const a=CellLabDisplay.bodyOpacity(i/100);assert.ok(a>=last&&a<=i/100);last=a;}
  const s={fields:{cohesion:field([0,.1,8]),danger:field([0,.1,8]),trail:field([0,.1,8])}},enabled=new Set(['cohesion','trail']),cache=new CellLabDisplay.Cache();
  const high=cache.get(s,'none',enabled,{cohesion:1,trail:0});assert.deepEqual(high.bodySignal,high.signal);assert.equal(high.bodySignal.rgba[3],0);assert.ok(high.bodySignal.rgba[7]>50,'weak physical concentrations remain visible');
  const before=s.fields.trail.values.slice(),a=cache.get(s,'none',new Set(['cohesion']),{cohesion:.45,trail:1}).bodySignal,b=cache.get(s,'none',new Set(['cohesion']),{cohesion:.45,trail:0}).bodySignal;assert.deepEqual(a,b,'a disabled channel cannot release protection on another channel');assert.deepEqual(s.fields.trail.values,before);
  const unprotected=cache.get(s,'none',enabled,{cohesion:.45,trail:.45},false);assert.equal(unprotected.bodySignal,unprotected.signal);
});
