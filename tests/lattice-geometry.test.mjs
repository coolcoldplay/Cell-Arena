import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/grid-transfer.js'])
  vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
const offsets=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];
for(const boundary of ['solid','wrap'])test('large lattice preserves ordered neighborhoods and padding: '+boundary,()=>{
  const width=600,height=449,s=new CellLab.Simulation({width,height,boundary,scene:'empty',warmup:0});
  assert.ok(s.pixelIndex);
  const grid=s.C.grid,artistoo=Object.getPrototypeOf(grid).neighi.bind(grid);
  for(let x=0;x<width;x++)for(let y=0;y<height;y++){
    if(x&&x<width-1&&y&&y<height-1&&(x*height+y)%997)continue;
    const i=grid.p2i([x,y]),ring=offsets.map(([dx,dy])=>{
      let xx=x+dx,yy=y+dy;if(s.wrap){xx=(xx+width)%width;yy=(yy+height)%height;}
      return xx<0||xx>=width||yy<0||yy>=height?-1:grid.p2i([xx,yy]);
    });
    assert.deepEqual(s.neighborsAt(i),artistoo(i));
    assert.deepEqual(Array.from(s.ringAt(i)),ring);
    assert.deepEqual(s.facesAt(i),[1,3,5,7].map(k=>ring[k]).filter(j=>j>=0));
  }
  assert.equal(s.ringAt(height),undefined);assert.equal(s.neighborsAt(height),undefined);
  for(const name of ['rings','faces','neighbors'])assert.equal(typeof Object.getOwnPropertyDescriptor(s,name).get,'function');
});
test('legacy tables retain row types, holes, order and repeated access',()=>{
  const s=new CellLab.Simulation({width:79,height:59,scene:'empty',warmup:0});
  for(const [name,read] of [['rings',i=>Int32Array.from(s.ringAt(i))],['faces',s.facesAt],['neighbors',s.neighborsAt]]){
    const rows=s[name];assert.equal(rows,s[name]);assert.equal(rows.length,s.C.grid._pixels.length);
    for(const i of s.positions)assert.deepEqual(rows[i],read(i));
    assert.equal(59 in rows,false);
  }
});
test('coarsening reselects the pixel index for the new lattice size',()=>{
  const s=new CellLab.Simulation({worldWidth:256,worldHeight:256,refinement:2,scene:'empty',warmup:0});
  assert.ok(s.pixelIndex);assert.equal(CellLabGridTransfer.coarsen(s,1).pixelIndex,null);
  const forced=new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,pixelIndex:true});
  assert.ok(CellLabGridTransfer.coarsen(forced,.5).pixelIndex);
});
