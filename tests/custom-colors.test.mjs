import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/display-fields.js','utf8'));
const D=CellLabDisplay;

test('four preset palettes preserve readable nuclei and distinct immune activation, without sharing mutable colors',()=>{
  assert.equal(Object.keys(D.COLOR_PRESETS||{}).length,4);
  const luminance=hex=>D.hexRGB(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  for(const [id,preset] of Object.entries(D.COLOR_PRESETS)){
    const palette=D.normalizeColors(preset.colors),before=JSON.stringify(preset);
    for(const key of ['normal','abnormal','tumor','immune','activated'])assert.ok(contrast(palette[key].body,palette[key].nucleus)>=3,id+' '+key+' nuclear contrast');
    const paleTumor='#'+D.bodyColor({kind:2,genome:{proliferation:.25}},palette).map(v=>v.toString(16).padStart(2,'0')).join('');
    assert.ok(contrast(paleTumor,palette.tumor.nucleus)>=3,id+' preserves nuclei at the lightest proliferation shade');
    assert.ok(luminance(palette.immune.body)>luminance(palette.activated.body));
    assert.ok(contrast(palette.normal.body,'#f3f5f1')>=1.5,id+' separates normal cells from medium');
    assert.equal(D.colorPresetID(palette),id);
    palette.normal.body='#123456';assert.equal(D.colorPresetID(palette),'custom');assert.equal(JSON.stringify(preset),before);
  }
  assert.equal(D.colorPresetID(D.normalizeColors()),'original');
});
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
