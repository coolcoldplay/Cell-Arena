import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const out=process.argv[3]||'output/performance/checks';await mkdir(out,{recursive:true});
const b=await openBrowser(process.argv[2]||'dist/index.html',9443,{gpu:true,initScript:`
window.transportProbe={hold:false,automatic:0};const NativeWorker=Worker;
window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='snapshot'&&!e.data.interactive)transportProbe.automatic++;});}postMessage(message,...rest){if(transportProbe.hold&&message.command==='framePresented')return;return super.postMessage(message,...rest);}};
`}),checks=[];
const check=(name,passed,detail={})=>{checks.push({name,passed:!!passed,...detail});assert.ok(passed,name);};
const wait=async expr=>{for(let i=0;i<300;i++){if(await b.evaluate(expr))return;await delay(100);}throw Error('Timed out: '+expr);};
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');
  check('Default page has antigen outlines and the accelerated backends',await b.evaluate('document.getElementById("antigen-marks").checked&&artistooLab.renderer.gpu&&artistooLab.snapshot.kernel==="wasm"'));
  // Exercise the real scenario buttons, not only the Worker debug commands.
  for(const scene of ['cold','hot','maze','empty','oncogenesis']){
    await b.evaluate(`document.getElementById('antigen-marks').checked=false;window.oldRevision=artistooLab.snapshot.revision;document.querySelector('[data-scene="${scene}"]').click()`);
    await wait(`artistooLab.snapshot.revision>oldRevision&&artistooLab.snapshot.scene==='${scene}'&&document.getElementById('antigen-marks').checked`);
    await delay(250);await b.evaluate(`artistooLab.rpc('playing',{value:false})`);
    check('Scenario defaults: '+scene,await b.evaluate(`document.getElementById('antigen-marks').checked&&document.getElementById('immune-activity').checked===${scene==='maze'}`));
  }
  await b.evaluate(`artistooLab.rpc('start',{scene:'hot',seed:29,worldWidth:192,worldHeight:144,refinement:1,warmup:0})`);
  const geometry=await b.evaluate(`(()=>{
    const s=artistooLab.snapshot,r=new CellLabRenderer(),canvas=document.createElement('canvas');canvas.width=768;canvas.height=576;const ctx=canvas.getContext('2d'),opts={actFlags:[0,0,0,0],seams:false,selected:0,showAntigen:true,pixelRatio:1};
    const gl=r.gl,originalImage=gl.texImage2D.bind(gl),originalSub=gl.texSubImage2D.bind(gl);let allocations=0,updates=0;gl.texImage2D=(...a)=>{allocations++;return originalImage(...a);};gl.texSubImage2D=(...a)=>{updates++;return originalSub(...a);};
    const pixels=()=>ctx.getImageData(0,0,canvas.width,canvas.height).data;
    r.draw(ctx,s,opts);const positive=pixels(),initial=allocations;r.draw(ctx,{...s,grid:s.grid.slice()},opts);const repeat=allocations;r.draw(ctx,s,{...opts,showAntigen:false});const disabled=pixels();
    const negative={...s,cells:s.cells.map(m=>({...m,antigen:false}))};r.draw(ctx,negative,opts);const absent=pixels();let changed=0,unmarked=0;
    for(let i=0;i<positive.length;i+=4){if(positive[i]!==disabled[i]||positive[i+1]!==disabled[i+1]||positive[i+2]!==disabled[i+2])changed++;if(absent[i]!==disabled[i]||absent[i+1]!==disabled[i+1]||absent[i+2]!==disabled[i+2])unmarked++;}
    return {changed,unmarked,initial,repeat,updates};
  })()`);
  check('GPU outlines mark only recognizable antigen and can be switched off',geometry.changed>100&&geometry.unmarked===0,geometry);
  check('Same-size frames update existing GPU textures',geometry.initial===geometry.repeat&&geometry.updates>0,geometry);
  const switches=await b.evaluate(`(()=>{const s=artistooLab.snapshot,t=s.time,grid=s.grid.slice();for(const id of ['nuclei','antigen-marks','cycle-marks']){const e=document.getElementById(id);e.checked=!e.checked;artistooLab.render();}return artistooLab.snapshot.time===t&&grid.every((v,i)=>v===artistooLab.snapshot.grid[i]);})()`);
  check('Independent nucleus, antigen and cycle switches do not mutate the simulation',switches);
  await b.evaluate(`artistooLab.rpc('start',{scene:'ecosystem',width:96,height:72,warmup:0}).then(()=>artistooLab.rpc('speed',{value:8})).then(()=>artistooLab.rpc('playing',{value:true}))`);await delay(600);
  await b.evaluate(`transportProbe.hold=true;transportProbe.automatic=0;window.holdTime=artistooLab.snapshot.time`);await delay(900);
  const blocked=await b.evaluate(`({frames:transportProbe.automatic,time:artistooLab.snapshot.time})`);
  check('A stalled presenter cannot accumulate more than two automatic frames',blocked.frames<=2,blocked);
  const advanced=await b.evaluate(`transportProbe.hold=false;artistooLab.rpc('snapshot')`);
  check('Physics keeps advancing under render backpressure',advanced.time>blocked.time+10,{advanced:advanced.time,lastPresented:blocked.time});
  await delay(600);await b.evaluate(`artistooLab.rpc('playing',{value:false})`);
  check('Interactive pause flushes current state and sidebar promptly',await b.evaluate(`!artistooLab.snapshot.playing&&document.getElementById('play').textContent.includes('继续')&&document.getElementById('clock').textContent===artistooLab.snapshot.time.toLocaleString()`));
  check('Performance readout reports real frames and timings',await b.evaluate(`document.getElementById('render-performance').textContent.includes('FPS')&&artistooLab.renderer.snapshotMs>=0&&artistooLab.renderer.renderMs>0`));
  await b.evaluate(`document.getElementById('language').value='en';document.getElementById('language').dispatchEvent(new Event('change'))`);await delay(100);
  check('Performance readout supports English',await b.evaluate(`document.getElementById('render-performance').textContent.includes('Arena updates')`));
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await delay(200);await b.evaluate('artistooLab.render()');
  check('Mobile resizing keeps the GPU renderer and independent markers usable',await b.evaluate(`artistooLab.renderer.gpu&&document.documentElement.scrollWidth<=innerWidth+1`));
  await b.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await b.evaluate(`document.getElementById('language').value='zh';document.getElementById('language').dispatchEvent(new Event('change'));document.querySelector('[data-scene="hot"]').click()`);
  await wait('artistooLab.snapshot.scene==="hot"');await delay(500);await b.evaluate(`artistooLab.rpc('playing',{value:false})`);await b.evaluate('artistooLab.render()');
  const screenshot=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/antigen-default.png',Buffer.from(screenshot.data,'base64'));
  check('No browser or model runtime errors',b.errors.length===0&&(await b.evaluate('artistooLab.errors.length'))===0,{errors:b.errors});
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
