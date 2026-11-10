import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const label=process.argv[2]||'current',target=process.argv[3]||'dist/index.html';
const b=await openBrowser(target,9450,{gpu:true,initScript:`
window.measure={draws:[],history:0,gaps:[],last:0};
const draw=CanvasRenderingContext2D.prototype.drawImage,clear=CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.drawImage=function(...a){if(this.canvas.id==='world')measure.draws.push(performance.now());return draw.apply(this,a);};
CanvasRenderingContext2D.prototype.clearRect=function(...a){if(this.canvas.id==='history')measure.history++;return clear.apply(this,a);};
function observe(t){if(measure.last)measure.gaps.push(t-measure.last);measure.last=t;requestAnimationFrame(observe);}requestAnimationFrame(observe);
`});
const rows=[];
try{
  for(let i=0;i<400;i++){if(await b.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}await b.evaluate('artistooLab.ready');
  await b.evaluate(`artistooLab.rpc('playing',{value:false}).then(()=>artistooLab.rpc('backend',{mode:'cpu'}))`);
  await b.evaluate(`(()=>{const e=document.getElementById('performance-mode');if(e){e.value='auto';e.dispatchEvent(new Event('change'));}})()`);
  for(const mobile of [false,true]){
    await b.call('Emulation.setDeviceMetricsOverride',mobile?{width:390,height:844,deviceScaleFactor:3,mobile:true}:{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
    await b.call('Emulation.setCPUThrottlingRate',{rate:mobile?3:1});
    await b.evaluate(`document.getElementById('render-resolution').value='auto';document.getElementById('statistics-panel').open=false;artistooLab.rpc('start',{scene:'hot',seed:29,worldWidth:384,worldHeight:288,refinement:2,warmup:0})`);
    await b.evaluate(`artistooLab.rpc('speed',{value:8}).then(()=>artistooLab.rpc('playing',{value:true}))`);await delay(5000);
    await b.evaluate(`measure.draws=[];measure.gaps=[];measure.history=0;window.started={at:performance.now(),time:artistooLab.snapshot.time};`);await delay(12000);
    rows.push(await b.evaluate(`(()=>{const elapsed=performance.now()-started.at,s=artistooLab.snapshot,gaps=measure.gaps.sort((a,b)=>a-b);return {mobile:${mobile},cpuThrottle:${mobile?3:1},elapsed,cells:s.cells.length,lattice:[s.width,s.height],display:[world.width,world.height],fps:measure.draws.length*1000/elapsed,mcsPerSecond:(s.time-started.time)*1000/elapsed,rafGapP95:gaps[Math.floor(gaps.length*.95)],historyDraws:measure.history,adaptive:artistooLab.performance,renderer:artistooLab.renderer};})()`));
    await b.evaluate(`artistooLab.rpc('playing',{value:false})`);
  }
  await mkdir('output/adaptive',{recursive:true});await writeFile(`output/adaptive/${label}.json`,JSON.stringify({rows,errors:b.errors},null,2));console.log(JSON.stringify({rows,errors:b.errors},null,2));
}finally{await b.close();}
