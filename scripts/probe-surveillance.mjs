import vm from 'node:vm';import {readFile,writeFile,mkdir} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const s=new CellLab.Simulation({worldWidth:192,worldHeight:144,refinement:1.5,scene:'surveillance',seed:17});await CellLabWasm.install(s,module);
const samples=[];for(let n=0;n<10;n++){s.advance(250);const row={time:s.C.time,counts:Object.fromEntries(['normal','abnormal','tumor','immune'].map(state=>[state,s.live().filter(m=>m.state===state&&!m.dying).length])),counters:{...s.counters}};samples.push(row);console.log(JSON.stringify(row));}
await mkdir('output/surveillance',{recursive:true});await writeFile('output/surveillance/evolution.json',JSON.stringify({settings:s.settings,samples,events:s.events},null,2));
