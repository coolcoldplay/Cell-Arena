import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const modelSHA256=createHash('sha256').update(await readFile('src/model.js')).digest('hex');
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const scenes=args.scene?[args.scene]:['oncogenesis','cold','hot'],seeds=(args.seeds||'17').split(',').map(Number),steps=Number(args.steps||2500),width=Number(args.width||240),refinement=Number(args.refinement||1.5),tag=args.tag||'current';
const output=args.output||'output/scenarios';await mkdir(output,{recursive:true});
for(const scene of scenes)for(const seed of seeds){
  const settings=Object.fromEntries(Object.keys(CellLab.DEFAULTS).filter(k=>args[k]!==undefined).map(k=>[k,Number(args[k])]));
  const s=new CellLab.Simulation({worldWidth:width,worldHeight:width*.75,refinement,scene,seed,settings});await CellLabWasm.install(s,module);
  const samples=[],summarize=()=>{const live=s.live(),tumors=live.filter(c=>c.kind===2&&!c.dying),immune=live.filter(c=>c.kind===3&&!c.dying);return {time:s.C.time,counts:Object.fromEntries(['normal','abnormal','tumor','immune'].map(state=>[state,live.filter(c=>c.state===state&&!c.dying).length])),immuneStates:{resting:immune.filter(c=>c.immunePhenotype!=='suppressive'&&c.activation<=0).length,active:immune.filter(c=>c.immunePhenotype!=='suppressive'&&c.activation>0).length,suppressive:immune.filter(c=>c.immunePhenotype==='suppressive').length},cycles:s.cycleReport(),tumorBodies:live.filter(c=>c.kind===2).length,antigenPositive:tumors.filter(c=>c.antigen).length,tumorTarget:tumors.reduce((n,c)=>n+c.target/refinement**2,0),farTumor:tumors.filter(c=>Math.hypot(c.x/s.scale-width/2,c.y/s.scale-width*.375)>55).length,maxRadius:Math.max(0,...tumors.map(c=>Math.hypot(c.x/s.scale-width/2,c.y/s.scale-width*.375))),counters:{...s.counters},report:s.scenarioReport?.()};};
  samples.push(summarize());console.log(JSON.stringify({scene,seed,initial:samples[0]}));
  for(let n=0;n<steps;n+=250){s.advance(Math.min(250,steps-n));samples.push(summarize());console.log(JSON.stringify({scene,seed,...samples.at(-1)}));}
  const snapshot=s.snapshot();const result={scene,seed,width,refinement,settings:s.settings,modelSHA256,samples,events:s.events,lineage:s.lineage,cells:snapshot.cells,orphans:snapshot.orphans};
  await writeFile(`${output}/${tag}-${scene}-${seed}-${width}-${refinement}.json`,JSON.stringify(result,null,2));
}
