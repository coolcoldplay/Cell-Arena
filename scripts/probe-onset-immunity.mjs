// Read-only observers: no interventions, no RNG consumed by measurements.
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const label=arg('label','baseline'),seeds=arg('seeds','17,31,77,101').split(',').map(Number),until=Number(arg('until','6000'));
const files=['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'];
const sourceRevision=arg('source-revision','');
const hashes={};for(const f of files){const text=sourceRevision?execFileSync('git',['show',sourceRevision+':'+f],{encoding:'utf8',maxBuffer:8*1024*1024}):await readFile(f,'utf8');hashes[f]=createHash('sha256').update(text).digest('hex');vm.runInThisContext(text,{filename:f});}
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
hashes['build/cpm-kernel.wasm']=createHash('sha256').update(await readFile('build/cpm-kernel.wasm')).digest('hex');
const dir=arg('out','reports/onset-calibration-2026-11-13');await mkdir(dir,{recursive:true});
const saved=arg('settings-file','')?JSON.parse(await readFile(arg('settings-file',''),'utf8')):null;
const config={worldWidth:240,worldHeight:180,refinement:Number(arg('refinement','1.5')),boundary:'wrap',warmup:35,scene:arg('scene','oncogenesis'),settings:saved?(saved.runs?.[0]?.settings||saved.settings||saved):JSON.parse(arg('settings','{}'))};
const result={sourceRevision,revision:CellLab.MODEL_REVISION,hashes,config,until,label,runs:[]};
for(const seed of seeds){
  const s=new CellLab.Simulation({...config,seed});await CellLabWasm.install(s,module);
  const run={seed,settings:{...s.settings},first:{},events:{},contactChecks:0,contactReasons:{},stimulatingChecks:0,activeCellMcs:0,suppressiveCellMcs:0,immuneCellMcs:0,peakActive:0,peakSuppressive:0,samples:[]};
  const started=performance.now(),evaluate=s.immunity.evaluate.bind(s.immunity);
  s.immunity.evaluate=(ctl,target,contact,cache=true)=>{const r=evaluate(ctl,target,contact,cache);if(contact&&cache){run.contactChecks++;for(const reason of r.reasons)run.contactReasons[reason]=(run.contactReasons[reason]||0)+1;if(r.stimulus>0)run.stimulatingChecks++;}return r;};
  const log=s.log.bind(s);s.log=(type,id,target=0,detail={})=>{
    run.events[type]=(run.events[type]||0)+1;
    if(!run.first[type]){const m=s.cells[id];run.first[type]={time:s.C.time,id,...detail,deathsStarted:s.deathHistory.length,deathsCleared:s.deathHistory.filter(d=>d.clearedAt!==null).length,...(type==='immune-suppressive'?{injury:s.fieldOnCell(m,'normalDamage'),normalDamageExposure:m.normalDamageExposure,normalStressMax:Math.max(0,...s.live().filter(m=>m.kind===1&&m.state==='normal').map(m=>m.stress))}:{})};}
    return log(type,id,target,detail);
  };
  const interactions=s.immuneInteractions.bind(s);s.immuneInteractions=dt=>{
    const value=interactions(dt);let active=0,blue=0,immune=0;
    for(const m of s.live())if(m.kind===3&&!m.dying){immune++;if(m.immunePhenotype==='suppressive')blue++;else if(m.activation>0)active++;}
    run.activeCellMcs+=active*dt;run.suppressiveCellMcs+=blue*dt;run.immuneCellMcs+=immune*dt;
    run.peakActive=Math.max(run.peakActive,active);run.peakSuppressive=Math.max(run.peakSuppressive,blue);
    if(active&&!run.first.active)run.first.active={time:s.C.time};return value;
  };
  const canStimulate=(receptor,m)=>{const g=s.immunity.genes(m);return g.peptides.some((p,i)=>p.present&&!s.immunity.self.includes(p.sequence)&&p.channel===receptor?.channel&&m.expression.peptides[i]*m.expression.presentation[p.channel]*Math.max(0,Math.min(1,(CellLabImmunity.affinity(receptor.sequence,p.sequence)-CellLabImmunity.threshold)/(.94-CellLabImmunity.threshold)))>=.18);};
  const sample=()=>{
    const live=s.live().filter(m=>!m.dying),immune=live.filter(m=>m.kind===3),targets=live.filter(m=>m.kind===2||m.state==='abnormal'),report=s.immunity.report();
    const coverage={targets:targets.length,withNonself:0,withPresented:0,withRepertoireMatch:0,withResidentMatch:0,withReadyResidentMatch:0};
    for(const m of targets){const g=s.immunity.genes(m);coverage.withNonself+=Number(g.peptides.some(p=>p.present&&!s.immunity.self.includes(p.sequence)));coverage.withPresented+=Number(g.peptides.some((p,i)=>p.present&&!s.immunity.self.includes(p.sequence)&&m.expression.peptides[i]*m.expression.presentation[p.channel]>=.18));coverage.withRepertoireMatch+=Number(s.immunity.repertoire.some(r=>canStimulate(r,m)));coverage.withResidentMatch+=Number(immune.some(c=>(s.immunity.receptors?s.immunity.receptors(c):[s.immunity.genes(c).receptor]).some(r=>canStimulate(r,m))));coverage.withReadyResidentMatch+=Number(immune.some(c=>c.primed&&c.immunePhenotype!=='suppressive'&&c.immuneRefractory<=0&&(s.immunity.receptors?s.immunity.receptors(c):[s.immunity.genes(c).receptor]).some(r=>canStimulate(r,m))));}
    run.samples.push({time:s.C.time,normal:live.filter(m=>m.kind===1&&m.state==='normal'&&!m.vesselID).length,precancer:live.filter(m=>m.state==='abnormal').length,tumor:live.filter(m=>m.kind===2).length,immune:immune.length,active:immune.filter(m=>m.activation>0&&m.immunePhenotype!=='suppressive').length,suppressive:immune.filter(m=>m.immunePhenotype==='suppressive').length,deathsStarted:s.deathHistory.length,deathsCleared:s.deathHistory.filter(d=>d.clearedAt!==null).length,counters:{...s.counters},coverage,immuneCoverage:report.coverage,immunity:report.metrics,vascular:s.vascular.report(),learnedCells:immune.filter(m=>m.learnedReceptors?.length).length,antigenCarriers:immune.filter(m=>m.antigenCargo?.length).length,maxPrimingProgress:Math.max(0,...report.repertoire.map(r=>r.progress)),queue:report.queue});
  };
  sample();for(let t=500;t<=until;t+=500){s.advance(t-s.C.time);sample();}
  run.elapsedMs=performance.now()-started;result.runs.push(run);await writeFile(`${dir}/${label}.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({label,seed,elapsedMs:Math.round(run.elapsedMs),firstActive:run.first.active?.time??null,firstBlue:run.first['immune-suppressive'],firstDeath:run.first['death-start'],activeFraction:run.activeCellMcs/run.immuneCellMcs,blueFraction:run.suppressiveCellMcs/run.immuneCellMcs,peakActive:run.peakActive,contacts:run.contactChecks,stimulating:run.stimulatingChecks,contactReasons:run.contactReasons,final:run.samples.at(-1)}));
}
