import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/cell-appearance.js','utf8'));
vm.runInThisContext(await readFile('src/experiment.js','utf8'));

function scene(boundary='solid',shift=0){
  const width=40,height=30,grid=new Uint16Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let id=0;if(x>=4&&x<=16&&y>=4&&y<=23)id=1;
    if(x>=17&&x<=31&&y>=5&&y<=18)id=2;
    if(x>=9&&x<=26&&y===20)id=1;
    if(x>=32&&x<=37&&y>=5&&y<=25)id=3;
    if(x>=20&&x<=24&&y>=9&&y<=13)id=0;
    grid[y*width+(x+shift)%width]=id;
  }
  const cells=[1,2,3].map(id=>({id,kind:id,area:grid.reduce((n,v)=>n+(v===id),0)}));
  return {width,height,grid,cells,boundary};
}

test('distance follows actual concave and touching membranes, not cell centroids',()=>{
  for(const boundary of ['solid','wrap']){
    const s=scene(boundary,boundary==='wrap'?18:0),before=structuredClone(s),cache=new CellLabAppearance.Surface(),layer=cache.get(s),{width:w,height:h,grid}=s;
    const at=(x,y)=>boundary==='wrap'?grid[((y+h)%h)*w+(x+w)%w]:x<0||y<0||x>=w||y>=h?0:grid[y*w+x];
    const seeds=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const id=at(x,y);if(!id||[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>at(x+dx,y+dy)!==id))seeds.push([x,y]);}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const q=y*w+x;if(!grid[q]){assert.equal(layer.interior[q],255);continue;}
      let expected=Infinity;for(const [sx,sy]of seeds){let dx=Math.abs(x-sx),dy=Math.abs(y-sy);if(boundary==='wrap'){dx=Math.min(dx,w-dx);dy=Math.min(dy,h-dy);}expected=Math.min(expected,Math.hypot(dx,dy));}
      assert.ok(cache.depth[q]>=expected+.5-1e-5&&cache.depth[q]<=expected*1.083+.5+1e-5,`${boundary} at ${x},${y}: distance approximation stays within 8.3%`);
    }
    assert.deepEqual(s,before,'appearance does not mutate any model data');
  }
});

test('torus translations preserve gradients and introduce no screen-edge seam',()=>{
  const a=scene('wrap'),b=scene('wrap',18),x=new CellLabAppearance.Surface().get(a),y=new CellLabAppearance.Surface().get(b);
  for(let j=0;j<a.height;j++)for(let i=0;i<a.width;i++)assert.equal(x.interior[j*a.width+i],y.interior[j*a.width+(i+18)%a.width]);
});

test('cores retain their chosen color while membrane tips fade; changing shape invalidates the cache',()=>{
  const s=scene(),cache=new CellLabAppearance.Surface(),first=cache.get(s),copy=first.interior.slice();
  assert.equal(first.interior[13*40+10],255);assert.ok(first.interior[20*40+24]<20,'one-pixel protrusion has a translucent rim');
  assert.equal(cache.get(s),first,'paused redraws reuse the distance transform');
  const next=structuredClone(s);for(let y=9;y<18;y++)next.grid[y*40+10]=0;
  const changed=cache.get(next);assert.notEqual(changed,first);assert.notDeepEqual(changed.interior,copy);assert.equal(changed.interior[13*40+10],255,'removed body leaves no old silhouette');
  assert.ok(changed.interior[13*40+9]<copy[13*40+9],'a new membrane gets a new fade immediately');
});

test('division creates separate daughter rims; walls and an empty dish never become transparent',()=>{
  const s=scene(),cache=new CellLabAppearance.Surface();const old=cache.get(s).interior.slice();
  const next=structuredClone(s);for(let y=14;y<24;y++)for(let x=4;x<17;x++)next.grid[y*40+x]=4;
  next.cells.push({id:4,kind:1,area:130});const after=cache.get(next).interior;
  assert.ok(after[13*40+10]<old[13*40+10]);assert.ok(after[14*40+10]<old[14*40+10]);
  const wall={width:32,height:24,boundary:'solid',grid:new Uint16Array(768).fill(7),cells:[{id:7,kind:4,area:768}]};
  assert.ok(cache.get(wall).interior.every(v=>v===255));wall.grid.fill(0);wall.cells=[];assert.ok(cache.get({...wall}).interior.every(v=>v===255));
});

test('fully occupied single-cell torus has no artificial edge and has finite opacity',()=>{
  const s={width:32,height:24,boundary:'wrap',grid:new Uint16Array(768).fill(1),cells:[{id:1,kind:1,area:768}]};
  assert.ok(new CellLabAppearance.Surface().get(s).interior.every(v=>v===255));
});

test('appearance strength round-trips as a display setting with backwards-compatible imports',()=>{
  const data={scene:'empty',seed:42,boundary:'wrap',refinement:1,worldWidth:80,worldHeight:60,settings:{}};
  assert.equal(CellLabExperiment.parse(data).display.edgeFade,undefined);
  for(const edgeFade of [0,35,80,100])assert.equal(CellLabExperiment.parse({...data,display:{edgeFade}}).display.edgeFade,edgeFade);
  for(const edgeFade of [-1,101,NaN,'80'])assert.throws(()=>CellLabExperiment.parse({...data,display:{edgeFade}}),/edgeFade/);
});

test('large refined grids retain every original membrane, thin extension and empty pixel',()=>{
  const width=800,height=480,grid=new Uint16Array(width*height);
  for(let y=100;y<150;y++)for(let x=100;x<150;x++)grid[y*width+x]=1;
  for(let x=150;x<190;x++)grid[122*width+x]=1;
  for(let y=100;y<150;y++)for(let x=150;x<200;x++)if(y!==122)grid[y*width+x]=2;
  // A thin cell is entirely missed by coarse sample centers but must stay on
  // the original occupied silhouette; the distance field adds no new occupancy.
  for(let x=30;x<40;x++)grid[30*width+x]=3;
  const cells=[1,2,3].map(id=>({id,kind:id,area:grid.reduce((n,v)=>n+(v===id),0)})),s={width,height,grid,cells,refinement:2,boundary:'wrap'},before=grid.slice(),cache=new CellLabAppearance.Surface(),a=cache.get(s),full=cache.full(s);
  assert.equal(a.scale,2);assert.equal(a.interior.length,grid.length/4);assert.equal(full.interior.length,grid.length);assert.equal(full.interior[125*width+125],255);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const q=y*width+x,id=grid[q];if(!id)assert.equal(full.interior[q],255);else if(id!==3&&[q-1,q+1,q-width,q+width].some(p=>grid[p]!==id))assert.ok(full.interior[q]<130);}
  assert.deepEqual(grid,before);assert.equal(cache.get(s),a);assert.equal(cache.full(s),full);
});
