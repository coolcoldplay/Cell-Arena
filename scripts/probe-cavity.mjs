// Controlled mechanics experiment: no stochastic deaths, growth or vessels.
// Compare an older section implementation with --section=path/to/section.js.
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const section=args.section||'src/section-mechanics.js';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js',section,'src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const quiet={vesselCount:0,metabolism:0,stressMutation:0,inflammation:0,apoptosis:0,kill:0,normalRepair:0,growth:0,immuneGrowth:0,normalMutationGain:0,tumorMutationGain:0};
const cases=[
  {seed:17,refinement:1.5,deaths:0},
  {seed:17,refinement:1.5,deaths:1},
  {seed:31,refinement:1.5,deaths:1},
  {seed:77,refinement:2,deaths:1},
  {seed:17,refinement:1,deaths:24},
  {seed:17,refinement:1.5,deaths:1,scene:'cold',cause:'kill'},
];
const results=[];
for(const spec of cases){
  const s=new CellLab.Simulation({scene:spec.scene||'oncogenesis',seed:spec.seed,worldWidth:240,worldHeight:180,refinement:spec.refinement,boundary:'wrap',settings:quiet});
  await CellLabWasm.install(s,module);
  const victims=s.live().filter(m=>spec.cause==='kill'?m.kind===2:m.state==='normal')
    .sort((a,b)=>Math.hypot(a.x-s.width/2,a.y-s.height/2)-Math.hypot(b.x-s.width/2,b.y-s.height/2)).slice(0,spec.deaths);
  const initialArea=new Map(s.live().map(m=>[m.id,s.C.getVolume(m.id)])),scale2=s.scale*s.scale;
  const victimArea=victims.reduce((n,m)=>n+initialArea.get(m.id),0)/scale2;
  function sample(){
    let empty=0,largest=0,components=0;const seen=new Uint8Array(s.C.grid._pixels.length);
    for(const i of s.positions){
      if(s.C.pixti(i)!==0||seen[i])continue;
      components++;seen[i]=1;const queue=[i];
      for(let n=0;n<queue.length;n++)for(const j of s.faces[queue[n]])if(s.C.pixti(j)===0&&!seen[j]){seen[j]=1;queue.push(j);}
      empty+=queue.length;largest=Math.max(largest,queue.length);
    }
    const live=s.live().filter(m=>!m.dying);
    return {time:s.C.time,live:live.length,dying:s.live().length-live.length,deathEvents:s.deathHistory.length,
      emptyArea:empty/scale2,largestCavity:largest/scale2,components,
      liveAreaLoss:live.reduce((n,m)=>n+initialArea.get(m.id)-s.C.getVolume(m.id),0)/scale2,
      meanSection:live.reduce((n,m)=>n+m.sectionFraction,0)/live.length};
  }
  const samples=[sample()];
  for(const m of victims){s.beginDeath(m.id,spec.cause||'environment');if(victims.length>1)s.advance(12);}
  for(let n=0;n<600;n+=60){s.advance(60);samples.push(sample());}
  const result={...spec,victimArea,samples,orphans:s.snapshot().orphans};results.push(result);
  console.log(JSON.stringify({...spec,victimArea,initial:samples[0],final:samples.at(-1),ratio:victimArea?(samples.at(-1).emptyArea-samples[0].emptyArea)/victimArea:null}));
}
await mkdir('output/cavity-diagnosis',{recursive:true});
await writeFile(args.output||'output/cavity-diagnosis/comparison.json',JSON.stringify({sectionSHA256:createHash('sha256').update(await readFile(section)).digest('hex'),modelRevision:CellLab.MODEL_REVISION,results},null,2));
