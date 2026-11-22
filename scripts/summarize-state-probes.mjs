import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import '../src/tumor-state.js';
const [coverageDir,accuracyDir,out,longDir]=process.argv.slice(2);
if(!out)throw Error('Usage: node scripts/summarize-state-probes.mjs COVERAGE_DIR ACCURACY_DIR RESULTS_JSON [EXTENDED_VALIDATION_DIR]');
const read=async(dir,scene,seed)=>JSON.parse(await readFile(path.join(dir,scene+'-'+seed+'.json')));
const coverage={},accuracy={},runs=[],seen=new Set(),samples={},examples={},joint={windows:0,withSignals:0,exact:0,exactWithSignals:0,referenceMultiple:0,detectedMultiple:0,exactOnReferenceMultiple:0};
const ratio=(a,b)=>b?a/b:null;
const coverageSeeds=[7,17,29,47,77,101],validationSeeds=[13,31,59,83,109,149];
const allSignals=['immuneAbsent','immuneActive','exhausted','focalExhaustion','suppressed','escapeHint','distal','export','manual'];
for(const scene of ['oncogenesis','cold','hot','random']){
  for(const seed of coverageSeeds){
    const {rows,start,steps}=await read(coverageDir,scene,seed),labels=new Set();
    for(let i=0;i<rows.length;i++){
      const a=CellLabTumorState.assess(rows.slice(0,i+1));
      for(const id of [a.phase,...a.signals]){labels.add(id);seen.add(id);samples[id]=(samples[id]||0)+1;}
    }
    for(const id of labels)(coverage[id]??=[]).push(scene+'/'+seed);
    runs.push({scene,seed,group:'coverage',start,steps,samples:rows.length,labels:[...labels]});
  }
  for(const seed of [...validationSeeds,...(longDir?[211,307]:[])]){
    const extended=!validationSeeds.includes(seed);
    const run=await read(extended?longDir:accuracyDir,scene,seed);
    for(const [key,count] of Object.entries(run.scores)){
      const v=accuracy[key]??={tp:0,fp:0,fn:0,tn:0,positiveRuns:0};
      for(const k of ['tp','fp','fn','tn'])v[k]+=count[k];if(count.tp+count.fn)v.positiveRuns++;
    }
    for(const [key,error] of Object.entries(run.errors))(examples[key]??=[]).push({scene,seed,...error});
    for(const {signals,reference} of run.decisions){
      const gold=reference.filter(x=>allSignals.includes(x)),union=new Set([...signals,...gold]);
      const exact=signals.length===gold.length&&signals.every(v=>gold.includes(v));
      joint.windows++;joint.exact+=Number(exact);
      if(union.size){joint.withSignals++;joint.exactWithSignals+=Number(exact);}
      if(gold.length>=2){joint.referenceMultiple++;joint.exactOnReferenceMultiple+=Number(exact);}
      if(signals.length>=2)joint.detectedMultiple++;
    }
    runs.push({scene,seed,group:extended?'extended-validation':'validation',steps:run.steps,scores:run.scores,decisions:run.decisions});
  }
}
for(const v of Object.values(accuracy))Object.assign(v,{precision:ratio(v.tp,v.tp+v.fp),recall:ratio(v.tp,v.tp+v.fn),f1:ratio(2*v.tp,2*v.tp+v.fp+v.fn)});
const unobserved=Object.keys(CellLabTumorState.names).filter(id=>!seen.has(id));
const sourceHashes={};
for(const file of ['src/tumor-state.js','src/model.js','scripts/probe-state-coverage.mjs','scripts/probe-state-accuracy.mjs','scripts/summarize-state-probes.mjs'])
  sourceHashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(out,JSON.stringify({sourceHashes,names:CellLabTumorState.names,coverageSeeds,validationSeeds,extendedSeeds:longDir?[211,307]:[],coverage,samples,unobserved,accuracy,joint,examples,runs},null,2)+'\n');
console.log(JSON.stringify({labels:seen.size,unobserved,joint,metrics:Object.fromEntries(Object.entries(accuracy).map(([k,v])=>[k,[v.tp,v.fp,v.fn]]))},null,2));
