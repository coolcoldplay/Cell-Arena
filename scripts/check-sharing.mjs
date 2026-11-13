import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readdir,readFile} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const output=path.resolve('output/sharing');await mkdir(output,{recursive:true});
const b=await openBrowser(process.argv[2]||'dist/index.html',9396,{gpu:true});const checks=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
async function click(selector){
 const r=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.scrollIntoView({block:'nearest'});return true})()`);
 await delay(80);const p=await b.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await b.call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(100);
}
async function set(id,value){await b.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(100);}
async function upload(file){const {root}=await b.call('DOM.getDocument');const {nodeId}=await b.call('DOM.querySelector',{nodeId:root.nodeId,selector:'#import-file'});await b.call('DOM.setFileInputFiles',{nodeId,files:[file]});await delay(250);}
async function waitFor(expression){for(let i=0;i<150;i++){if(await b.evaluate(expression))return;await delay(100);}throw Error('Timed out: '+expression);}
const untranslated=`(()=>{const rows=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode,e=n.parentElement;if(e.closest('script,style,pre,[data-language],[data-no-i18n]'))continue;if(/[\\p{Script=Han}]/u.test(n.nodeValue))rows.push(n.nodeValue.trim());}for(const e of document.querySelectorAll('[title],[aria-label]')){if(e.closest('[data-language],[data-no-i18n]'))continue;for(const key of ['title','aria-label'])if(/[\\p{Script=Han}]/u.test(e.getAttribute(key)||''))rows.push(e.getAttribute(key));}return [...new Set(rows)]})()`;
try{
 await waitFor('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');
 const baseline=await b.evaluate('artistooLab.exportData()'),state=await b.evaluate('({time:artistooLab.snapshot.time,grid:Array.from(artistooLab.snapshot.grid),settings:artistooLab.snapshot.settings})');
 await set('language','en');
 check('English control and document language',await b.evaluate('document.documentElement.lang==="en"&&document.querySelector("#shuffle").textContent==="Randomize"'));
 check('language switch leaves time, geometry and parameters intact',JSON.stringify(await b.evaluate('({time:artistooLab.snapshot.time,grid:Array.from(artistooLab.snapshot.grid),settings:artistooLab.snapshot.settings})'))===JSON.stringify(state));
 let missing=await b.evaluate(untranslated);await writeFile(path.join(output,'untranslated.json'),JSON.stringify(missing,null,2));
 console.log('Untranslated initial:',JSON.stringify(missing));
 await click('#about');check('English model notes are shown',await b.evaluate('!document.querySelector("[data-language=en]").hidden&&document.querySelector("[data-language=zh]").hidden'));await click('#close-about');
 await set('language','zh');check('Chinese switch restores original labels',await b.evaluate('document.querySelector("#shuffle").textContent==="随机生成"'));
 await set('language','en');
 await click('#shuffle');await waitFor('artistooLab.snapshot.scene==="oncogenesis"&&artistooLab.snapshot.speed===3&&artistooLab.snapshot.playing');await b.evaluate('artistooLab.rpc("playing",{value:false})');
 const random=await b.evaluate('artistooLab.exportData()');
 check('randomize changes configuration and starts with healthy tissue',random.scene===baseline.scene&&random.seed!==baseline.seed&&random.settings.growth!==undefined&&!random.cells.some(m=>m.kind===2)&&random.cells.some(m=>m.kind===3));
 const randomGrid=await b.evaluate('Array.from(artistooLab.snapshot.grid)');
 const beforeReset=await b.evaluate('artistooLab.snapshot.revision');await click('#reset');await waitFor('artistooLab.snapshot.time===35&&artistooLab.snapshot.revision>'+beforeReset);
 if(random.time>35)await b.evaluate(`artistooLab.rpc('advance',{steps:${random.time-35}})`);
 check('reset reproduces generated founders and parameters',JSON.stringify(randomGrid)===JSON.stringify(await b.evaluate('Array.from(artistooLab.snapshot.grid)')));
 // An invalid imported file cannot replace or reset the current experiment.
 const invalid=path.join(output,'invalid.json');await writeFile(invalid,'{"scene":"hot","settings":{"growth":999}}');
 const beforeInvalid=await b.evaluate('artistooLab.snapshot.revision');await upload(invalid);
 check('invalid import is disabled with a readable error',await b.evaluate('document.querySelector("#confirm-import").disabled&&document.querySelector("#import-status").textContent.includes("Invalid")'));
 await click('#cancel-import');check('invalid import retains experiment',await b.evaluate('artistooLab.snapshot.revision')===beforeInvalid);
 const fixture={...baseline,scene:'hot',seed:991,worldWidth:192,worldHeight:144,refinement:1,speed:2.5,time:4567,settings:{...baseline.settings,growth:1.35,kill:.7},display:{...baseline.display,fieldView:'glucose',signalLayers:['trail'],opacity:{glucose:.8,trail:.7},flags:{nuclei:true,arrows:true},zoom:'150',fit:'contain',renderResolution:'1920',cellColors:{...baseline.display.cellColors,tumor:{body:'#18394d',nucleus:'#abc123'}}}};
 const valid=path.join(output,'parameters.json');await writeFile(valid,JSON.stringify(fixture));await upload(valid);
 console.log('Import preview',await b.evaluate('({disabled:document.querySelector("#confirm-import").disabled,summary:document.querySelector("#import-summary").textContent,status:document.querySelector("#import-status").textContent,revision:artistooLab.snapshot.revision,open:document.querySelector("#import-dialog").open})'),beforeInvalid);
 check('valid import previews configuration before replacement',await b.evaluate('!document.querySelector("#confirm-import").disabled&&document.querySelector("#import-summary").textContent.includes("991")&&artistooLab.snapshot.revision')===beforeInvalid);
 await click('#confirm-import');await waitFor('artistooLab.snapshot.seed===991');
 const loaded=await b.evaluate('artistooLab.exportData()');
 check('loaded parameters start a paused fresh run',await b.evaluate('!artistooLab.snapshot.playing&&artistooLab.snapshot.time===35')&&loaded.settings.growth===1.35&&loaded.settings.kill===.7&&loaded.speed===2.5);
 check('display settings and colors round-trip',loaded.display.fieldView==='glucose'&&loaded.display.signalLayers.includes('trail')&&loaded.display.opacity.glucose===.8&&loaded.display.cellColors.tumor.nucleus==='#abc123'&&loaded.display.zoom==='150');
 await click('[data-tool=inspect]');
 const pos=await b.evaluate('(()=>{const e=document.querySelector("#world").getBoundingClientRect(),s=artistooLab.snapshot,m=s.cells.find(c=>c.kind===2);return{x:e.x+m.x/s.width*e.width,y:e.y+m.y/s.height*e.height}})()');
 await b.call('Input.dispatchMouseEvent',{type:'mousePressed',...pos,button:'left',clickCount:1});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',...pos,button:'left',clickCount:1});await delay(150);
 check('English inspector shows the selected tumor',await b.evaluate('artistooLab.snapshot.cells.find(m=>m.id===artistooLab.selected)?.kind===2&&document.querySelector("#inspection").textContent.includes("Clone")'));
 await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...pos});await delay(150);check('inspection hover shows local readings',await b.evaluate('!document.querySelector("#field-probe").hidden'));
 await click('[data-tool=signal]');await set('signal-kind','danger');await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...pos});await delay(200);
 check('signal tool suppresses both custom and native hover popups',await b.evaluate('document.querySelector("#field-probe").hidden&&!document.querySelector("#world").title'));
 await b.call('Input.dispatchMouseEvent',{type:'mousePressed',...pos,button:'left',clickCount:1});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',...pos,button:'left',clickCount:1});await delay(450);
 check('signal painting still deposits factor',await b.evaluate('artistooLab.snapshot.fields.danger.values.some(v=>v>0)'));
 missing=await b.evaluate(untranslated);await writeFile(path.join(output,'untranslated-after.json'),JSON.stringify(missing,null,2));console.log('Untranslated after interaction:',JSON.stringify(missing));
 // Capture the actual browser-produced file, not a mock recorder.
 const downloads=path.join(output,'downloads');await mkdir(downloads,{recursive:true});await b.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
 const beforeFiles=new Set(await readdir(downloads));await click('#record-video');check('recording started',await b.evaluate('artistooLab.recording.active'));
 await b.evaluate('artistooLab.rpc("playing",{value:true})');await delay(2300);await set('zoom','100');await delay(1000);await click('#record-indicator');await waitFor('!artistooLab.recording.active');await b.evaluate('artistooLab.rpc("playing",{value:false})');
 let video;for(let i=0;i<100;i++){video=(await readdir(downloads)).find(f=>!beforeFiles.has(f)&&/\.(webm|mp4)$/.test(f));if(video)break;await delay(100);}
 check('a real MP4 file was downloaded',!!video&&video.endsWith('.mp4'));const videoPath=path.join(downloads,video),bytes=(await readFile(videoPath)).length;check('video contains encoded frames',bytes>5000);
 await writeFile(path.join(output,'video-path.txt'),videoPath);
 await b.evaluate('artistooLab.rpc("advance",{steps:500})');await delay(150);
 missing=await b.evaluate(untranslated);await writeFile(path.join(output,'untranslated-events.json'),JSON.stringify(missing,null,2));console.log('Untranslated event history:',JSON.stringify(missing));
 await b.call('Page.reload');await delay(100);await waitFor('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');
 check('English preference survives reload',await b.evaluate('document.documentElement.lang==="en"&&document.querySelector("#language").value==="en"'));
 await b.call('Page.captureScreenshot',{format:'png'}).then(r=>writeFile(path.join(output,'english.png'),Buffer.from(r.data,'base64')));
 await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
 check('English mobile controls stay within the viewport',await b.evaluate('document.documentElement.scrollWidth<=390&&document.documentElement.scrollHeight<=844&&document.querySelector("#sidebar-scroll").clientHeight>120'));
 await b.call('Page.captureScreenshot',{format:'png'}).then(r=>writeFile(path.join(output,'english-mobile.png'),Buffer.from(r.data,'base64')));
 check('no browser or app errors',b.errors.length===0&&(await b.evaluate('artistooLab.errors')).length===0);
 check('all audited interface text has English translations',missing.length===0);
 console.log(JSON.stringify({checks:checks.length,results:checks,videoPath,bytes},null,2));await writeFile(path.join(output,'checks.json'),JSON.stringify({checks,videoPath,bytes},null,2));
}finally{await b.close();}
