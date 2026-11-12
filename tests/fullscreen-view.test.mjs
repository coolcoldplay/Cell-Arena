import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/fullscreen-view.js','utf8'));
test('portrait phone rotates a complete arena without distorting its aspect ratio',()=>{
 const f=CellLabFullscreen.layout(390,844,4/3);assert.equal(f.rotated,true);assert.equal(f.boardWidth/f.boardHeight,4/3);assert.equal(f.boardHeight,390);assert.equal(f.rail,162);assert.equal(f.boardWidth+f.rail*2,f.width);
});
test('landscape and tablet preserve geometry even when there is no room for statistics',()=>{
 const f=CellLabFullscreen.layout(844,390,4/3);assert.equal(f.rotated,false);assert.equal(f.boardWidth,520);
 const a=CellLabFullscreen.layout(1024,768,4/3);assert.equal(a.rail,0);assert.equal(a.boardHeight,768);
});
test('touch coordinates invert clockwise rotation at corners, center and an asymmetric point',()=>{
 const rect={left:0,top:162,width:390,height:520};
 for(const [u,v]of [[0,0],[1,0],[0,1],[1,1],[.5,.5],[.2,.8]]){
  const x=rect.left+(1-v)*rect.width,y=rect.top+u*rect.height;
  const [a,b]=CellLabFullscreen.coordinates(rect,x,y,true);assert.ok(Math.abs(a-u)<1e-12);assert.ok(Math.abs(b-v)<1e-12);
 }
 assert.deepEqual(CellLabFullscreen.coordinates(rect,195,422,false),[.5,.5]);
});
