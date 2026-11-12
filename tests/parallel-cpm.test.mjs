import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repeatTissue,checkState} from '../experiments/parallel-cpm/harness.js';

function fixture(){
  const f={width:8,height:8,wrap:true,section:true,cellCapacity:3,grid:new Uint32Array(128),activity:new Uint32Array(64),cells:new Float32Array(96),state:new Int32Array(6),data:new Float32Array(262988)};
  for(const id of [1,2]){f.cells[id*32]=1;f.cells[id*32+1]=1;f.cells[id*32+21]=1;}
  return f;
}
test('periodic tissue replication keeps seam-crossing cells connected and conserves their geometry',()=>{
  const f=fixture();for(const x of [7,0])f.grid[3*8+x]=1;for(const x of [3,4])f.grid[5*8+x]=2;
  f.cells[32+16]=0;f.cells[32+17]=3;f.cells[64+16]=3.5;f.cells[64+17]=5;
  for(const id of [1,2]){f.state[id*2]=2;f.state[id*2+1]=14;}
  const lifted=repeatTissue(f,3,2),result=checkState(lifted,{grid:lifted.grid.subarray(0,lifted.width*lifted.height),state:lifted.state});
  assert.equal(lifted.cellsCount,12);assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(lifted.grid[3*24],1);assert.equal(lifted.grid[3*24+23],1,'left seam joins the adjacent cell replica');
});
test('periodic interaction targets reference the nearest replica on either side of a seam',()=>{
  const f=fixture();f.grid[3*8+1]=1;f.grid[3*8+7]=2;
  for(const [id,x,target]of [[1,1,2],[2,7,1]]){f.cells[id*32+16]=x;f.cells[id*32+17]=3;f.cells[id*32+13]=target;f.state[id*2]=1;f.state[id*2+1]=8;}
  const lifted=repeatTissue(f,3,1);
  assert.equal(lifted.cells[1*32+13],6,'target at x=7 is nearest through the left seam');
  assert.equal(lifted.cells[2*32+13],3,'target at x=1 is nearest in the next tile');
  assert.equal(lifted.cells[5*32+13],4);assert.equal(lifted.cells[6*32+13],1);
});
