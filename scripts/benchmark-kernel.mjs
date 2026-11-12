import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'));
const rows=[];for(const refinement of [1.5,2])for(const kernel of ['reference','fast']){
  const s=new CellLab.Simulation({worldWidth:320,worldHeight:240,refinement,seed:17,kernel});s.advance(50);const t=performance.now();s.advance(150);const row={kernel,refinement,width:s.width,height:s.height,cells:s.live().length,rate:150000/(performance.now()-t)};rows.push(row);console.log(JSON.stringify(row));
}
await writeFile('output/v4/kernel-benchmark.json',JSON.stringify(rows,null,2));
