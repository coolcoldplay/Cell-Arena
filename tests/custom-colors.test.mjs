import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/display-fields.js','utf8'));
const D=CellLabDisplay;
test('palette supports all five body/nucleus states independently and rejects malformed storage',()=>{
  const cfg=D.normalizeColors({normal:{body:'#123456',nucleus:'#abcdef'},abnormal:{body:'#987654',nucleus:'#010203'},tumor:{body:'#224488',nucleus:'#040506'},immune:{body:'#ccffaa',nucleus:'#070809'},activated:{body:'#ff9900',nucleus:'#101112'},proliferationShading:false});
  const cells=[{kind:1,state:'normal'},{kind:1,state:'abnormal'},{kind:2},{kind:3,activation:0},{kind:3,activation:5}],keys=['normal','abnormal','tumor','immune','activated'];
  const saved=JSON.stringify(cells);
  for(let i=0;i<cells.length;i++){assert.equal(D.nucleusStyle(cells[i],cfg).stroke,cfg[keys[i]].nucleus);assert.deepEqual(D.bodyColor(cells[i],cfg),D.hexRGB(cfg[keys[i]].body));}
  assert.equal(JSON.stringify(cells),saved,'display never edits biology');
  assert.deepEqual(D.normalizeColors({normal:{body:'not a color'},tumor:null}),D.normalizeColors(null));
});
test('custom tumor color retains optional proliferation shading and default colors remain compatible',()=>{
  const low={kind:2,genome:{proliferation:.25}},high={kind:2,genome:{proliferation:3}},p=D.normalizeColors({tumor:{body:'#224488'}});
  assert.deepEqual(D.bodyColor(high,p),[34,68,136]);assert.ok(D.bodyColor(low,p).every((v,k)=>v>D.bodyColor(high,p)[k]));
  p.proliferationShading=false;assert.deepEqual(D.bodyColor(high,p),D.bodyColor(low,p));
  for(const m of [low,high,{kind:1},{kind:3,activation:0},{kind:3,activation:10}]){assert.deepEqual(D.bodyColor(m),D.bodyColor(m,D.normalizeColors()));assert.deepEqual(D.nucleusStyle(m),D.nucleusStyle(m,D.normalizeColors()));}
});
