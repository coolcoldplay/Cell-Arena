/* Load into the local application with ego-browser page.evaluate(). This probe
 * uses the real Worker, transfer, GPU/Canvas and UI paths. No physics is skipped.
 * The default-off prototype is selected only in each explicit start payload. */
(() => {
  const scenarios={maximum:{worldWidth:512,worldHeight:384,refinement:2},fine:{worldWidth:240,worldHeight:180,refinement:4}};
  const q=(v,p)=>v.length?v.toSorted((a,b)=>a-b)[Math.max(0,Math.ceil(v.length*p)-1)]:null;
  const stats=v=>({count:v.length,p50Ms:q(v,.5),p95Ms:q(v,.95),p99Ms:q(v,.99),maxMs:v.length?Math.max(...v):null,over50ms:v.filter(x=>x>50).length,over100ms:v.filter(x=>x>100).length});
  const original=CanvasRenderingContext2D.prototype.drawImage;
  const probe=globalThis.pixelIndexBrowserProbe={running:false,active:null,rows:[],error:null,status:'ready'};
  CanvasRenderingContext2D.prototype.drawImage=function(...args){
    const result=original.apply(this,args),a=probe.active,s=globalThis.artistooLab?.snapshot;
    if(this.canvas.id==='world'&&a&&s?.time>a.lastTime){
      const now=performance.now();a.frames.push({at:now-a.begin,time:s.time});a.lastTime=s.time;
      a.visible&&=document.visibilityState==='visible';a.focused&&=document.hasFocus();
      if(s.time>=a.target){probe.active=null;a.resolve({at:now,time:s.time,cells:s.cells.length,counters:{...s.counters},presentation:{...s.presentation},performance:artistooLab.performance});}
    }
    return result;
  };
  let previous=0,raf=0;
  function frame(now){if(probe.active&&previous)probe.active.rafGaps.push(now-previous);previous=now;raf=requestAnimationFrame(frame);}raf=requestAnimationFrame(frame);
  const observer=new PerformanceObserver(list=>{if(probe.active)for(const entry of list.getEntries())probe.active.longTasks.push(entry.duration);});observer.observe({type:'longtask'});
  probe.start=async({cases=['maximum','fine'],pairs=3,seed=29,warmup=64,steps=960}={})=>{
    if(probe.running)throw Error('Probe already running');probe.running=true;probe.rows=[];probe.error=null;
    try{
      await artistooLab.ready;await CellLabAppearance.ready;
      await artistooLab.rpc('playing',{value:false});await artistooLab.rpc('backend',{mode:'cpu'});
      for(const name of cases)for(let pair=0;pair<pairs;pair++)for(const enabled of pair%2?[true,false]:[false,true]){
        probe.status=`${name}, pair ${pair+1}/${pairs}, ${enabled?'prototype':'baseline'}`;
        const mode=document.getElementById('performance-mode');mode.value='quality';mode.dispatchEvent(new Event('change'));
        const resolution=document.getElementById('render-resolution');resolution.value='1920';if(resolution.value!=='1920')throw Error('Missing 1920 display option');resolution.dispatchEvent(new Event('change'));
        for(const id of ['nuclei','antigen-marks','cycle-marks'])document.getElementById(id).checked=true;
        await artistooLab.rpc('start',{...scenarios[name],scene:'hot',seed,boundary:'wrap',warmup:0,pixelIndex:enabled});
        await artistooLab.rpc('advance',{steps:warmup});await artistooLab.rpc('speed',{value:8});
        artistooLab.render();await new Promise(requestAnimationFrame);
        const start=artistooLab.snapshot,canvas=document.getElementById('world');let resolve;
        const done=new Promise(r=>resolve=r),a={begin:performance.now(),lastTime:start.time,target:start.time+steps,frames:[],rafGaps:[],longTasks:[],visible:document.visibilityState==='visible',focused:document.hasFocus(),resolve};
        probe.active=a;let timer;
        const timeout=new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Browser run exceeded 120 seconds')),120000));
        await artistooLab.rpc('playing',{value:true});
        let end;try{end=await Promise.race([done,timeout]);}finally{clearTimeout(timer);probe.active=null;await artistooLab.rpc('playing',{value:false});}
        const elapsedMs=end.at-a.begin,gaps=a.frames.slice(1).map((v,i)=>v.at-a.frames[i].at),rafTiming=stats(a.rafGaps);
        const newFrameFPS=a.frames.length*1000/elapsedMs;
        probe.rows.push({case:name,pair:pair+1,mode:enabled?'prototype':'baseline',seed,startMCS:start.time,endMCS:end.time,startCells:start.cells.length,endCells:end.cells,elapsedMs,mcsPerSecond:(end.time-start.time)*1000/elapsedMs,newFrameFPS,frameGaps:stats(gaps),raf:rafTiming,longTasks:stats(a.longTasks),visible:a.visible,focused:a.focused,schedulingValid:a.visible&&a.focused&&rafTiming.p50Ms<50&&rafTiming.p95Ms<200&&newFrameFPS>5,display:[canvas.width,canvas.height],lattice:[start.width,start.height],dpr:devicePixelRatio,renderer:artistooLab.renderer,presentation:end.presentation,adaptive:end.performance,startCounters:start.counters,endCounters:end.counters,frames:a.frames});
        if(!probe.rows.at(-1).schedulingValid)throw Error('Background/occlusion scheduling: frame results are invalid');
        if(artistooLab.errors.length)throw Error(JSON.stringify(artistooLab.errors));
      }
      probe.status='complete';
    }catch(error){probe.error=String(error);probe.status='failed';try{await artistooLab.rpc('playing',{value:false});}catch{}}
    finally{probe.active=null;probe.running=false;}
    return probe.rows;
  };
  probe.dispose=()=>{if(probe.running)throw Error('Stop the run before disposing');cancelAnimationFrame(raf);observer.disconnect();CanvasRenderingContext2D.prototype.drawImage=original;};
})();
