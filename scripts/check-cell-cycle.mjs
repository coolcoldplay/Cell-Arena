import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/cell-cycle/browser';await mkdir(out,{recursive:true});
const b=await openBrowser(process.argv[2]||'dist/index.html',9416,{gpu:true}),checks=[];
const check=(name,passed,details={})=>{checks.push({name,passed:!!passed,...details});assert.ok(passed,name);};
const wait=async expression=>{for(let i=0;i<200;i++){if(await b.evaluate(expression))return;await delay(100);}throw Error('Timed out: '+expression);};
const click=async selector=>{const p=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let d=e.parentElement;d;d=d.parentElement)if(d.tagName==='DETAILS')d.open=true;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});await delay(100);};
const input=async(id,value)=>{await b.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(100);};
const shot=async name=>{const result=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(result.data,'base64'));};
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await input('language','zh');
  await b.evaluate('(async()=>{await artistooLab.rpc("playing",{value:false});await artistooLab.rpc("start",{scene:"empty",worldWidth:192,worldHeight:144,refinement:1,warmup:0,settings:{apoptosis:0,metabolism:0,immuneGrowth:1}});await artistooLab.rpc("seed",{kind:3,x:70,y:72});await artistooLab.rpc("seed",{kind:2,x:140,y:72});})()');
  check('WASM model starts with separate cycle and IL-2 fields',await b.evaluate('artistooLab.snapshot.kernel==="wasm"&&!!artistooLab.snapshot.fields.il2&&artistooLab.snapshot.cells.every(c=>c.cycle.phase==="G0")'));
  await input('immuneCycle',400);await input('antigenMemory',1500);await input('il2HalfLife',240);
  check('Cycle controls update the Worker without resetting the run',await b.evaluate('artistooLab.snapshot.settings.immuneCycle===400&&artistooLab.snapshot.settings.antigenMemory===1500&&artistooLab.snapshot.settings.il2HalfLife===240&&artistooLab.snapshot.cells.length===2'));
  await b.evaluate('artistooLab.rpc("source",{x:70,y:72,type:"il2",radius:12})');await click('[data-layer="il2"]');await input('opacity-il2',80);
  check('IL-2 source and independent overlay are available',await b.evaluate('artistooLab.snapshot.sources.some(s=>s.type==="il2")&&document.querySelector("[data-layer=il2]").getAttribute("aria-pressed")==="true"&&document.querySelector("#opacity-il2-out").textContent==="80%"'));
  await b.evaluate('artistooLab.rpc("advance",{steps:160})');await click('[data-tool="inspect"]');
  const p=await b.evaluate('(()=>{const s=artistooLab.snapshot,m=s.cells.find(c=>c.kind===3),r=document.querySelector("#world").getBoundingClientRect();return{x:r.x+(m.nucleusX+.5)/s.width*r.width,y:r.y+(m.nucleusY+.5)/s.height*r.height}})()');
  for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});await delay(150);
  check('Selected CTL explains why IL-2 alone does not start a cycle',await b.evaluate('document.querySelector("#inspection").textContent.includes("细胞周期 G0")&&document.querySelector("#inspection").textContent.includes("抗原记忆不足")&&document.querySelector("#inspection").textContent.includes("局部 IL-2")'));
  await shot('desktop-cycle');const exported=await b.evaluate('artistooLab.exportData()');
  check('Export preserves cycle diagnostics, parameter values and IL-2 overlay',exported.cycles.immune.G0===1&&exported.settings.immuneCycle===400&&exported.sources[0].type==='il2'&&exported.display.opacity.il2===.8&&exported.cells[0].cycle);
  await input('language','en');await delay(120);
  const english=await b.evaluate('({details:document.querySelector("#inspection").textContent,stats:document.querySelector(".cycle-summary").textContent})');
  check('Cycle state and reasons translate to English',!/\p{Script=Han}/u.test(english.details+english.stats)&&english.details.includes('Cell cycle G0'),english);
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);await click('[data-module="module-immune"]');
  await b.evaluate('document.querySelector("#immune-cycle-controls").open=true;document.querySelector("#immuneCycle").scrollIntoView({block:"center"})');await delay(100);
  check('Mobile cycle controls fit the panel',await b.evaluate('document.documentElement.scrollWidth<=391&&document.querySelector("#immuneCycle").getBoundingClientRect().right<=391'));
  await input('immuneCycle',420);check('Mobile cycle slider is usable',await b.evaluate('artistooLab.snapshot.settings.immuneCycle===420'));await shot('mobile-cycle');
  await b.evaluate('artistooLab.importData('+JSON.stringify(exported)+')');
  check('Import restores new parameters and persistent IL-2 source as a new paused run',await b.evaluate('artistooLab.snapshot.settings.immuneCycle===400&&artistooLab.snapshot.sources[0].type==="il2"&&artistooLab.snapshot.time===0&&!artistooLab.snapshot.playing'));
  check('No runtime or Worker errors and no analytics on local build',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0')&&b.requests.length===0);
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
