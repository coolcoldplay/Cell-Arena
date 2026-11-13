import vm from 'node:vm';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
const files=['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'],hashes={};
for(const f of files){const text=await readFile(f,'utf8');hashes[f]=createHash('sha256').update(text).digest('hex');vm.runInThisContext(text,{filename:f});}
const wasm=await readFile('build/cpm-kernel.wasm');hashes['build/cpm-kernel.wasm']=createHash('sha256').update(wasm).digest('hex');const module=await CellLabWasm.load(wasm);
const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'output/local-vascular-final';await mkdir(out,{recursive:true});
const mode=process.argv.find(x=>x.startsWith('--mode='))?.slice(7)||'all';
const cases=[];
if(mode!=='native')for(const fraction of [0,.5,1])cases.push({name:'controlled-'+fraction,fraction,dense:false});
if(mode!=='native')cases.push({name:'controlled-dense',fraction:0,dense:true});
if(mode!=='controlled')for(const seed of [17,31,77])cases.push({name:'onset-'+seed,seed,native:true});
if(mode!=='controlled')cases.push({name:'random-17',seed:17,native:true,scene:'random'});
for(const spec of cases){
 const config=spec.native?{worldWidth:240,worldHeight:180,refinement:1.5,scene:spec.scene||'oncogenesis',seed:spec.seed,warmup:35}:{worldWidth:160,worldHeight:128,refinement:1,scene:spec.dense?'oncogenesis':'empty',seed:17,warmup:0,vessels:[],settings:{metabolism:.25,supply:3,apoptosis:0,vesselLifespan:0,vesselImmuneRate:0,vesselDivisions:6,stressMutation:0,progression:0}};
 const s=new CellLab.Simulation(config);await CellLabWasm.install(s,module);let inserted=null;
 if(!spec.native)inserted=s.vascular.initiate(spec.dense?68:80,spec.dense?48:64,{normal:2*(1-spec.fraction),tumor:2*spec.fraction,total:2,fraction:spec.fraction});
 const samples=[],until=spec.native?10000:6000,start=performance.now();
 for(let t=0;t<=until;t+=100){
  if(t){if(!spec.native){s.fields.angiogenicNormal.values.fill(2*(1-spec.fraction));s.fields.angiogenicTumor.values.fill(2*spec.fraction);}s.advance(100);}
  if(t%500===0){const live=s.live().filter(m=>!m.dying),vascular=s.vascular.report(),trappedNormalNuclei=[];
   for(const v of s.vascular.vessels)if(v.active)for(const m of live)if(m.kind===1&&!m.vesselID&&s.vascular.distance(m.nucleusX,m.nucleusY,v)+m.nucleusRadius<v.radius)trappedNormalNuclei.push({cell:m.id,vessel:v.id});
   samples.push({time:s.C.time,vascular,counters:{...s.counters},normal:live.filter(m=>m.kind===1&&!m.vesselID).length,tumor:live.filter(m=>m.kind===2).length,trappedNormalNuclei,valid:live.every(m=>s.components(m.id).length===1&&s.section.fits(m,m.nucleusX,m.nucleusY)),endothelium:live.filter(m=>m.vesselID).map(m=>({id:m.id,vesselID:m.vesselID,birth:m.birth,generation:m.generation,x:m.x,y:m.y,area:s.C.getVolume(m.id),target:m.target,oxygen:m.oxygen,glucose:m.glucose,acid:m.acid,fitness:m.fitness,resources:{...m.resources},cycle:{...m.cycle},function:m.endothelialFunction,tumorFraction:m.endothelialTumorFraction}))});
  }
 }
 const result={revision:CellLab.MODEL_REVISION,hashes,spec,config,settings:s.settings,inserted,elapsedMs:performance.now()-start,samples,events:s.events};
 await writeFile(out+'/'+spec.name+'.json',JSON.stringify(result,null,2)+'\n');const last=samples.at(-1);console.log(JSON.stringify({name:spec.name,time:last.time,sprouts:last.vascular.sprouts,matured:last.vascular.matured,divisions:last.counters.endothelialDivisions,valid:samples.every(x=>x.valid),trapped:Math.max(...samples.map(x=>x.trappedNormalNuclei.length)),vessels:last.vascular.vessels.map(v=>({id:v.id,radius:v.radius,local:v.localOrigin,patency:v.patency,quality:v.quality,nascent:v.nascent}))}));
}
