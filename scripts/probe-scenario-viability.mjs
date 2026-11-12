// Descriptive calibration, never filters seeds or controls a running experiment.
// Example: node scripts/probe-scenario-viability.mjs --scene=oncogenesis --seeds=17,31 --steps=6000
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const modelFile=args.model||'src/immune-genetics.js','src/model.js';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js',modelFile])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const modelSHA256=createHash('sha256').update(await readFile(modelFile)).digest('hex');
const output=args.output||'output/scenario-calibration';await mkdir(output,{recursive:true});
const settings=Object.fromEntries(Object.keys(CellLab.DEFAULTS).filter(k=>args[k]!==undefined).map(k=>[k,Number(args[k])]));
const cases=args.cases?JSON.parse(await readFile(args.cases,'utf8')):(args.scene||'oncogenesis,random,cold,hot').split(',').flatMap(scene=>(args.seeds||'17,31,77').split(',').map(Number).map(seed=>({scene,seed,settings})));
const quantiles=(cells,key)=>{const v=cells.map(c=>c[key]).sort((a,b)=>a-b);return [.1,.5,.9].map(q=>v.length?Number(v[Math.floor((v.length-1)*q)].toFixed(3)):null);};
for(const spec of cases){
  const config={worldWidth:Number(args.width||240),worldHeight:Number(args.width||240)*.75,refinement:Number(args.refinement||1.5),boundary:args.boundary||'wrap',...spec};
  const s=new CellLab.Simulation(config);await CellLabWasm.install(s,module);
  if(args.nicheScale!==undefined&&s.ecology){
    const scale=Number(args.nicheScale);s.supplyMap.fill(1);
    for(let i=0;i<s.supplyMap.length;i++){
      const x=(i%s.fields.oxygen.width+.5)/s.fields.oxygen.width,y=(Math.floor(i/s.fields.oxygen.width)+.5)/s.fields.oxygen.height;
      for(const n of s.ecology.niches){const r=Math.hypot((x-n.x)/(n.rx*scale),(y-n.y)/(n.ry*scale));s.supplyMap[i]=Math.min(s.supplyMap[i],n.floor+(1-n.floor)*Math.max(0,Math.min(1,(r-.55)/.65)));}
    }
  }
  // Optional diagnostic perturbation; never applied by the application.
  if(args.nicheFloor!==undefined)for(let i=0;i<s.supplyMap.length;i++)s.supplyMap[i]=Math.max(s.supplyMap[i],Number(args.nicheFloor));
  const started=performance.now(),samples=[],steps=Number(args.steps||6000);
  const summarize=()=>{
    const live=s.live().filter(c=>!c.dying),immune=live.filter(c=>c.kind===3),normal=live.filter(c=>c.state==='normal');
    return {time:s.C.time,counts:Object.fromEntries(['normal','abnormal','tumor','immune','endothelial'].map(state=>[state,live.filter(c=>c.state===state).length])),active:immune.filter(c=>c.activation>0&&c.immunePhenotype!=='suppressive').length,suppressive:immune.filter(c=>c.immunePhenotype==='suppressive').length,tumorDivisions:s.scenarioReport().tumorDivisions,farTumor:s.scenarioReport().farTumor,normalEnvironment:Object.fromEntries(['oxygen','glucose','acid','stress','fitness'].map(key=>[key,quantiles(normal,key)])),normalSupport:s.normalSupportReport().factor,counters:{...s.counters}};
  };
  samples.push(summarize());
  for(let n=0;n<steps;n+=250){s.advance(Math.min(250,steps-n));samples.push(summarize());}
  const deaths={};for(const d of s.deathHistory){const key=`${d.state}:${d.trigger||d.cause}`;deaths[key]=(deaths[key]||0)+1;}
  const firstTumor=samples.find(x=>x.counts.tumor>0)?.time??null,firstHalfLoss=samples.find(x=>Object.entries(x.counts).filter(([k])=>k!=='endothelial').reduce((n,[,v])=>n+v,0)<.5*(samples[0].counts.normal+samples[0].counts.immune+samples[0].counts.tumor))?.time??null;
  const survivors=s.live().filter(m=>!m.dying&&m.kind===2).map(m=>({birth:m.birth,x:m.x/s.scale,y:m.y/s.scale,target:m.target/s.scale**2,area:s.C.getVolume(m.id)/s.scale**2,cycle:m.cycle,resources:m.resources,genome:m.genome,oxygen:m.oxygen,glucose:m.glucose,acid:m.acid,stress:m.stress}));
  const result={modelSHA256,config,settings:s.settings,diagnosticNicheFloor:args.nicheFloor===undefined?null:Number(args.nicheFloor),diagnosticNicheScale:args.nicheScale===undefined?null:Number(args.nicheScale),samples,deaths,survivors,firstTumor,firstHalfLoss,orphans:s.snapshot().orphans,elapsedSeconds:Math.round((performance.now()-started)/1000)};
  const file=`${output}/${args.tag||'viability'}-${spec.scene}-${spec.seed}-${config.worldWidth}-${config.refinement}.json`;await writeFile(file,JSON.stringify(result,null,2));
  console.log(JSON.stringify({file,firstTumor,firstHalfLoss,deaths,elapsedSeconds:result.elapsedSeconds,initial:samples[0].counts,final:samples.at(-1).counts,divisions:samples.at(-1).tumorDivisions,maxTumor:Math.max(...samples.map(x=>x.counts.tumor)),maxActive:Math.max(...samples.map(x=>x.active)),maxSuppressive:Math.max(...samples.map(x=>x.suppressive)),finalNormalEnvironment:samples.at(-1).normalEnvironment}));
}
