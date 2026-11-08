import {openBrowser,delay} from './browser-session.mjs';import {writeFile} from 'node:fs/promises';
const b=await openBrowser('dist/artistoo-playground.html',9374,{gpu:true}),checks=[],rates=[];
const check=(ok,name,detail={})=>{checks.push({name,passed:!!ok,...detail});if(!ok)throw Error(name);};
const ready=async()=>{for(let i=0;i<150;i++){if(await b.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}await b.evaluate('artistooLab.rpc("playing",{value:false})');};
try{
  await ready();
  for(const speed of [1,8]){
    await b.evaluate(`(async()=>{await artistooLab.rpc('start',{worldWidth:320,worldHeight:240,refinement:2,seed:17});await artistooLab.rpc('speed',{value:${speed}});await artistooLab.rpc('visible',{value:true});window.t0=artistooLab.snapshot.time;window.frames=0;window.countFrames=true;function f(){if(countFrames){frames++;requestAnimationFrame(f);}}requestAnimationFrame(f);await artistooLab.rpc('playing',{value:true});})()`);
    const t=performance.now();await delay(5000);const live=await b.evaluate('({limited:artistooLab.snapshot.limited,rate:artistooLab.snapshot.rate})');await b.evaluate('artistooLab.rpc("playing",{value:false})');
    const result=await b.evaluate('countFrames=false;({steps:artistooLab.snapshot.time-t0,frames,cells:artistooLab.snapshot.cells.length,kernel:artistooLab.snapshot.kernel,renderer:artistooLab.renderer})'),elapsed=performance.now()-t;rates.push({speed,mcsPerSecond:result.steps*1000/elapsed,uiCallbacksPerSecond:result.frames*1000/elapsed,...live,...result});
  }
  check(rates.every(r=>r.kernel==='wasm'&&r.uiCallbacksPerSecond>35),'High-resolution simulation keeps the UI responsive', {lattice:[640,480],rates});
  check(rates[1].mcsPerSecond>rates[0].mcsPerSecond*1.3,'Increasing playback measurably accelerates high-resolution model time');
  check(rates[1].limited||rates[1].mcsPerSecond>=192,'High-load 8x playback reports saturation instead of faking time');
  await b.call('Page.addScriptToEvaluateOnNewDocument',{source:`const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){const c=getContext.call(this,type,...args);if(type==='webgl2')window.testGL=c;return c;};`});
  await b.call('Page.reload');await delay(150);await ready();
  await b.evaluate('testGL.getExtension("WEBGL_lose_context").loseContext()');await delay(100);await b.evaluate('artistooLab.render()');
  const lost=await b.evaluate('({renderer:artistooLab.renderer,time:artistooLab.snapshot.time,errors:artistooLab.errors})');check(!lost.renderer.gpu&&lost.errors.length===0,'WebGL context loss switches to Canvas2D without stopping the model',lost);
  const pixels=await b.evaluate(`(()=>{const s=artistooLab.snapshot,c=document.getElementById('world'),ctx=c.getContext('2d'),scale=c.width/s.width,m=new Map(s.cells.map(c=>[c.id,c]));let n=0;for(let q=0;q<s.grid.length;q++){const cell=m.get(s.grid[q]);if(cell?.kind!==3||cell.dying)continue;const x=q%s.width,y=Math.floor(q/s.width),v=ctx.getImageData(Math.floor((x+.5)*scale),Math.floor((y+.5)*scale),1,1).data;if(v[0]===153&&v[1]===0&&v[2]===0)n++;}return n;})()`);
  check(pixels>100,'Canvas2D fallback preserves classic immune body color',{pixels});
  check(b.errors.length===0,'Runtime fallback has no uncaught browser errors');
}catch(e){checks.push({passed:false,error:String(e)});process.exitCode=1;console.error(e);}
finally{await writeFile('output/v4/runtime-checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
