import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
function originalRaster(s){const grid=new Uint16Array(s.width*s.height),activity=new Uint8Array(grid.length),walls=new Uint8Array(grid.length);let orphans=0,visitedPixels=0,freePixels=0;
  for(let q=0;q<grid.length;q++){const i=s.positions[q],id=s.C.grid.pixti(i);grid[q]=id;const m=s.cells[id];if(m)activity[q]=Math.min(255,Math.round(s.act.pxact(i)/s.C.conf.MAX_ACT[m.kind]*255));else if(id){if(s.C.cellKind(id)===4)walls[q]=1;else orphans++;}if(!walls[q]){freePixels++;visitedPixels+=s.patrol.visited[i];}}
  return {grid,activity,walls,orphans,patrol:s.patrolReport({visitedPixels,freePixels})};
}
for(const kernel of ['reference','fast','wasm'])for(const boundary of ['solid','wrap'])test(`snapshot is an exact detached raster across tile edges: ${kernel}/${boundary}`,async()=>{
  const s=new CellLab.Simulation({scene:'empty',width:79,height:59,warmup:0,kernel,boundary});
  s.seed(1,20,21,9);s.seed(2,38,21,8);s.seed(3,54,34,5);s.paint(65,43,4);s.advance(10);
  if(kernel==='wasm')await CellLabWasm.install(s,module);
  for(let step=0;step<3;step++){
    const beforeRng=Array.from(s.C.mt.mt),beforeIndex=s.C.mt.mti,expected=originalRaster(s),a=s.snapshot();
    for(const key of Object.keys(expected))assert.deepEqual(a[key],expected[key],key);
    assert.deepEqual(Array.from(s.C.mt.mt),beforeRng);assert.equal(s.C.mt.mti,beforeIndex);
    const old=a.grid.slice();s.advance(3);assert.deepEqual(a.grid,old,'previous snapshot must not alias the simulation or next snapshot');
    if(step===0)s.eraseCell(2);if(step===1)s.seed(2,38,21,6);
  }
});
