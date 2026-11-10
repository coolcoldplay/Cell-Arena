import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/display-fields.js','utf8'));
const area=points=>Math.abs(points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p[0]*q[1]-p[1]*q[0];},0))/2;
const cell={id:1,birth:4,nucleusX:20,nucleusY:20,nucleusRadius:2.3,kind:2,cycle:{phase:'G1',progress:0},hasNucleus:true};
const roomy={width:41,height:41,boundary:'solid',grid:new Uint16Array(41*41).fill(1)};
test('tumor nuclei are visibly larger than other types at the same protected radius',()=>{
  const tumor=area(CellLabDisplay.nucleusContour(cell,roomy));
  for(const kind of [1,3])assert.ok(tumor>area(CellLabDisplay.nucleusContour({...cell,kind},roomy))*1.5);
});
test('G2 growth is continuous and all M-phase nuclei are modestly larger',()=>{
  for(const kind of [1,2,3]){
    const draw=(phase,progress)=>CellLabDisplay.nucleusContour({...cell,kind,cycle:{phase,progress}},roomy);
    const base=area(draw('G1',1)),mid=area(draw('G2',.5)),full=area(draw('M',0));
    assert.ok(mid>base&&full>mid&&full/base<1.4);assert.deepEqual(draw('G2',1),draw('M',0));
  }
});
test('enlarged deformed nuclei remain in their own body at narrow and periodic boundaries',()=>{
  for(const boundary of ['solid','wrap']){
    const s={width:41,height:41,boundary,grid:new Uint16Array(41*41)},m={...cell,nucleusX:boundary==='wrap'?0:20,nucleusStrainX:.3,cycle:{phase:'M',progress:.5}};
    for(let y=0;y<41;y++)for(let x=0;x<41;x++){const dx=Math.min(Math.abs(x-m.nucleusX),boundary==='wrap'?41-Math.abs(x-m.nucleusX):Infinity);if(dx<=2&&Math.abs(y-20)<=5)s.grid[y*41+x]=1;}
    const points=CellLabDisplay.nucleusContour(m,s);
    for(let i=0;i<points.length;i++)for(let t=0;t<=1;t+=.1){const p=points[i],q=points[(i+1)%points.length];let x=Math.floor(m.nucleusX+.5+p[0]*(1-t)+q[0]*t),y=Math.floor(m.nucleusY+.5+p[1]*(1-t)+q[1]*t);if(boundary==='wrap'){x=(x+41)%41;y=(y+41)%41;}assert.equal(s.grid[y*41+x],1);}
  }
});
test('nuclear display remains deterministic and does not mutate cell-cycle state',()=>{
  const before=structuredClone(cell),grid=roomy.grid.slice(),a=CellLabDisplay.nucleusContour(cell,roomy);
  assert.deepEqual(CellLabDisplay.nucleusContour(cell,roomy),a);assert.deepEqual(cell,before);assert.deepEqual(roomy.grid,grid);
});
