import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';import assert from 'node:assert/strict';
const target=process.argv[2]||'dist/index.html',out=path.resolve('output/statistics-video/'+(target.startsWith('http')?'live':'local')),run=promisify(execFile);
await mkdir(out,{recursive:true});const downloads=path.join(out,'downloads');await mkdir(downloads,{recursive:true});
const b=await openBrowser(target,9430,{gpu:true}),checks=[];
const check=(name,passed,data={})=>{checks.push({name,passed:!!passed,...data});assert.ok(passed,name+': '+JSON.stringify(data));};
const wait=async e=>{for(let i=0;i<250;i++){if(await b.evaluate(e))return;await delay(100);}throw Error('Timed out: '+e);};
const shot=async name=>{const r=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));};
const click=async selector=>{await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(180);};
const set=async(id,value)=>{await b.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(100);};
try{
 await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');await set('language','zh');
 const time=await b.evaluate('artistooLab.snapshot.time');await click('[data-panel="statistics-panel"]');await click('#statistics-expand');
 const layout=await b.evaluate(`(()=>{const a=document.querySelector('aside').getBoundingClientRect(),p=document.querySelector('#sidebar-scroll'),r=p.getBoundingClientRect(),h=document.querySelector('#history').getBoundingClientRect();return {height:a.height,available:r.height,content:p.scrollHeight,top:r.top,historyBottom:h.bottom,bodyScroll:document.body.scrollHeight,windowHeight:innerHeight,focused:document.querySelector('aside').classList.contains('statistics-focused')}})()`);
 check('Statistics occupies the sidebar and full-course history is visible at desktop height',layout.focused&&layout.available>940&&layout.historyBottom<1000&&layout.content<=layout.available+1&&layout.bodyScroll===layout.windowHeight,layout);
 check('Focusing statistics does not advance paused biology',await b.evaluate('artistooLab.snapshot.time')===time);await shot('desktop-statistics');
 await b.evaluate('(async()=>{await artistooLab.rpc("start",{scene:"empty",worldWidth:120,worldHeight:90,refinement:1,warmup:0,settings:{metabolism:0,growth:0,immuneGrowth:0}});await artistooLab.rpc("sprinkle",{kind:1,count:8});await artistooLab.rpc("advance",{steps:30});})()');
 await wait('Number(document.querySelector("#normal-count").textContent)===8&&document.querySelector("#history-range").textContent.includes("30")');
 check('Focused counters and the complete history update from actual snapshots',await b.evaluate('Number(document.querySelector("#normal-count").textContent)===8&&document.querySelector("#history-range").textContent.includes("30")'));
 await set('record-scope','workspace');await set('record-quality','standard');
 await b.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});const before=new Set(await readdir(downloads));
 await click('#statistics-record');await wait('artistooLab.recording.active');await delay(1300);
 const state=await b.evaluate('artistooLab.recording'),beforeChange=state.elapsed;
 check('Combined video uses the whole app aspect ratio and locks scope while recording',state.scope==='workspace'&&Math.abs(state.width/state.height-1.44)<.003&&await b.evaluate('document.querySelector("#record-scope").disabled'),{state});
 await b.evaluate('(async()=>{await artistooLab.rpc("sprinkle",{kind:3,count:20});await artistooLab.rpc("advance",{steps:100});})()');await delay(1500);
 const changed=await b.evaluate('artistooLab.recording.elapsed');
 check('Live immune counts and history remain visible during recording',await b.evaluate('Number(document.querySelector("#immune-count").textContent)===20&&document.querySelector("#history-range").textContent.includes("130")'));
 await shot('recording-statistics');
 await click('#statistics-expand');await click('[data-panel="parameter-groups"]');await click('#module-immune>summary');await delay(1000);
 await click('#record-indicator');await wait('!artistooLab.recording.active&&!artistooLab.recording.stopping&&artistooLab.recording.bytes>0');
 let name;for(let i=0;i<100;i++){name=(await readdir(downloads)).find(n=>!before.has(n)&&n.endsWith('.mp4'));if(name)break;await delay(100);}assert.ok(name);
 const file=path.join(downloads,name),probe=JSON.parse((await run('ffprobe.exe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','format=format_name,duration:stream=codec_name,width,height,nb_read_frames','-of','json',file])).stdout);
 check('Downloaded combined recording is a decodable H.264 MP4',probe.streams[0].codec_name==='h264'&&probe.streams[0].width===state.width&&Number(probe.streams[0].nb_read_frames)>30,{probe});
 const snapshots=[];for(const [label,t]of [['before',.15],['after',changed-.3],['controls',Number(probe.format.duration)-.3]]){
  const image=path.join(out,'video-'+label+'.png');await run('ffmpeg.exe',['-v','error','-y','-ss',String(t),'-i',file,'-frames:v','1',image]);
  const crop=(await run('ffmpeg.exe',['-v','error','-ss',String(t),'-i',file,'-vf',`crop=iw*0.23:ih:iw*0.77:0,scale=80:200`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],{encoding:'buffer'})).stdout;snapshots.push(crop);
 }
 const difference=(a,c)=>a.reduce((sum,x,i)=>sum+Math.abs(x-c[i]),0)/a.length;
 check('Decoded sidebar pixels change with live statistics, then with visible controls',difference(snapshots[0],snapshots[1])>.05&&difference(snapshots[1],snapshots[2])>2,{statsDifference:difference(snapshots[0],snapshots[1]),controlsDifference:difference(snapshots[1],snapshots[2])});
 check('Recording and changing sidebar views do not advance paused simulation',await b.evaluate('artistooLab.snapshot.time')===130);
 check('Stopping cleans up temporary capture frames',await b.evaluate('document.querySelectorAll("iframe.html2canvas-container").length===0'));
 await set('language','en');await click('[data-panel="statistics-panel"]');await click('#statistics-expand');
 check('Expanded stats and recording scope translate to English',await b.evaluate('document.querySelector("#statistics-expand").textContent==="Back to controls"&&document.querySelector("#record-scope").selectedOptions[0].textContent==="Arena + sidebar"'));
 await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:2,mobile:true});await delay(350);await shot('mobile-statistics');
 check('Mobile only offers Arena recording',await b.evaluate('document.querySelector("#record-scope").value==="arena"&&document.querySelector("#record-scope").closest("label").hidden'));
 check('Mobile statistics stays independently scrollable without horizontal overflow',await b.evaluate('document.querySelector("#sidebar-scroll").clientHeight>500&&document.querySelector("aside").scrollWidth<=390&&document.body.scrollWidth===390'));
 await set('record-scope','workspace');await click('#statistics-record');await wait('artistooLab.recording.active');
 check('Mobile recording enforces Arena scope even if an old combined choice is supplied',await b.evaluate('artistooLab.recording.scope==="arena"'));await delay(800);await click('#record-indicator');await wait('!artistooLab.recording.active&&!artistooLab.recording.stopping');
 await click('#statistics-expand');check('Leaving focus restores the mobile control header',await b.evaluate('!document.querySelector("aside").classList.contains("statistics-focused")&&document.querySelector("#language").getBoundingClientRect().height>0'));
 check('No browser or application errors',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'),{errors:b.errors});
}catch(error){console.error(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(path.join(out,'checks.json'),JSON.stringify(checks,null,2));await writeFile(path.join(out,'tested-manifest.json'),await readFile('dist/manifest.json'));await b.close();console.log(JSON.stringify(checks,null,2));}
