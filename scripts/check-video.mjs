import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import path from 'node:path';import assert from 'node:assert/strict';
const run=promisify(execFile),target=process.argv[2]||'dist/index.html',out=path.resolve('output/video-quality/'+(target.startsWith('https:')?'live':'local'));
await mkdir(out,{recursive:true});const downloads=path.join(out,'downloads');await mkdir(downloads,{recursive:true});
const b=await openBrowser(target,9401,{gpu:true}),checks=[],files=[];
const check=(name,condition,data={})=>{checks.push({name,passed:!!condition,...data});assert.ok(condition,name+': '+JSON.stringify(data));};
const wait=async expression=>{for(let i=0;i<150;i++){if(await b.evaluate(expression))return;await delay(100);}throw Error('Timed out: '+expression);};
async function click(selector){const p=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)p.open=true;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await b.call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(120);}
async function set(id,value){await b.evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function stopAndInspect(before,extension){
 await click('#record-indicator');await wait('!artistooLab.recording.active&&!artistooLab.recording.stopping&&artistooLab.recording.bytes>0');
 let name;for(let i=0;i<100;i++){name=(await readdir(downloads)).find(n=>!before.has(n)&&n.endsWith('.'+extension));if(name)break;await delay(100);}assert.ok(name,'A video was downloaded');
 const file=path.join(downloads,name),result=await run(process.platform==='win32'?'ffprobe.exe':'ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','format=format_name,duration,size:stream=codec_name,width,height,pix_fmt,avg_frame_rate,nb_read_frames','-of','json',file]);
 const meta=JSON.parse(result.stdout),state=await b.evaluate('artistooLab.recording');files.push({file,meta,state});return {file,meta,state};
}
try{
 await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');await set('language','zh');
 await b.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
 const baseline=await b.evaluate('JSON.stringify({time:artistooLab.snapshot.time,grid:Array.from(artistooLab.snapshot.grid),settings:artistooLab.snapshot.settings})'),displayBefore=await b.evaluate('({width:document.querySelector("#world").width,resolution:document.querySelector("#render-resolution").value})');
 check('Default is MP4 with 1440p high-quality recording',await b.evaluate('document.querySelector("#record-format").value==="mp4"&&document.querySelector("#record-quality").value==="high"&&document.querySelector("#record-video").textContent.includes("MP4")'));
 const before=new Set(await readdir(downloads));await click('#record-video');await wait('artistooLab.recording.active');
 const active=await b.evaluate('({recording:artistooLab.recording,sourceWidth:document.querySelector("#world").width,resolution:document.querySelector("#render-resolution").value,disabled:document.querySelector("#record-quality").disabled&&document.querySelector("#record-format").disabled})');
 check('Recording renders extra source detail and targets a higher bitrate',active.sourceWidth>displayBefore.width&&active.resolution===displayBefore.resolution&&active.recording.height===1440&&active.recording.bitrate===24000000&&active.disabled,active);
 await delay(700);
 const reference=await b.evaluate(`(()=>{const s=artistooLab.recording,c=document.createElement('canvas');c.width=s.width;c.height=s.height;const ctx=c.getContext('2d',{alpha:false}),world=document.querySelector('#world'),r=CellLabVideo.framing(world.getBoundingClientRect(),document.querySelector('.viewport').getBoundingClientRect(),c.width,c.height,world);ctx.fillStyle='#eee4d2';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(world,r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh);return c.toDataURL('image/png')})()`);
 const referencePath=path.join(out,'reference.png');await writeFile(referencePath,Buffer.from(reference.split(',')[1],'base64'));await delay(1700);
 const high=await stopAndInspect(before,'mp4'),stream=high.meta.streams[0];
 check('Downloaded file is real H.264 MP4 with the requested dimensions',high.meta.format.format_name.includes('mp4')&&stream.codec_name==='h264'&&stream.width===high.state.width&&stream.height===1440&&stream.pix_fmt==='yuv420p',high.meta);
 check('MP4 contains a finite timeline and decoded video frames',Number(high.meta.format.duration)>1.5&&Number(stream.nb_read_frames)>30,{duration:high.meta.format.duration,frames:stream.nb_read_frames,fps:stream.avg_frame_rate});
 const decoded=path.join(out,'mp4-frame.png'),ffmpeg=process.platform==='win32'?'ffmpeg.exe':'ffmpeg';await run(ffmpeg,['-v','error','-y','-ss','0.7','-i',high.file,'-frames:v','1',decoded]);
 const comparison=await run(ffmpeg,['-hide_banner','-i',decoded,'-i',referencePath,'-lavfi','ssim','-frames:v','1','-f','null','-']);const ssim=Number(comparison.stderr.match(/All:([\d.]+)/)?.[1]);
 check('Decoded MP4 preserves the rendered cell detail',ssim>.98,{ssim});await writeFile(path.join(out,'quality-comparison.log'),comparison.stderr);
 await b.evaluate('artistooLab.render()');check('Stopping restores display resolution and leaves paused biology unchanged',await b.evaluate('document.querySelector("#world").width')===displayBefore.width&&await b.evaluate('JSON.stringify({time:artistooLab.snapshot.time,grid:Array.from(artistooLab.snapshot.grid),settings:artistooLab.snapshot.settings})')===baseline);
 await set('record-quality','ultra');const before4K=new Set(await readdir(downloads));await click('#record-video');await wait('artistooLab.recording.active');const initial4K=await b.evaluate('artistooLab.recording');await delay(1300);
 await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:2,mobile:true});await delay(900);check('Recording settings keep showing the actual encoded resolution after resize',await b.evaluate('document.querySelector("#record-options-info").textContent.includes("'+initial4K.width+' × '+initial4K.height+'")'));const ultra=await stopAndInspect(before4K,'mp4');
 check('4K preset records a real larger MP4 and keeps dimensions through a layout change',initial4K.height===2160&&ultra.meta.streams[0].height===2160&&ultra.meta.streams[0].width===initial4K.width&&ultra.meta.streams[0].codec_name==='h264',ultra.meta);
 await b.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await delay(150);
 await b.evaluate('window.originalMediaSupport=MediaRecorder.isTypeSupported;MediaRecorder.isTypeSupported=type=>!type.startsWith("video/mp4")&&originalMediaSupport.call(MediaRecorder,type)');await set('record-format','mp4');
 check('Unavailable MP4 is explained instead of silently exporting WebM',await b.evaluate('document.querySelector("#record-video").disabled&&document.querySelector("#record-options-info").textContent.includes("不支持 MP4")&&document.querySelector("#record-status").textContent.includes("不支持 MP4")'));
 await set('record-format','webm');await set('record-quality','standard');const beforeWebM=new Set(await readdir(downloads));await click('#record-video');await wait('artistooLab.recording.active');await delay(1300);const compatible=await stopAndInspect(beforeWebM,'webm');
 check('WebM works only when explicitly selected and keeps the matching extension',compatible.meta.format.format_name.includes('webm')&&compatible.meta.streams[0].height===1080,compatible.meta);
 await b.evaluate('MediaRecorder.isTypeSupported=originalMediaSupport');await set('record-format','mp4');await set('language','en');
 check('Recording options and saved-video details are translated',await b.evaluate('document.querySelector("#record-video").textContent==="● Record MP4"&&document.querySelector("#record-status").textContent.includes("Video saved")&&document.querySelector("#record-quality").options[1].textContent.includes("High quality")'));
 check('No browser or application errors',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'));
 console.log(JSON.stringify({checks,files},null,2));
}catch(error){console.error(error);process.exitCode=1;const shot=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'failure.png'),Buffer.from(shot.data,'base64'));}
finally{await writeFile(path.join(out,'checks.json'),JSON.stringify({checks,files},null,2));await writeFile(path.join(out,'tested-manifest.json'),await readFile('dist/manifest.json'));await b.close();}
