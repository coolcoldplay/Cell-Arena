import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const target=process.argv[2]||'dist/index.html',out='output/confluent-observation/'+(target.startsWith('http')?'live':'local');await mkdir(out,{recursive:true});
const b=await openBrowser(target,9421,{gpu:true}),checks=[];
const check=(name,passed,details={})=>{checks.push({name,passed:!!passed,...details});assert.ok(passed,name);};
const wait=async e=>{for(let i=0;i<300;i++){if(await b.evaluate(e))return;await delay(100);}throw Error('Timed out: '+e);};
const point=async p=>{for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});await delay(120);};
const click=async selector=>point(await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let d=e.parentElement;d;d=d.parentElement)if(d.tagName==='DETAILS')d.open=true;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`));
const shot=async name=>{const p=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(p.data,'base64'));};
const select=async id=>{await click('[data-tool="inspect"]');await point(await b.evaluate(`(()=>{const s=artistooLab.snapshot,m=s.cells.find(c=>c.id===${id}),r=document.querySelector('#world').getBoundingClientRect();return{x:r.x+(m.nucleusX+.5)/s.width*r.width,y:r.y+(m.nucleusY+.5)/s.height*r.height}})()`));await wait('artistooLab.snapshot.observation?.cells.length>0');};
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');
  await b.evaluate('(()=>{const e=document.querySelector("#language");e.value="zh";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  check('Initial oncogenesis has no default Act',await b.evaluate('!document.querySelector("#immune-activity").checked&&!document.querySelector("#normal-activity").checked&&!document.querySelector("#tumor-activity").checked'));
  for(const scene of ['hot','cold','maze','hot','cold','oncogenesis','empty']){
    await click(`[data-scene="${scene}"]`);await wait(`artistooLab.snapshot.scene===${JSON.stringify(scene)}`);await b.evaluate('artistooLab.rpc("playing",{value:false})');
    const data=await b.evaluate('({scene:artistooLab.snapshot.scene,act:document.querySelector("#edge-activity").checked&&document.querySelector("#immune-activity").checked,filled:artistooLab.snapshot.grid.reduce((n,id)=>n+(id>0),0)/artistooLab.snapshot.grid.length,initial:artistooLab.snapshot.scenario?.initial})');
    check('Act defaults reset when switching to '+scene,data.act===(scene==='maze'),data);
    if(['cold','hot','oncogenesis'].includes(scene))check(scene+' opens with continuous tissue',data.filled>.96&&data.initial.normal>70,data);
    if(scene==='cold'||scene==='hot')await shot(scene+'-initial');
  }
  await b.evaluate('(async()=>{await artistooLab.rpc("start",{scene:"empty",worldWidth:128,worldHeight:96,refinement:1,warmup:0,settings:{growth:0,metabolism:0,apoptosis:0}});await artistooLab.rpc("seed",{kind:1,x:60,y:48});await artistooLab.rpc("advance",{steps:180});const e=document.querySelector("#view-fit");e.value="contain";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await select(1);const root=await b.evaluate('artistooLab.snapshot.cells[0].birth');
  await b.evaluate(`window.frameOps=()=>{const c=document.querySelector('#world').getContext('2d'),stroke=c.stroke,fill=c.fillText,colors=[],labels=[];c.stroke=function(...args){if(['#37e3dc','#ffba52','#cb8cff'].includes(this.strokeStyle))colors.push(this.strokeStyle);return stroke.apply(this,args);};c.fillText=function(text,...args){if(/^[0-9]+$/.test(text))labels.push(String(text));return fill.call(this,text,...args);};try{artistooLab.render();return{colors,labels};}finally{c.stroke=stroke;c.fillText=fill;}}`);
  check('Selected founder has its cyan frame',await b.evaluate('frameOps().colors.includes("#37e3dc")'));
  const sibling=await b.evaluate('artistooLab.rpc("divide",{id:1})');check('Real first division succeeds',sibling>1);
  const first=await b.evaluate('({family:artistooLab.snapshot.observation,draw:frameOps()})');
  check('Both daughters receive orange corners and generation 1 labels',first.family.rootBirth===root&&first.family.cells.length===2&&first.draw.colors.filter(c=>c==='#ffba52').length===2&&first.draw.labels.filter(v=>v==='1').length===2,first);await shot('generation-1');
  const grandchild=await b.evaluate('artistooLab.rpc("divide",{id:1})');check('Real second division succeeds',grandchild>1);
  const second=await b.evaluate('({family:artistooLab.snapshot.observation,draw:frameOps(),details:document.querySelector("#inspection").textContent})');
  check('Grandchildren stay tracked with generation 2 and a different color',second.family.cells.length===3&&second.draw.colors.filter(c=>c==='#cb8cff').length===2&&second.draw.labels.filter(v=>v==='2').length===2&&second.draw.labels.includes('1'),second);await shot('generation-2');
  await b.evaluate('artistooLab.rpc("advance",{steps:100})');check('Family persists while cells move',await b.evaluate('artistooLab.snapshot.observation.cells.length===3&&frameOps().labels.length===3'));
  await b.evaluate('(()=>{const e=document.querySelector("#language");e.value="en";e.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(100);
  check('Relative generation is explained in English',await b.evaluate('document.querySelector("#inspection").textContent.includes("Observed family: relative generation 2")'));
  await select(sibling);check('Clicking a daughter starts a new observation root',await b.evaluate(`artistooLab.snapshot.observation.cells.length===1&&artistooLab.snapshot.observation.rootID===${sibling}&&frameOps().colors.includes('#37e3dc')`));
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(100);await shot('mobile-family');
  check('Mobile panel stays inside viewport',await b.evaluate('document.documentElement.scrollWidth<=392'));
  await click('[data-scene="empty"]');await wait('artistooLab.snapshot.cells.length===0');check('Restart clears family tracking',await b.evaluate('artistooLab.snapshot.observation===null&&artistooLab.selected===0'));
  check('No browser or Worker errors',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'));
}catch(e){checks.push({name:'failure',passed:false,error:String(e)});console.error(e);process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
