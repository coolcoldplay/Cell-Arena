import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const target=process.argv[2]||'dist/index.html',out='output/immune-recovery/browser-'+(target.startsWith('http')?'live':'local');await mkdir(out,{recursive:true});
const b=await openBrowser(target,9427,{gpu:true}),checks=[];
const check=(name,passed,details={})=>{checks.push({name,passed:!!passed,...details});assert.ok(passed,name);};
const wait=async e=>{for(let i=0;i<300;i++){if(await b.evaluate(e))return;await delay(100);}throw Error('Timed out: '+e);};
const input=async(id,value)=>{await b.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(100);};
const shot=async name=>{const p=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(p.data,'base64'));};
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await input('language','zh');
  await b.evaluate('(async()=>{await artistooLab.rpc("playing",{value:false});await artistooLab.rpc("start",{scene:"empty",worldWidth:96,worldHeight:72,refinement:1,warmup:0,settings:{metabolism:0,apoptosis:0,growth:0,immuneGrowth:0,immuneMotility:0,damagePolarization:5,immuneRegulationMemory:100,suppressionRecovery:0,chemotaxis:3,noise:0}});for(const [x,y]of [[25,30],[50,30],[25,50],[50,50]])await artistooLab.rpc("seed",{kind:3,x,y});await artistooLab.rpc("source",{x:38,y:36,type:"normalDamage",radius:30});document.querySelector("#clear-overlays").click();})()');
  await b.evaluate('artistooLab.rpc("advance",{steps:3000})');
  check('Sustained injury creates four blue cells',await b.evaluate('artistooLab.snapshot.cells.length===4&&artistooLab.snapshot.cells.every(m=>m.immunePhenotype==="suppressive")'));
  await b.evaluate('(async()=>{await artistooLab.rpc("source",{erase:true,x:38,y:36,radius:30});await artistooLab.rpc("set",{name:"halfLife",value:40});await artistooLab.rpc("source",{x:10,y:38,type:"normalDamage",radius:8});await artistooLab.rpc("source",{x:85,y:38,type:"trail",radius:8});await artistooLab.rpc("advance",{steps:600});})()');
  const before=await b.evaluate('artistooLab.snapshot.cells.map(m=>({birth:m.birth,x:m.nucleusX,y:m.nucleusY}))');
  await input('immuneMotility',1.4);await b.evaluate('artistooLab.rpc("advance",{steps:500})');
  const after=await b.evaluate('artistooLab.snapshot.cells'),dx=after.reduce((n,m)=>n+m.nucleusX-before.find(a=>a.birth===m.birth).x,0)/after.length;
  check('Actual blue nuclei migrate toward normal injury despite opposing recruitment',dx<-3&&after.every(m=>m.immunePhenotype==='suppressive'),{meanDisplacementX:dx});await shot('blue-injury-migration');
  await input('immuneMotility',0);await b.evaluate('(async()=>{await artistooLab.rpc("source",{erase:true,x:10,y:38,radius:10});await artistooLab.rpc("source",{erase:true,x:85,y:38,radius:10});await artistooLab.rpc("advance",{steps:1000});})()');
  check('Zero recovery preserves blue cells after the injury source disappears',await b.evaluate('artistooLab.snapshot.cells.every(m=>m.immunePhenotype==="suppressive"&&m.normalDamageExposure<.05)&&artistooLab.snapshot.counters.suppressiveRecoveries===0'));
  await input('suppressionRecovery',5);await b.evaluate('artistooLab.rpc("advance",{steps:2000})');
  check('Turning recovery on returns actual blue cells to resting pink',await b.evaluate('artistooLab.snapshot.cells.every(m=>m.immunePhenotype==="cytotoxic"&&m.activation===0)&&artistooLab.snapshot.counters.suppressiveRecoveries===4&&document.querySelector("#suppressive-immune-count").textContent==="0"'));
  check('Recovered bodies use resting pink in the renderer',await b.evaluate('artistooLab.snapshot.cells.every(m=>CellLabDisplay.bodyColor(m).join() === "233,154,154")'));
  await input('suppressionRecovery',2.5);const saved=await b.evaluate('artistooLab.exportData()');check('Recovery settings and event counters export',saved.settings.suppressionRecovery===2.5&&saved.counters.suppressiveRecoveries===4&&saved.events.some(e=>e.type==='immune-recovery'));
  await input('language','en');const text=await b.evaluate('document.querySelector("#immune-regulation-controls").textContent+document.querySelector("#immune-regulation-events").textContent');check('Recovery controls and counters have complete English text',!/[\p{Script=Han}]/u.test(text));
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);await b.evaluate('document.querySelector("[data-module=module-immune]").click();document.querySelector("#immune-regulation-controls").open=true;');await delay(500);await b.evaluate('document.querySelector("#suppressionRecovery").scrollIntoView({block:"center",behavior:"instant"})');await delay(100);
  const pos=await b.evaluate('(()=>{const r=document.querySelector("#suppressionRecovery-increase").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
  check('Mobile recovery control is visible without horizontal overflow',pos.y>300&&pos.y<844&&await b.evaluate('document.documentElement.scrollWidth<=392'));
  for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...pos,button:'left',clickCount:1});await wait('artistooLab.snapshot.settings.suppressionRecovery===2.6');await shot('mobile-recovery');
  await b.evaluate('artistooLab.importData('+JSON.stringify(saved)+')');check('Import restores recovery speed and pauses',await b.evaluate('artistooLab.snapshot.settings.suppressionRecovery===2.5&&!artistooLab.snapshot.playing'));
  await b.evaluate('(async()=>{await artistooLab.rpc("start",{scene:"empty",worldWidth:96,worldHeight:72,refinement:1,warmup:0,settings:{metabolism:0,growth:0,apoptosis:0,antigen:0,mutation:0,tumorMutationGain:0,antigenStressGain:0}});await artistooLab.rpc("seed",{kind:2,x:45,y:36});await artistooLab.rpc("seed",{kind:3,x:60,y:36});await artistooLab.rpc("advance",{steps:200});})()');
  check('Antigen-negative tumor produces no moving alarm, recognition or recruitment in the live Worker',await b.evaluate('artistooLab.snapshot.counters.recognitions===0&&artistooLab.snapshot.fields.danger.values.every(v=>v===0)&&artistooLab.snapshot.fields.trail.values.every(v=>v===0)&&artistooLab.snapshot.cells.filter(m=>m.kind===3).every(m=>m.targetID===0)'));
  check('No browser or Worker errors',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'));
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
