import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/vascular';await mkdir(out,{recursive:true});
const b=await openBrowser(process.argv[2]||'dist/index.html',9463,{gpu:true}),checks=[];
const check=(name,ok,details={})=>{checks.push({name,passed:!!ok,...details});assert.ok(ok,name);};
const wait=async expression=>{for(let i=0;i<200;i++){if(await b.evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression);};
const screenshot=async name=>{const shot=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(shot.data,'base64'));};
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');
  check('Default scenario has real vascular populations',await b.evaluate('artistooLab.snapshot.vascular.functional===2&&artistooLab.snapshot.cells.filter(c=>c.vesselID).length>=12'));
  check('WebGL2 renderer accepts nine body colors',await b.evaluate('artistooLab.renderer.gpu&&!artistooLab.renderer.error'));
  await b.evaluate('document.querySelector("[data-panel=parameter-groups]").click();document.getElementById("vascular-controls").open=true');
  check('Vascular controls are usable and independently lockable',await b.evaluate('document.getElementById("vesselSupply").checkVisibility()&&document.getElementById("vesselSupply").closest(".model-slider").querySelector(".parameter-lock")!==null'));
  await screenshot('vascular-controls');
  await b.evaluate(`(async()=>{await artistooLab.rpc('start',{scene:'empty',worldWidth:128,worldHeight:96,refinement:1.5,warmup:0,seed:31,vessels:[{x:64,y:48,radius:11}],settings:{vesselImmuneRate:3,vesselPassage:3,vesselLifespan:0,metabolism:.3}});await artistooLab.rpc('playing',{value:false});await artistooLab.rpc('source',{type:'trail',x:125,y:72,radius:12});await artistooLab.rpc('advance',{steps:1600});})()`);
  const stats=await b.evaluate('({vascular:artistooLab.snapshot.vascular,counters:artistooLab.snapshot.counters,renderer:artistooLab.renderer})');
  check('Live Worker records actual circulating arrivals and exits',stats.counters.vascularArrivals>0&&stats.counters.extravasations>0,stats);
  const exported=await b.evaluate('artistooLab.exportData()');check('Export preserves world-coordinate vessel geometry and parameters',exported.vessels[0].x===64&&exported.settings.vesselPassage===3);
  await b.evaluate('document.querySelector("[data-panel=statistics-panel]").click()');await delay(200);await screenshot('vascular-statistics');
  check('Vessel statistics and fifth population are visible',await b.evaluate('document.getElementById("endothelial-count").textContent!=="0"&&!document.getElementById("vascular-statistics").hidden'));
  await b.evaluate('document.getElementById("language").click()');await delay(150);
  check('Vascular English statistics contain no Chinese fragments',await b.evaluate('!/[\\p{Script=Han}]/u.test(document.getElementById("vascular-statistics").textContent)'));
  await b.evaluate('document.getElementById("language").click();artistooLab.setTool("inspect")');
  await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:300,y:250});await wait('!document.getElementById("field-probe").hidden');
  for(const [i,tool]of ['move','seed','wall','remove','signal'].entries()){
    check(tool+' immediately hides location information',await b.evaluate(`(()=>{document.querySelector('[data-tool="${tool}"]').click();return document.getElementById('field-probe').hidden;})()`));
    await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:310+i,y:250});await delay(150);
    check(tool+' keeps location information hidden while moving',await b.evaluate('document.getElementById("field-probe").hidden'));
    if(tool==='remove')check('Eraser keeps its brush preview',await b.evaluate('!document.getElementById("brush-preview").hidden'));
    await b.evaluate('document.querySelector("[data-tool=inspect]").click()');
    await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:320+i,y:250});await wait('!document.getElementById("field-probe").hidden');
  }
  await delay(10500);check('Unmoved pointer hides probe after ten seconds',await b.evaluate('document.getElementById("field-probe").hidden'));
  await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:302,y:251});await wait('!document.getElementById("field-probe").hidden');check('Moving restores probe',true);
  await b.evaluate('document.getElementById("arena-fullscreen").click()');await wait('document.body.classList.contains("arena-fullscreen")');
  check('Fullscreen removes sidebar and exit overlay',await b.evaluate('!document.getElementById("fullscreen-exit")&&!document.querySelector("aside").checkVisibility()'));
  await screenshot('fullscreen');await b.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await b.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait('!document.body.classList.contains("arena-fullscreen")');check('Escape restores sidebar',true);
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
  check('Mobile does not overflow horizontally',await b.evaluate('document.documentElement.scrollWidth<=390'));await screenshot('mobile');
  // Test the same field data with both backends, including a partially
  // obstructed lumen and vessel collapse during the integration sequence.
  await b.evaluate((await Promise.all(['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/gpu-fields.js'].map(f=>readFile(f,'utf8')))).join('\n'));
  const parity=await b.evaluate(`(async()=>{const rows=[];for(const boundary of ['solid','wrap']){const options={width:100,height:80,scene:'empty',warmup:0,boundary,vessels:[{x:50,y:40,radius:11}],settings:{vesselImmuneRate:0,vesselDependence:65,normalSupport:40}},a=new CellLab.Simulation(options),c=new CellLab.Simulation(options);for(const s of [a,c]){s.seed(1,15,20,6);for(const k of ['oxygen','glucose','acid'])for(let i=0;i<s.fields[k].values.length;i++)s.fields[k].values[i]=.1+((i*17)%67)/80;s.prepareEnvironment();}const gpu=await CellLabGPU.GPUFields.create(c);let error=0;try{for(let n=0;n<20;n++){if(n===10)for(const s of [a,c]){for(const id of [...s.vascular.vessels[0].cells])s.eraseCell(id);s.vascular.measure(0);s.prepareEnvironment();}a.integrateEnvironment(4);await gpu.step(c,4);for(const k of ['oxygen','glucose','acid'])for(let i=0;i<a.fields[k].values.length;i++)error=Math.max(error,Math.abs(a.fields[k].values[i]-c.fields[k].values[i]));}rows.push({boundary,error,adapter:gpu.adapter});}finally{gpu.destroy();}}return rows;})()`);
  for(const row of parity)check('CPU / WebGPU finite vascular exchange parity '+row.boundary,row.error<2e-5,row);
  check('No browser or Worker errors',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'),{errors:b.errors});
}catch(e){checks.push({passed:false,error:String(e)});console.error(e);process.exitCode=1;}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
