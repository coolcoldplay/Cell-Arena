import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/fullscreen-view.js','utf8'));

test('a portrait arena fits in the column beside the statistics',()=>{
  const f=CellLabFullscreen.layout(298,844,4/3);
  assert.equal(f.boardWidth,298);
  assert.equal(f.boardHeight,223.5);
});
test('a wide arena stays height-limited in landscape',()=>{
  const f=CellLabFullscreen.layout(664,390,4/3);
  assert.equal(f.boardWidth,520);
  assert.equal(f.boardHeight,390);
});
test('touch coordinates use the displayed canvas rectangle in both orientations',()=>{
  for(const rect of [{left:0,top:310,width:298,height:223.5},{left:72,top:0,width:520,height:390}]){
    for(const [u,v] of [[0,0],[1,1],[.5,.5],[.2,.8]]){
      const [x,y]=CellLabFullscreen.coordinates(rect,rect.left+u*rect.width,rect.top+v*rect.height);
      assert.ok(Math.abs(x-u)<1e-12&&Math.abs(y-v)<1e-12);
    }
  }
});
