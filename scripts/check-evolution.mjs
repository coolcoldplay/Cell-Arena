import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const target=process.argv[2]||'dist/index.html',out='output/evolution/browser-'+(target.startsWith('http')?'live':'local');await mkdir(out,{recursive:true});
const b=await openBrowser(target,9423,{gpu:true}),checks=[];
const check=(name,passed,details={})=>{checks.push({name,passed:!!passed,...details});assert.ok(passed,name);};
const wait=async e=>{for(let i=0;i<200;i++){if(await b.evaluate(e))return;await delay(100);}throw Error('Timed out: '+e);};
const input=async(id,value)=>{await b.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(100);};
const shot=async name=>{const p=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(p.data,'base64'));};
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await input('language','zh');
  await b.evaluate('(async()=>{await artistooLab.rpc("playing",{value:false});await artistooLab.rpc("start",{scene:"empty",worldWidth:128,worldHeight:96,refinement:1,warmup:0,settings:{metabolism:0,apoptosis:0}});await artistooLab.rpc("seed",{kind:2,x:64,y:48});})()');
  const values={normalMutationGain:7.5,tumorMutationGain:5.5,mutationBias:-35,antigenStressGain:1.25,contactEscape:.45,signalEscape:.3,evolutionMemory:1300};
  for(const [key,value]of Object.entries(values))await input(key,value);
  check('All evolution sliders update actual Worker settings while paused',await b.evaluate(`artistooLab.snapshot.time===0&&Object.entries(${JSON.stringify(values)}).every(([k,v])=>artistooLab.snapshot.settings[k]===v)`));
  check('Signed percentage uses a readout rather than a text entry',await b.evaluate('!document.querySelector("#mutationBias-number")&&document.querySelector("#mutationBias-out").textContent==="-35%"'));
  await b.evaluate('document.querySelector("[data-tool=inspect]").click()');
  const point=await b.evaluate('(()=>{const s=artistooLab.snapshot,m=s.cells[0],r=document.querySelector("#world").getBoundingClientRect();return{x:r.x+(m.nucleusX+.5)/s.width*r.width,y:r.y+(m.nucleusY+.5)/s.height*r.height}})()');
  for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});await delay(150);
  check('Selected tumor shows local pressure and encounter diagnostics',await b.evaluate('document.querySelector("#inspection").textContent.includes("环境致变压力")&&document.querySelector("#inspection").textContent.includes("有效免疫接触")'));
  const exported=await b.evaluate('artistooLab.exportData()');check('Export carries settings, counters and per-cell diagnostics',exported.settings.mutationBias===-35&&exported.counters.antigenEscapes===0&&exported.cells[0].immuneEncounters===0);
  await input('language','en');await delay(150);
  const text=await b.evaluate('({details:document.querySelector("#inspection").textContent,stats:document.querySelector("#evolution-events").textContent,controls:document.querySelector("#tumor-evolution-controls").textContent+document.querySelector("#evolution-controls").textContent})');
  check('New controls, diagnostics and counters translate completely',!/[\p{Script=Han}]/u.test(Object.values(text).join('')),text);
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
  await b.evaluate('document.querySelector("[data-module=module-tumor]").click();document.querySelector("#tumor-evolution-controls").open=true;');await delay(500);
  await b.evaluate('document.querySelector("#contactEscape").scrollIntoView({block:"center",behavior:"instant"});');await delay(100);
  check('New mobile control group is visible and fits without horizontal overflow',await b.evaluate('(()=>{const r=document.querySelector("#contactEscape").getBoundingClientRect();return document.documentElement.scrollWidth<=392&&r.right<=392&&r.width>100&&r.top>310&&r.bottom<844;})()'));
  const plus=await b.evaluate('(()=>{const r=document.querySelector("#contactEscape-increase").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
  for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...plus,button:'left',clickCount:1});await wait('artistooLab.snapshot.settings.contactEscape===.5');
  check('Visible mobile increment button changes the model',await b.evaluate('artistooLab.snapshot.settings.contactEscape===.5'));await shot('mobile-evolution');
  await b.evaluate('artistooLab.importData('+JSON.stringify(exported)+')');check('Import restores all new settings as a fresh paused run',await b.evaluate(`!artistooLab.snapshot.playing&&artistooLab.snapshot.time===0&&Object.entries(${JSON.stringify(values)}).every(([k,v])=>artistooLab.snapshot.settings[k]===v)`));
  check('No browser or Worker errors',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'));
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
