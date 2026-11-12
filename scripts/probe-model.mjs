import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
for(const file of ['vendor/artistoo.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(file,'utf8'));
const results=[];
for(const scene of ['ecosystem','collective','invasion','maze']){
  const s=new CellLab.Simulation({scene}),start=performance.now(),initial=s.snapshot().cells;
  const samples=[];for(let n=0;n<10;n++){s.advance(200);const snap=s.snapshot();samples.push({time:s.C.time,normal:snap.cells.filter(c=>c.kind===1).length,tumor:snap.cells.filter(c=>c.kind===2).length,immune:snap.cells.filter(c=>c.kind===3).length,dying:snap.cells.filter(c=>c.dying).length,...snap.counters});}
  const ms=performance.now()-start,broken=s.live().filter(c=>!c.dying&&s.components(c.id).length!==1).map(c=>c.id);
  results.push({scene,initialCells:initial.length,mcsPerSecond:2000*1000/ms,broken,samples});console.log(JSON.stringify(results.at(-1)));
}
await mkdir('output',{recursive:true});await writeFile('output/model-probe.json',JSON.stringify(results,null,2));
