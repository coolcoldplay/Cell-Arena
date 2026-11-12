// Small, controlled CPM follow-up to code-space calibration; not a clinical fit.
import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const wasm=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),runs=[];
for(const length of [4,6,8])for(const seed of [17,31]){
 const settings={...CellLab.DEFAULTS,antigenLength:length,initialImmuneReady:100,supply:3,metabolism:.25,normalRepair:0,apoptosis:3,growth:.7,tumorCycle:220,immuneGrowth:.4,mutation:8,stressMutation:0,inflammation:0,progression:0,checkpointStrength:.4,damagePolarization:0,damageDeactivation:0,immuneKillLimit:20,primingRate:2.5,vesselImmuneRate:2,vesselDependence:0,vesselCount:0};
 const precursor=new CellLab.Simulation({scene:'empty',worldWidth:144,worldHeight:108,refinement:1,seed,warmup:0,settings}),sys=precursor.immunity,a=sys.repertoire[0],b=sys.repertoire.find(r=>r.channel===a.channel&&CellLabImmunity.affinity(r.sequence,a.sequence)<.7);
 const genes=(r,immune=false)=>({peptides:sys.self.map((code,i)=>({sequence:i?code:r.sequence,channel:i?i%2:r.channel,present:true,base:.9,stress:0,inflammation:0})),presentation:[1,1],brake:{base:.08,response:.3},surface:[{sequence:sys.self[0],present:true,base:.6},{sequence:sys.self[1],present:true,base:.7}],traits:{tolerance:1.3,proliferation:1,invasion:1,repair:1,antigen:.9},receptor:immune?{sequence:r.sequence,channel:r.channel}:null});
 const cell=(kind,x,y,r,cloneKey)=>({kind,x,y,radius:kind===3?4:7,genes:genes(r,kind===3),primed:kind===3,cloneKey});
 const recipe={format:'cell-arena-experiment',schemaVersion:2,modelRevision:CellLab.MODEL_REVISION,scene:'empty',seed,worldWidth:144,worldHeight:108,refinement:1,warmup:0,boundary:'solid',settings,initialCells:[cell(2,65,37,a,'susceptible'),cell(2,83,37,a,'susceptible'),cell(2,65,57,b,'divergent'),cell(2,83,57,b,'divergent'),cell(3,52,37,a,'ctl'),cell(3,96,37,a,'ctl')],vessels:[{x:28,y:78,radius:10}],sources:[{type:'trail',x:73,y:47,radius:16}]};
 const s=new CellLab.Simulation(CellLabExperiment.parse(recipe).config);await CellLabWasm.install(s,wasm);
 const run={length,seed,samples:[]};for(const time of [0,500,1500,4000]){
  s.advance(time-s.C.time);const tumor=s.live().filter(c=>c.kind===2&&!c.dying),counts={};for(const c of tumor)counts[c.geneClone]=(counts[c.geneClone]||0)+1;
  run.samples.push({time,tumor:tumor.length,immune:s.live().filter(c=>c.kind===3&&!c.dying).length,kills:s.counters.kills,divisions:s.counters.divisions,clones:counts,metrics:{...s.immunity.metrics}});
 }runs.push(run);console.log(JSON.stringify({length,seed,trajectory:run.samples.map(x=>[x.time,x.tumor,x.immune,x.kills,x.metrics.reinforcements])}));
 await writeFile('reports/immune-genetics/length-tissue.json',JSON.stringify({protocol:'Fixed 4 tumor + 2 immune starting cells, same positions and regulatory parameters, 2 pre-existing tumor variants, finite repertoire and one vessel. 8% single daughter mutation opportunity for every sequence length; no per-base scaling. 2 seeds only, descriptive comparison, not outcome guarantees.',runs},null,2));
}
