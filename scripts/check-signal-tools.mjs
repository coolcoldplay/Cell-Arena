import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const target=process.argv[2]||'dist/index.html',out='output/signal-tools/'+(target.startsWith('http')?'live':'local');await mkdir(out,{recursive:true});
const b=await openBrowser(target,9455,{gpu:true,initScript:`window.signalCommands=[];const originalPost=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(['pulse','source'].includes(message.command))signalCommands.push(structuredClone(message));return originalPost.call(this,message,...rest);};`}),checks=[];
function check(name,passed,details={}){checks.push({name,passed:!!passed,...details});assert.ok(passed,name+' '+JSON.stringify(details));}
async function wait(expr){for(let i=0;i<250;i++){if(await b.evaluate(expr))return;await delay(100);}throw Error('Timed out: '+expr);}
async function set(id,value,event='change'){await b.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);await delay(40);}
async function mouse(p,down,count=1){await b.call('Input.dispatchMouseEvent',{type:down?'mousePressed':'mouseReleased',...p,button:'left',buttons:down?1:0,clickCount:count});}
async function click(selector){const p=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let a=e.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await mouse(p,true);await mouse(p,false);await delay(100);}
async function arena(x=.5,y=.5){return b.evaluate(`(()=>{const r=document.getElementById('world').getBoundingClientRect();return{x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`);}
async function tap(p){await mouse(p,true);await mouse(p,false);await delay(400);await b.evaluate('artistooLab.rpc("snapshot")');}
async function double(p){await mouse(p,true);await mouse(p,false);await delay(70);await mouse(p,true,2);await mouse(p,false,2);await delay(400);await b.evaluate('artistooLab.rpc("snapshot")');}
async function shot(name){const r=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(r.data,'base64'));}
async function paired(){return b.evaluate(`(()=>{const rect=t=>document.querySelector('[data-tool='+t+']').getBoundingClientRect(),signal=rect('signal'),move=rect('move');return Math.abs(signal.width-move.width)<1&&Math.abs(signal.height-move.height)<1&&[['move','inspect'],['seed','remove'],['wall','erase']].every(([a,b])=>{const x=rect(a),y=rect(b);return Math.abs(x.x-y.x)<1&&y.y>=x.bottom&&Math.abs(x.width-y.width)<1;})&&!document.querySelector('[data-tool=pan]')&&!document.querySelector('[data-tool=source]')&&document.querySelectorAll('[data-tool=signal]').length===1})()`);}
try{
 await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await set('language','zh');await b.evaluate('artistooLab.rpc("playing",{value:false})');
 for(const scene of ['oncogenesis','cold','hot','random']){
  // Dirty prior display preferences must not leak into a fresh preset.
  await b.evaluate(`for(const id of ['nuclei','antigen-marks','cycle-marks'])document.getElementById(id).checked=false;for(const id of ['edge-activity','normal-activity','tumor-activity','immune-activity','show-tracks'])document.getElementById(id).checked=true`);
  await click(scene==='random'?'#shuffle':`[data-scene=${scene}]`);await wait(`artistooLab.snapshot.scene==='${scene}'&&artistooLab.snapshot.speed===3&&artistooLab.snapshot.playing`);await b.evaluate('artistooLab.rpc("playing",{value:false})');
  const data=await b.evaluate('artistooLab.exportData()');
  check(scene+' uses wrap, 3×, nuclei/antigen/cycle, recruitment/adversity, and no Act/tracks',data.boundary==='wrap'&&data.speed===3&&['nuclei','antigen-marks','cycle-marks'].every(k=>data.display.flags[k])&&['edge-activity','normal-activity','tumor-activity','immune-activity','show-tracks'].every(k=>!data.display.flags[k])&&data.display.fieldView==='adversity'&&data.display.signalLayers.length===1&&data.display.signalLayers[0]==='trail');
 }
 check('Complementary tools share columns, with one signal tool and no pan button',await paired());await shot('desktop-defaults');
 await set('boundary','solid');await wait('artistooLab.snapshot.boundary==="solid"');await b.evaluate('artistooLab.rpc("playing",{value:false})');
 await b.evaluate(`document.getElementById('nuclei').checked=false;document.getElementById('field-view').value='acid';artistooLab.rpc('speed',{value:2})`);await click('#reset');await wait('artistooLab.snapshot.scene==="random"');
 check('Restart preserves explicit boundary, markers, layers and speed',await b.evaluate('artistooLab.snapshot.boundary==="solid"&&artistooLab.snapshot.speed===2&&!document.getElementById("nuclei").checked&&document.getElementById("field-view").value==="acid"'));
 await click('[data-scene=maze]');await wait('artistooLab.snapshot.scene==="maze"&&artistooLab.snapshot.speed===1');await b.evaluate('artistooLab.rpc("playing",{value:false})');
 check('Maze retains solid walls and its own immune Act/tracks defaults',await b.evaluate('artistooLab.snapshot.boundary==="solid"&&document.getElementById("edge-activity").checked&&document.getElementById("immune-activity").checked&&document.getElementById("show-tracks").checked'));
 await click('[data-scene=hot]');await wait('artistooLab.snapshot.scene==="hot"&&artistooLab.snapshot.speed===3');await b.evaluate('artistooLab.rpc("playing",{value:false})');
 check('Switching out of maze restores wrap and hides Act/tracks',await b.evaluate('artistooLab.snapshot.boundary==="wrap"&&!document.getElementById("edge-activity").checked&&!document.getElementById("show-tracks").checked'));
 await click('[data-scene=empty]');await wait('artistooLab.snapshot.scene==="empty"&&!artistooLab.snapshot.playing');
 check('Blank dish still starts without normal tissue support coupling',await b.evaluate('artistooLab.snapshot.settings.normalSupport===0'));
 await click('[data-tool=signal]');await set('signal-kind','trail');let p=await arena();await b.evaluate('signalCommands.length=0');await tap(p);
 check('A single click emits one pulse and no permanent source',await b.evaluate('signalCommands.length===1&&signalCommands[0].command==="pulse"&&artistooLab.snapshot.sources.length===0&&artistooLab.snapshot.fields.trail.values.some(v=>v>0)'),await b.evaluate('({commands:signalCommands,sources:artistooLab.snapshot.sources,max:Math.max(...artistooLab.snapshot.fields.trail.values),errors:artistooLab.errors})'));
 await b.evaluate('signalCommands.length=0');await double(p);
 check('Double click creates exactly one source without extra pulses',await b.evaluate('signalCommands.length===1&&signalCommands[0].command==="source"&&artistooLab.snapshot.sources.length===1'));
 await set('signal-kind','acid');p=await arena(.7,.5);await b.evaluate('signalCommands.length=0');await mouse(p,true);await delay(850);await mouse(p,false);await delay(180);const count=await b.evaluate('signalCommands.length');await delay(450);await b.evaluate('artistooLab.rpc("snapshot")');
 check('Holding releases repeatedly and stops on release, without adding a source',count>=2&&await b.evaluate(`signalCommands.length===${count}&&signalCommands.every(c=>c.command==='pulse')&&artistooLab.snapshot.sources.length===1&&artistooLab.snapshot.fields.acid.values.some(v=>v>.6)`));
 await b.evaluate('signalCommands.length=0');await mouse(p,true);await mouse(p,false);await click('[data-tool=inspect]');await delay(400);
 check('Switching tools cancels a pending tap',await b.evaluate('signalCommands.length===0'));
 await click('[data-tool=signal]');await b.evaluate('signalCommands.length=0');await mouse(p,true);await delay(500);await b.evaluate('window.dispatchEvent(new Event("blur"))');const onBlur=await b.evaluate('signalCommands.length');await delay(400);await mouse(p,false);
 check('Losing focus stops a held release',await b.evaluate(`signalCommands.length===${onBlur}`));
 await b.evaluate('signalCommands.length=0');await mouse(p,true);await mouse(p,false);await b.evaluate('document.querySelector("[data-scene=empty]").click()');await wait('artistooLab.snapshot.scene==="empty"&&artistooLab.snapshot.time===0');await delay(500);
 check('Starting another scene cancels delayed writes',await b.evaluate('signalCommands.length===0&&artistooLab.snapshot.sources.length===0'));
 await click('[data-tool=signal]');
 for(const [type,x] of [['oxygen',.3],['glucose',.5],['acid',.7]]){await set('signal-kind',type);await double(await arena(x,.45));}
 await b.evaluate('artistooLab.rpc("backend",{mode:"gpu"}).then(()=>artistooLab.rpc("advance",{steps:8}))');
 check('New resource sources clamp actual fields on the GPU backend',await b.evaluate('artistooLab.snapshot.compute.active==="gpu"&&artistooLab.snapshot.sources.length===3&&artistooLab.snapshot.sources.every(p=>{const s=artistooLab.snapshot,f=s.fields[p.type],i=Math.floor(p.y/s.fieldScale)*f.width+Math.floor(p.x/s.fieldScale);return f.values[i]===1})'));
 await b.evaluate('(async()=>{window.savedSignals=await artistooLab.exportData();await artistooLab.importData(savedSignals)})()');
 check('Parameter import restores all three independent resource sources',await b.evaluate('artistooLab.snapshot.sources.length===3&&artistooLab.snapshot.sources.every(p=>["oxygen","glucose","acid"].includes(p.type))'));
 await click('[data-tool=signal]');await click('#source-erase');await tap(await arena(.3,.45));check('Source eraser removes the chosen source without removing other fields',await b.evaluate('artistooLab.snapshot.sources.length===2&&!artistooLab.snapshot.sources.some(p=>p.type==="oxygen")'));await click('#source-place');
 await set('language','en');await delay(100);check('Merged controls translate without leftover Chinese',await b.evaluate('!/[\\p{Script=Han}]/u.test(document.getElementById("signal-options").textContent)'));await shot('desktop-signal');
 await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await b.call('Emulation.setTouchEmulationEnabled',{enabled:true});await delay(300);await click('#mobile-tools-tab');await delay(300);
 check('Mobile keeps two rows of paired equal-size actions without text overflow',await paired()&&await b.evaluate('document.documentElement.scrollWidth<=391&&[...document.querySelectorAll("[data-tool]")].every(b=>b.scrollWidth<=b.clientWidth+1)'));
 await b.evaluate('document.getElementById("signal-options").scrollIntoView({block:"end"})');await shot('mobile-signal');
 await set('signal-kind','il2');await click('#mobile-expand');await delay(400);p=await arena(.5,.5);
 async function touch(down){await b.call('Input.dispatchTouchEvent',{type:down?'touchStart':'touchEnd',touchPoints:down?[{x:p.x,y:p.y,id:1}]:[]});}
 await b.evaluate('signalCommands.length=0');await touch(true);await touch(false);await delay(70);await touch(true);await touch(false);await delay(500);await b.evaluate('artistooLab.rpc("snapshot")');
 check('A real mobile double tap creates one IL-2 source',await b.evaluate('signalCommands.length===1&&signalCommands[0].command==="source"&&artistooLab.snapshot.sources.some(s=>s.type==="il2")'));
 await b.evaluate('signalCommands.length=0');await touch(true);await delay(800);await touch(false);await delay(200);const touchCount=await b.evaluate('signalCommands.length');await delay(450);
 check('Mobile long press releases repeatedly, stops on lift, and keeps the probe hidden',touchCount>=2&&await b.evaluate(`signalCommands.length===${touchCount}&&signalCommands.every(c=>c.command==='pulse')&&document.getElementById('field-probe').hidden`));
 check('No browser or application exceptions',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'),{errors:b.errors});
 if(target.startsWith('http')){const remote=await b.evaluate('(async()=>{const bytes=await(await fetch(location.href,{cache:"reload"})).arrayBuffer();return{bytes:bytes.byteLength,hash:Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),v=>v.toString(16).padStart(2,"0")).join("")}})()'),local=JSON.parse(await readFile('dist/manifest.json'));check('Published HTML matches the locally tested build',remote.hash===local.htmlSHA256&&remote.bytes===local.bytes,remote);}
}catch(error){checks.push({passed:false,error:String(error)});process.exitCode=1;await shot('failure');console.error(error);}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
