import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'));
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),rows=[];
for(const [worldWidth,refinement] of [[240,1.5],[320,2],[384,2]]){
  let expected='';for(const kernel of ['fast','wasm']){
    const s=new CellLab.Simulation({worldWidth,worldHeight:worldWidth*.75,refinement,seed:17});if(kernel==='wasm')await CellLabWasm.install(s,module);
    s.advance(30);const t=performance.now();s.advance(150);const elapsed=performance.now()-t,hash=createHash('sha256').update(s.C.grid._pixels).digest('hex');
    if(kernel==='fast')expected=hash;if(hash!==expected)throw Error('Kernel trajectory mismatch');
    const row={kernel,lattice:[s.width,s.height],cells:s.live().length,mcsPerSecond:150000/elapsed,hash,counters:s.counters};rows.push(row);console.log(JSON.stringify(row));
  }
}
await writeFile('output/v4/benchmark.json',JSON.stringify(rows,null,2));
