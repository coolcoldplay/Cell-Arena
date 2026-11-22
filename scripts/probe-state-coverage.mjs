import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const [scene,output,stepsArg='1800',...seedArgs]=process.argv.slice(2);
if(!['oncogenesis','cold','hot','random','empty','maze'].includes(scene)||!output)throw Error('Usage: node scripts/probe-state-coverage.mjs SCENE OUTPUT [STEPS] [SEEDS...]');
const steps=Number(stepsArg),seeds=seedArgs.length?seedArgs.map(Number):[7,17,29,47,77,101];
if(!Number.isInteger(steps)||steps<=0||seeds.some(n=>!Number.isSafeInteger(n)))throw Error('Invalid steps or seeds');
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
const wasm=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
await mkdir(output,{recursive:true});
for(const seed of seeds){
  const config={scene,seed,worldWidth:192,worldHeight:144,refinement:1.5,boundary:'wrap'};
  const sim=new CellLab.Simulation(config);
  await CellLabWasm.install(sim,wasm);
  const start=sim.C.time;
  sim.advance(steps);
  const rows=sim.populationHistory();
  await writeFile(path.join(output,scene+'-'+seed+'.json'),JSON.stringify({config,start,steps,rows}));
  console.log(scene,seed,sim.C.time,rows.length);
}
