// Held-out trajectories. The classifier sees the UI history; the reference observer
// independently reads individual agents every five MCS and intercepts actual events.
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const [scene,output,...args]=process.argv.slice(2);
const steps=Number(args.find(a=>a.startsWith('--steps='))?.slice(8)??3600);
const seedArgs=args.filter(a=>!a.startsWith('--steps='));
if(!Number.isSafeInteger(steps)||steps<180||steps%180)throw Error('Steps must be a positive multiple of 180');
if(!['oncogenesis','random','cold','hot'].includes(scene)||!output)throw Error('Usage: node scripts/probe-state-accuracy.mjs SCENE OUTPUT [--steps=3600] [SEEDS...]');
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/tumor-state.js'])vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
const wasm=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
await mkdir(output,{recursive:true});
const seeds=seedArgs.length?seedArgs.map(Number):[13,31,59,83,109,149];
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
function observe(sim){
  const cells=sim.live(),alive=cells.filter(c=>!c.dying),t=alive.filter(c=>c.kind===2),immune=alive.filter(c=>c.kind===3);
  return {time:sim.C.time,t:t.length,dead:cells.filter(c=>c.kind===2&&c.dying).length,
    pre:alive.filter(c=>c.state==='abnormal').length,low:t.filter(c=>!c.antigen).length,g0:t.filter(c=>c.cycle.phase==='G0').length,
    i:immune.length,ex:immune.filter(c=>c.exhaustion>.5).length,supp:immune.filter(c=>c.immunePhenotype==='suppressive').length};
}
function reference(trace,events){
  const w=trace.filter(r=>r.time>=trace.at(-1).time-180),end=w.at(-1),start=w[0],t=end.t;
  const e=events.filter(e=>e.time>start.time&&e.time<=end.time);
  const has=type=>e.some(q=>q.type===type),codes=new Set();
  if(t===0)codes.add(end.dead?'clearing':trace.some(r=>r.t>0)?'undetected':end.pre?'precancer':'absent');
  if(t&&!end.i)codes.add('immuneAbsent');
  if(has('kill'))codes.add('immuneActive');
  if(has('distal'))codes.add('distal');
  if(has('intravasation'))codes.add('export');
  if(has('manual-remove'))codes.add('manual');
  const lastZero=trace.findLastIndex(r=>!r.t);
  if(t&&lastZero>=0&&end.time-trace[lastZero+1].time<=90){
    const after=trace[lastZero].time;
    if(trace.slice(0,lastZero).some(r=>r.t))codes.add('redetected');
    else codes.add(events.some(q=>q.type==='malignant'&&q.time>after&&q.time<=trace[lastZero+1].time)?'onset':'detected');
  }
  if(w.length>=19){
    if(w.every(r=>r.ex>=2&&2*r.ex>=r.i))codes.add('exhausted');
    else if(w.every(r=>r.ex>=1))codes.add('focalExhaustion');
    if(w.every(r=>r.supp>=2&&2*r.supp>=r.i))codes.add('suppressed');
    // Independent proxy: blocked encounters of primed cells with live tumors,
    // together with an increase in the number of low-presentation tumor cells.
    if(has('blocked-contact')&&end.low>=start.low+2)codes.add('escapeHint');
    if(t&&start.t){
      const oldCounts=w.map(r=>r.t),swing=Math.max(...oldCounts)-Math.min(...oldCounts),band=Math.max(2,.15*start.t);
      const dropThenRecovery=trace.slice(0,trace.length-w.length+1).reduce((best,r)=>r.t?Math.max(best,r.t):0,0)>=2*start.t;
      const third=Math.floor(w.length/3),early=mean(w.slice(0,third).map(r=>r.t)),late=mean(w.slice(-third).map(r=>r.t));
      const change=late-early,limit=Math.max(1.5,.12*early);
      if(change>=limit){codes.add('increase');codes.add(dropThenRecovery?'rebound':'growing');}
      if(change<=-limit){codes.add('decrease');codes.add('declining');}
      const entries=e.filter(q=>q.type==='tumor-division').length;
      if(Math.abs(change)<limit&&!codes.has('onset')&&!codes.has('detected')&&!codes.has('redetected')){
        if(swing>=band)codes.add('fluctuating');
        else if(entries>Math.max(0,end.t-start.t))codes.add('turnover');
        else if(!w.every(r=>r.t&&r.g0/r.t>=.8)||entries>0)codes.add('stable');
      }
      if(w.every(r=>r.t&&r.g0/r.t>=.8)&&!has('tumor-division')&&Math.max(...w.map(r=>r.t))-Math.min(...w.map(r=>r.t))<Math.max(2,.15*start.t))codes.add('dormant');
    }
  }
  return codes;
}
const scored=['absent','precancer','clearing','undetected','onset','detected','redetected','increase','decrease','growing','rebound','declining','stable','fluctuating','turnover','dormant','immuneAbsent','immuneActive','exhausted','focalExhaustion','suppressed','escapeHint','distal','export','manual'];
for(const seed of seeds){
  const config={scene,seed,worldWidth:192,worldHeight:144,refinement:1.5,boundary:'wrap'};
  const sim=new CellLab.Simulation(config);await CellLabWasm.install(sim,wasm);
  const trace=[observe(sim)],events=[],labels={},errors={},scores=Object.fromEntries(scored.map(s=>[s,{tp:0,fp:0,fn:0,tn:0}]));
  const event=type=>events.push({time:sim.C.time,type});
  const log=sim.log.bind(sim);sim.log=(type,id,target,detail)=>{if(type==='removed'&&detail?.cause==='kill')event('kill');if(['malignant','intravasation','manual-remove'].includes(type))event(type);return log(type,id,target,detail);};
  const divide=sim.divide.bind(sim);sim.divide=id=>{const c=sim.cells[id],tumor=c?.kind===2,far=tumor&&sim.scenarioState?.initial.clones.includes(c.clone)&&Math.hypot(c.x/sim.scale-sim.worldWidth/2,c.y/sim.scale-sim.worldHeight/2)>55;const result=divide(id);if(tumor&&result){event('tumor-division');if(far)event('distal');}return result;};
  const evaluate=sim.immunity.evaluate.bind(sim.immunity);
  let blockedAt=-1;sim.immunity.evaluate=(ctl,target,contact=true,cache=true)=>{const v=evaluate(ctl,target,contact,cache);
    if(blockedAt!==sim.C.time&&contact&&cache&&ctl.primed&&target.kind===2&&!target.dying&&v.stimulus===0&&v.reasons.some(r=>['low-expression','antigen-loss','presentation'].includes(r))){blockedAt=sim.C.time;event('blocked-contact');}return v;};
  let windows=0;const decisions=[];
  const simStart=sim.C.time;
  for(let elapsed=5;elapsed<=steps+(180-simStart%180)%180;elapsed+=5){
    sim.advance(5);trace.push(observe(sim));
    if(sim.C.time%180||elapsed<180)continue;
    const a=CellLabTumorState.assess(sim.populationHistory(true)),pred=new Set([a.phase,...a.signals]),gold=reference(trace,events);
    for(const key of pred)labels[key]=(labels[key]||0)+1;
    if(pred.has('growing')||pred.has('rebound'))pred.add('increase');
    if(pred.has('declining'))pred.add('decrease');
    for(const key of scored){
      const hit=gold.has(key),said=pred.has(key),result=hit?(said?'tp':'fn'):(said?'fp':'tn');scores[key][result]++;
      if((result==='fn'||result==='fp')&&!(key in errors))errors[key]={time:sim.C.time,result,phase:a.phase,from:trace.at(-37).t,to:trace.at(-1).t};
    }
    decisions.push({time:sim.C.time,phase:a.phase,signals:a.signals,reference:[...gold]});windows++;
  }
  await writeFile(path.join(output,scene+'-'+seed+'.json'),JSON.stringify({config,steps:sim.C.time-simStart,windows,scores,labels,errors,decisions}));
  console.log(scene,seed,windows);
}
