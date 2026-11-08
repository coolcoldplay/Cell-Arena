import {openBrowser,delay} from './browser-session.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const out='output/immune-stalling/browser';await mkdir(out,{recursive:true});
const b=await openBrowser('dist/artistoo-playground.html',9387,{gpu:true}),{evaluate,call}=b,checks=[];
const check=(ok,name,details={})=>{checks.push({name,passed:!!ok,...details});if(!ok)throw Error(name);};
try{
  for(let n=0;n<150;n++){if(await evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await evaluate(`(async()=>{await artistooLab.rpc('playing',{value:false});await artistooLab.rpc('start',{scene:'hot',seed:17,settings:{antigen:0,growth:2,metabolism:0,apoptosis:0,immuneMotility:1.5,immuneGrowth:0,immuneDivisions:0}});await artistooLab.rpc('advance',{steps:2000});})()`);
  const capture='(()=>{const s=artistooLab.snapshot;return {cells:s.cells,refinement:s.refinement,counters:s.counters,orphans:s.orphans,kernel:s.kernel,coverage:s.grid.reduce((n,id)=>n+(id>0),0)/s.grid.length};})()';
  const before=await evaluate(capture);
  await evaluate('artistooLab.rpc("advance",{steps:250})');const after=await evaluate(capture);
  const immune=after.cells.filter(c=>c.kind===3),previous=new Map(before.cells.map(c=>[c.id,c]));
  const tracks=immune.map(c=>{const p=previous.get(c.id);return {id:c.id,fitness:c.fitness,phase:c.phase,divisionsLeft:c.divisionsLeft,displacement:Math.hypot(c.nucleusX-p.nucleusX,c.nucleusY-p.nucleusY)/after.refinement};});
  const coverage=after.coverage,moving=tracks.filter(t=>t.displacement>1).length;
  check(coverage>.9&&immune.length===18&&tracks.every(t=>t.fitness>.99&&t.divisionsLeft===0),'Healthy, lineage-exhausted immune cells are tested in actual confluent tissue',{coverage,tracks});
  check(moving>=9,'Most immune nuclei continue moving within the confluent sheet',{moving,total:immune.length});
  check(after.counters.kills===0&&after.counters.environment===0&&after.counters.apoptosis===0&&after.orphans===0,'Motion does not rely on killing, cell removal or missing bodies');
  check(after.kernel==='wasm'&&await evaluate('artistooLab.renderer.gpu'),'Real worker WASM mechanics and GPU display remain active');
  await evaluate(`document.getElementById('clear-overlays').click();artistooLab.render();`);
  const png=await evaluate('document.getElementById("world").toDataURL("image/png").split(",")[1]');await writeFile(out+'/confluent-patrol.png',Buffer.from(png,'base64'));
  check(b.errors.length===0&&(await evaluate('artistooLab.errors.length'))===0,'No browser or worker errors');check(b.requests.length===0,'No network dependencies');
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));await writeFile(out+'/tested-manifest.json',await readFile('dist/manifest.json'));console.log(JSON.stringify(checks,null,2));await b.close();}
