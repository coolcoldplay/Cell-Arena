import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
class Path {
  contours=[];
  moveTo(x,y){this.contours.push([[x,y]]);}
  lineTo(x,y){this.contours.at(-1).push([x,y]);}
  closePath(){}
}
const context=vm.createContext({Path2D:Path});
vm.runInContext(await readFile('src/display-fields.js','utf8'),context);
const display=context.CellLabDisplay;
test('nucleus paths stay bounded while preserving every deformed and periodic contour',()=>{
  const s={width:1000,height:800,boundary:'wrap',cells:Array.from({length:800},(_,i)=>({id:i+1,birth:i+1,kind:1,hasNucleus:true,nucleusX:i===0?0:15+i%35*26,nucleusY:10+Math.floor(i/35)*30,nucleusRadius:4,nucleusStrainX:.15,nucleusStrainY:.12}))};
  const cache=new display.Cache(),batches=cache.nucleusBatches(s,display.COLOR_DEFAULTS);
  assert.ok(batches.length>1,'large cell counts must not build one quadratic-cost Path2D');
  assert.ok(batches.every(b=>b.path.contours.length<=32));
  const actual=batches.flatMap(b=>b.path.contours),expected=[];
  for(const m of s.cells){const shape=display.nucleusContour(m,s);for(const dx of m.id===1?[0,s.width]:[0])expected.push(shape.map(([x,y])=>[m.nucleusX+.5+dx+x,m.nucleusY+.5+y]));}
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
  assert.equal(cache.nucleusBatches(s,display.COLOR_DEFAULTS),batches,'paused frames reuse the paths');
});
