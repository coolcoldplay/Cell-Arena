import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
for(const mode of (process.argv[2]?[process.argv[2]]:['immune','tumor','repair'])){
 const s=new CellLab.Simulation({width:110,height:90,scene:'empty',warmup:0,seed:Number(process.argv[3]||31),vessels:[{x:50,y:45,radius:11}],settings:{vesselImmuneRate:0,vesselLifespan:0,normalRepair:0,apoptosis:0,vesselPassage:3,tumorIntravasation:3,vesselRepair:1,metabolism:.3,growth:0,immuneGrowth:0}});await CellLabWasm.install(s,module);const v=s.vascular.vessels[0];let id;
 if(mode==='immune'){id=s.vascular.enter(v);s.addSource(78,45,'trail',12);}
 if(mode==='tumor'){id=s.seed(2,76,45,7);s.cells[id].genome.invasion=2.8;s.updateMechanics(s.cells[id]);}
 if(mode==='repair'){id=v.cells[0];for(const dead of v.cells.slice(0,3))s.beginDeath(dead,'environment');}
 for(let t=0;t<2400;t+=400){s.advance(400);const m=s.cells[id];console.log(JSON.stringify({mode,time:s.C.time,cell:m?{x:m.x,y:m.y,phase:m.vascularPhase,area:s.C.getVolume(id),contact:m.vascularContact,repair:m.repairProgress}:null,vessel:{coverage:v.coverage,perfusion:v.perfusion,radius:v.radius,endothelial:v.cells.length},arrivals:s.counters.vascularArrivals,extravasation:s.counters.extravasations,intravasation:s.counters.intravasations,exports:s.counters.bloodstreamExports,repair:s.counters.endothelialDivisions}));}
}
