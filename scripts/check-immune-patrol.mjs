import {openBrowser,delay} from './browser-session.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

const output='output/immune-patrol';
await mkdir(output,{recursive:true});
const b=await openBrowser('dist/artistoo-playground.html',9383,{gpu:true});
const {evaluate,call}=b,checks=[];
const check=(ok,name,detail={})=>{checks.push({name,passed:!!ok,...detail});if(!ok)throw Error(name+' '+JSON.stringify(detail));};
const press=async p=>{for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});await delay(80);};
const click=async selector=>{const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await press(p);};
const inspectImmune=async()=>{
  await click('[data-tool="inspect"]');
  const p=await evaluate(`(()=>{const m=artistooLab.snapshot.cells.find(c=>c.kind===3),s=artistooLab.snapshot,c=document.getElementById('world'),v=c.parentElement,x=m.nucleusX,y=m.nucleusY;v.scrollIntoView({block:'center'});v.scrollLeft=(x+.5)/s.width*c.clientWidth-v.clientWidth/2;v.scrollTop=(y+.5)/s.height*c.clientHeight-v.clientHeight/2;const r=c.getBoundingClientRect();return {x:r.left+(x+.5)/s.width*r.width,y:r.top+(y+.5)/s.height*r.height};})()`);
  await press(p);
};
const shot=async name=>{const data=await call('Page.captureScreenshot',{format:'png'});await writeFile(output+'/'+name+'.png',Buffer.from(data.data,'base64'));};
const fixture=async()=>evaluate(`(async()=>{await artistooLab.rpc('start',{scene:'empty',width:96,height:72,warmup:0,settings:{metabolism:0,immuneGrowth:0,growth:0,apoptosis:0}});await artistooLab.rpc('seed',{kind:3,x:24,y:24});await artistooLab.rpc('advance',{steps:8});})()`);
try{
  for(let i=0;i<150;i++){if(await evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await evaluate('artistooLab.rpc("playing",{value:false})');
  check(await evaluate('artistooLab.snapshot.kernel==="wasm"&&artistooLab.renderer.gpu&&!artistooLab.renderer.error'),'WASM mechanics and GPU display remain active',await evaluate('({kernel:artistooLab.snapshot.kernel,renderer:artistooLab.renderer})'));
  check(await evaluate('document.querySelectorAll("aside details.section").length===9&&document.querySelectorAll("aside details[open]").length===0'),'All nine parameter groups start collapsed');
  await click('#module-communication > summary');
  check(await evaluate('document.getElementById("module-communication").open&&document.getElementById("immuneSeparation").checkVisibility()&&document.getElementById("immuneSeparation").value==="1"'),'Independent immune separation slider is accessible with default 1');
  const old=await evaluate('({repulsion:artistooLab.snapshot.settings.repulsion,alignment:artistooLab.snapshot.settings.alignment})');
  await evaluate(`document.getElementById('immuneSeparation').value='2.3';document.getElementById('immuneSeparation').dispatchEvent(new Event('input',{bubbles:true}));artistooLab.rpc('snapshot')`);
  const edited=await evaluate('artistooLab.snapshot.settings');
  check(edited.immuneSeparation===2.3&&edited.repulsion===old.repulsion&&edited.alignment===old.alignment,'Slider updates only immune separation through the worker',{before:old,after:{immuneSeparation:edited.immuneSeparation,repulsion:edited.repulsion,alignment:edited.alignment}});
  await fixture();await inspectImmune();
  check(await evaluate('document.getElementById("inspection").textContent.includes("分散巡逻")&&artistooLab.snapshot.cells[0].immuneCue===0'),'Signal-free immune inspector displays dispersed patrol');
  check(await evaluate('artistooLab.snapshot.counters.recognitions===0&&artistooLab.snapshot.cells[0].recruitment===0&&artistooLab.snapshot.cells[0].activation===0'),'Patrol alone does not activate or recruit');
  await shot('patrol-controls');
  for(const channel of ['danger','trail']){
    await fixture();
    await evaluate(`(async()=>{const c=artistooLab.snapshot.cells[0];await artistooLab.rpc('pulse',{channel:'${channel}',x:c.x+7,y:c.y});await artistooLab.rpc('advance',{steps:12});})()`);
    await inspectImmune();
    const response=await evaluate('({cell:artistooLab.snapshot.cells[0],recognitions:artistooLab.snapshot.counters.recognitions,text:document.getElementById("inspection").textContent})');
    check(response.cell.immuneCue>.05&&response.text.includes('局部趋化'),'Local '+channel+' signal updates chemotaxis state',{cue:response.cell.immuneCue});
    check(response.recognitions===0&&response.cell.recruitment===0&&response.cell.activation===0,'External '+channel+' signal does not confer recognition or secretion');
  }
  const exported=await evaluate('artistooLab.rpc("export")');
  check(exported.settings.immuneSeparation===1&&exported.cells.every(c=>Number.isFinite(c.immuneCue)),'Export retains independent control and local cue state');
  await click('[data-layer="trail"]');await shot('local-chemotaxis');
  check(b.errors.length===0&&(await evaluate('artistooLab.errors.length'))===0,'No browser or worker runtime exceptions');
  check(b.requests.length===0,'Standalone simulation needs no remote requests');
}catch(e){checks.push({passed:false,error:String(e)});console.error(e);process.exitCode=1;await shot('failure');}
finally{
  await writeFile(output+'/browser-checks.json',JSON.stringify(checks,null,2));
  await writeFile(output+'/tested-manifest.json',await readFile('dist/manifest.json'));
  console.log(JSON.stringify(checks,null,2));await b.close();
}
