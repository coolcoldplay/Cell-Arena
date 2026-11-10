import {openBrowser,delay} from './browser-session.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const label=process.argv[2]||'current',file=process.argv[3]||'dist/index.html',size=Number(process.argv[4]||512),resolution=Number(process.argv[5]||2560);
const browser=await openBrowser(file,9442,{gpu:true,initScript:`
window.perfProbe={draws:[],snapshots:[],longTasks:[]};
const originalDraw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='world')perfProbe.draws.push(performance.now());return originalDraw.apply(this,args);};
const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='snapshot')perfProbe.snapshots.push({at:performance.now(),time:e.data.data.time});});}};
new PerformanceObserver(list=>{for(const e of list.getEntries())perfProbe.longTasks.push(e.duration);}).observe({type:'longtask',buffered:true});
`});
const rows=[];
try{
  for(let i=0;i<300;i++){if(await browser.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await browser.evaluate('artistooLab.ready');
  await browser.evaluate(`artistooLab.rpc('playing',{value:false})`);
  await browser.evaluate(`artistooLab.rpc('backend',{mode:'cpu'})`);
  for(const speed of [1,8]){
    await browser.evaluate(`artistooLab.rpc('start',{scene:'hot',seed:29,worldWidth:${size},worldHeight:${size*.75},refinement:2,warmup:0})`);
    await browser.evaluate(`document.getElementById('render-resolution').value='${resolution}';document.getElementById('antigen-marks').checked=true;artistooLab.render()`);
    await browser.evaluate(`artistooLab.rpc('speed',{value:${speed}}).then(()=>artistooLab.rpc('playing',{value:true}))`);
    await delay(2000);await browser.evaluate(`perfProbe.draws=[];perfProbe.snapshots=[];perfProbe.longTasks=[];window.benchStart={at:performance.now(),time:artistooLab.snapshot.time}`);
    await delay(10000);
    rows.push(await browser.evaluate(`(()=>{const elapsed=performance.now()-benchStart.at,s=artistooLab.snapshot,d=perfProbe.draws,gaps=d.slice(1).map((v,i)=>v-d[i]).sort((a,b)=>a-b);return {speed:s.speed,lattice:[s.width,s.height],display:[document.getElementById('world').width,document.getElementById('world').height],antigen:document.getElementById('antigen-marks').checked,cells:s.cells.length,elapsed,renderedFPS:d.length*1000/elapsed,snapshotFPS:perfProbe.snapshots.length*1000/elapsed,mcsPerSecond:(s.time-benchStart.time)*1000/elapsed,frameGapP95:gaps[Math.floor(gaps.length*.95)],longTasks:perfProbe.longTasks.length,maxLongTask:Math.max(0,...perfProbe.longTasks),renderer:artistooLab.renderer,compute:s.compute};})()`));
    await browser.evaluate(`artistooLab.rpc('playing',{value:false})`);
  }
  if(browser.errors.length||(await browser.evaluate('artistooLab.errors.length')))throw Error(JSON.stringify(browser.errors));
  await mkdir('output/performance',{recursive:true});await writeFile(`output/performance/${label}-browser-${size}.json`,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));
}finally{await browser.close();}
