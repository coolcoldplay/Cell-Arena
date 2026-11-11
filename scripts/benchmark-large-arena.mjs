import {openBrowser,delay} from './browser-session.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const label=process.argv[2]||'current',file=process.argv[3]||'dist/index.html',refinement=Number(process.argv[4]||1.5);
const browser=await openBrowser(file,9510,{gpu:true});
try{
  for(let i=0;i<300;i++){if(await browser.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await browser.evaluate(`(async()=>{
    await artistooLab.ready;await artistooLab.rpc('playing',{value:false});
    await artistooLab.rpc('start',{scene:'hot',seed:29,worldWidth:512,worldHeight:384,refinement:${refinement},boundary:'wrap',warmup:0});
    await artistooLab.rpc('backend',{mode:'cpu'});
    const set=(id,value)=>{const e=document.getElementById(id);if(typeof value==='boolean')e.checked=value;else e.value=value;e.dispatchEvent(new Event('change'));};
    set('render-resolution','1920');set('performance-mode','quality');set('nuclei',true);set('cycle-marks',true);set('antigen-marks',true);set('body-feather',60);
    window.cost={};window.frames=[];window.presented=new Set();
    const instrument=(o,k,label)=>{const original=o[k];o[k]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{const row=cost[label]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-t;if(label==='gpu')presented.add(args[1].revision+':'+args[1].time);}};};
    instrument(CellLabAppearance.Surface.prototype,'get','optical');instrument(CellLabRenderer.prototype,'draw','gpu');
    instrument(CellLabDisplay.Cache.prototype,'get','fields');instrument(CellLabDisplay.Cache.prototype,'nucleusBatches','nuclei');
    for(const k of ['fillText','strokeText'])instrument(CanvasRenderingContext2D.prototype,k,k);
    const frame=()=>{frames.push(performance.now());requestAnimationFrame(frame);};requestAnimationFrame(frame);
    await artistooLab.rpc('speed',{value:3});await artistooLab.rpc('playing',{value:true});
  })()`);
  await delay(4000);
  await browser.call('Profiler.enable');await browser.call('Profiler.start');
  await browser.evaluate('cost={};frames=[];presented.clear();window.startSample={at:performance.now(),time:artistooLab.snapshot.time};window.samples=[];window.sampleTimer=setInterval(()=>samples.push({...artistooLab.renderer,stepMs:artistooLab.snapshot.stepMs,snapshotMs:artistooLab.snapshot.snapshotMs}),100)');
  await delay(10000);
  const {profile}=await browser.call('Profiler.stop');
  const result=await browser.evaluate(`(()=>{clearInterval(sampleTimer);const elapsed=performance.now()-startSample.at,s=artistooLab.snapshot;return {elapsed,cells:s.cells.length,lattice:[s.width,s.height],display:[document.getElementById('world').width,document.getElementById('world').height],opticalWasm:CellLabAppearance.accelerated||false,renderedFPS:presented.size*1000/elapsed,drawCallsPerSecond:cost.gpu.calls*1000/elapsed,mcsPerSecond:(s.time-startSample.time)*1000/elapsed,renderer:artistooLab.renderer,performance:artistooLab.performance,cost,samples};})()`);
  const screenshot=await browser.call('Page.captureScreenshot');
  await browser.evaluate("artistooLab.rpc('playing',{value:false})");
  await mkdir('output/performance',{recursive:true});await writeFile('output/performance/'+label+'-large-browser.json',JSON.stringify(result,null,2));await writeFile('output/performance/'+label+'-main.cpuprofile',JSON.stringify(profile));await writeFile('output/performance/'+label+'.png',Buffer.from(screenshot.data,'base64'));
  const {samples,...compact}=result;console.log(JSON.stringify(compact,null,2));
  if(browser.errors.length||await browser.evaluate('artistooLab.errors.length'))throw Error(JSON.stringify(browser.errors));
}finally{await browser.close();}
