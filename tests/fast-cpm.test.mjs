import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const c=vm.createContext({console,performance});for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/model.js'])vm.runInContext(await readFile(new URL('../'+f,import.meta.url),'utf8'),c);
test('fast CPU kernel preserves exact energies, copy decisions, contacts and fields',()=>{
  for(const boundary of ['solid','wrap']){
    const opts={width:80,height:60,scene:'empty',warmup:0,seed:17,boundary,settings:{apoptosis:0,growth:0}},a=new c.CellLab.Simulation({...opts,kernel:'reference'}),b=new c.CellLab.Simulation({...opts,kernel:'fast'});
    for(const s of [a,b]){s.seed(1,20,25,7);s.seed(2,40,25,7);s.seed(3,30,36,4);}
    for(let n=0;n<120;n++){
      for(const i of a.C.borderpixels.elements.slice(0,30)){const j=a.neighbors[i][0],x=a.C.pixti(j),y=a.C.pixti(i);if(x!==y)assert.equal(b.C.deltaH(j,i,x,y),a.C.deltaH(j,i,x,y));}
      a.advance(1);b.advance(1);assert.deepEqual(Array.from(b.C.grid._pixels),Array.from(a.C.grid._pixels));
    }
    for(const key of Object.keys(a.fields))assert.deepEqual(Array.from(a.fields[key].values),Array.from(b.fields[key].values));
    assert.equal(JSON.stringify(a.counters),JSON.stringify(b.counters));
    assert.equal(JSON.stringify([...a.contacts].map(([id,map])=>[id,[...map]])),JSON.stringify([...b.contacts].map(([id,map])=>[id,[...map]])));
  }
});
