import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
vm.runInThisContext(await readFile('src/cell-appearance.js','utf8'));
await CellLabAppearance.install(await readFile('build/appearance-kernel.wasm'));
for(const boundary of ['solid','wrap'])for(const refinement of [1.5,2])test(`optical WASM matches the JS transform byte for byte: ${boundary}/${refinement}`,()=>{
  const width=768,height=576,grid=new Uint16Array(width*height),counts=new Map();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const id=(x+y)%117<12?0:1+Math.floor(x/19)+Math.floor(y/17)*41;
    grid[y*width+x]=id;if(id)counts.set(id,(counts.get(id)||0)+1);
  }
  const cells=[...counts].map(([id,area])=>({id,area,kind:1+id%4})),s={width,height,grid,cells,boundary,refinement};
  const reference=new CellLabAppearance.Surface({accelerated:false}),native=new CellLabAppearance.Surface();
  const before=grid.slice();for(let step=0;step<3;step++){
    const frame={...s},a=reference.get(frame),b=native.get(frame);
    assert.deepEqual(b.interior,a.interior);assert.equal(b.scale,a.scale);
    assert.equal(native.get(frame),b,'paused redraw is cached');
    assert.deepEqual(native.full(frame).interior,reference.full(frame).interior);
  }
  assert.deepEqual(grid,before,'the optical kernel never writes simulation occupancy');
});
test('optical buffers are detached across caches and preserve empty/full/periodic cells',()=>{
  const native=new CellLabAppearance.Surface(),reference=new CellLabAppearance.Surface({accelerated:false});
  for(const boundary of ['solid','wrap'])for(const id of [0,1,65535]){
    const s={width:32,height:24,grid:new Uint16Array(768).fill(id),boundary,cells:id?[{id,area:768,kind:2}]:[]};
    const first=native.get(s),copy=first.interior.slice();
    assert.deepEqual(first.interior,reference.get(s).interior);assert.deepEqual(native.depth,reference.depth);
    new CellLabAppearance.Surface().get({...s,grid:new Uint16Array(768),cells:[]});
    assert.deepEqual(first.interior,copy,'another cache cannot overwrite a previously returned field');
  }
});
