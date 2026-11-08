import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'));
const reports=[];
for(const supply of [1.4,1.8,2.2])for(const scene of ['ecosystem','invasion']){
  const s=new CellLab.Simulation({scene,worldWidth:192,worldHeight:144,refinement:1,settings:{supply,growth:.8},seed:17});const rows=[];
  for(let i=0;i<6;i++){s.advance(250);const tumor=s.live().filter(c=>c.kind===2);rows.push({time:s.C.time,tumors:tumor.length,immune:s.live().filter(c=>c.kind===3).length,fitness:tumor.reduce((a,c)=>a+c.fitness,0)/(tumor.length||1),...s.counters});}
  const report={supply,scene,rows};reports.push(report);console.log(JSON.stringify(report));
}
await writeFile('output/v3/balance.json',JSON.stringify(reports,null,2));
