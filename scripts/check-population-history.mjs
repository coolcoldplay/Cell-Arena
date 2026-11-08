import {openBrowser,delay} from './browser-session.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const out='output/population-history/browser';await mkdir(out,{recursive:true});
// Observe the actual canvas commands, without replacing the chart or its data.
const initScript=`(()=>{const p=CanvasRenderingContext2D.prototype;for(const method of ['clearRect','beginPath','moveTo','lineTo','stroke','fillText']){const original=p[method];p[method]=function(...args){if(this.canvas.id==='history'){if(method==='clearRect')window.historyTrace={texts:[],paths:[],current:[]};const t=window.historyTrace;if(t){if(method==='beginPath')t.current=[];else if(method==='moveTo'||method==='lineTo')t.current.push(args);else if(method==='stroke')t.paths.push({color:this.strokeStyle,points:t.current.slice()});else if(method==='fillText')t.texts.push(args);}}return Reflect.apply(original,this,args);};}})();`;
const b=await openBrowser('dist/artistoo-playground.html',9388,{gpu:true,initScript}),{evaluate,call}=b,checks=[];
const check=(ok,name,details={})=>{checks.push({name,passed:!!ok,...details});if(!ok)throw Error(name);};
const capture=()=>evaluate(`(()=>{artistooLab.render();const s=artistooLab.snapshot;return {time:s.time,playing:s.playing,history:s.history,samples:s.historySamples,cells:s.cells.map(c=>({id:c.id,kind:c.kind,state:c.state})),label:document.getElementById('history-range').textContent,aria:document.getElementById('history').getAttribute('aria-label'),trace:historyTrace};})()`);
const shoot=async name=>{await evaluate(`document.querySelector('.chart-panel').scrollIntoView({block:'center'});artistooLab.render();`);await delay(80);const png=await call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(png.data,'base64'));};
try{
  for(let n=0;n<150;n++){if(await evaluate('!!window.artistooLab?.snapshot&&artistooLab.snapshot.speed===4'))break;await delay(100);}
  await evaluate(`artistooLab.rpc('playing',{value:false})`);
  const initial=await capture();
  check(initial.history[0].time===0&&initial.history[0].normal===48&&initial.history[0].tumor===0,'Initial populations are recorded at time zero, before settling');
  await evaluate(`artistooLab.rpc('start',{scene:'empty',width:64,height:48,warmup:0,settings:{growth:0,immuneGrowth:0,metabolism:0,apoptosis:0,kill:0,antigen:0}})`);
  const seeded=await evaluate(`artistooLab.rpc('seed',{kind:1,x:18,y:20,manual:true})`);
  check(seeded.id>0,'Seed one normal cell through the worker at time zero');
  await evaluate(`artistooLab.rpc('advance',{steps:10000})`);
  await evaluate(`artistooLab.rpc('advance',{steps:5001})`);
  let state=await capture();
  check(state.time===15001&&state.history.length>400&&state.history[0].time===0&&state.history.some(r=>r.time===30),'A real 15001-MCS run retains early samples beyond the old 400-point window',{samples:state.history.length,time:state.time});
  check(state.history.at(-1).time===15001&&state.history.at(-1).normal===state.cells.filter(c=>c.kind===1&&c.state!=='abnormal').length,'The chart endpoint includes exact current time and counts between periodic samples');
  check(state.trace.texts.some(t=>t[0]==='0 MCS'&&t[1]===30)&&state.trace.texts.some(t=>t[0]==='15001 MCS'&&t[1]===945)&&state.trace.paths.slice(1).every(p=>p.points[0][0]===30&&p.points.at(-1)[0]===945),'Actual canvas axes and all four curves span zero to the current time');
  check(state.label.includes('15,001')&&state.aria.includes('0 到 15001'),'Visible range and accessible label state the entire interval');
  const position=await evaluate(`(()=>{const s=artistooLab.snapshot;for(let y=6;y<s.height-6;y++)for(let x=6;x<s.width-6;x++){let free=true;for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)if(s.grid[(y+dy)*s.width+x+dx])free=false;if(free)return {x,y};}throw Error('No room for fixture');})()`);
  const immune=await evaluate(`artistooLab.rpc('seed',${JSON.stringify({kind:3,...position,manual:true})})`);state=await capture();
  check(immune.id>0&&state.time===15001&&state.history.at(-1).immune===1&&state.history.at(-2).immune===0,'Paused manual additions update the current endpoint immediately');
  const exported=await evaluate(`artistooLab.rpc('export')`);
  check(exported.history.length>400&&exported.history[0].time===0&&exported.history.some(r=>r.time===30)&&exported.history.at(-1).time===15001&&exported.history.at(-1).immune===1,'JSON export retains the complete archive and current state',{exportedSamples:exported.history.length});
  await writeFile(out+'/export-history.json',JSON.stringify({time:exported.time,history:exported.history},null,2));
  await delay(160);const paused=await capture();
  check(!paused.playing&&paused.time===state.time&&paused.label===state.label&&JSON.stringify(paused.history)===JSON.stringify(state.history),'Pausing freezes the full-history time axis and data');
  await evaluate(`artistooLab.rpc('advance',{steps:1})`);state=await capture();
  check(state.time===15002&&state.history.at(-1).time===15002&&state.history[0].time===0,'One MCS advances only the right endpoint, preserving the beginning');
  await shoot('full-history-desktop');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(80);
  check(await evaluate(`document.documentElement.scrollWidth<=392&&[...document.querySelectorAll('.chart-panel>div>span')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=390;})`),'The full-range heading fits on mobile without horizontal overflow');await shoot('full-history-mobile');
  await evaluate(`artistooLab.rpc('start',{scene:'empty',width:64,height:48,warmup:0})`);state=await capture();
  check(state.time===0&&state.history.length===1&&state.history[0].time===0&&state.history[0].normal===0&&state.history[0].immune===0,'A new simulation starts a separate zero-based history');
  check(b.errors.length===0&&await evaluate('artistooLab.errors.length===0'),'No browser or worker runtime errors');
  check(b.requests.length===0,'Standalone build has no network dependencies');
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));await writeFile(out+'/tested-manifest.json',await readFile('dist/manifest.json'));console.log(JSON.stringify(checks,null,2));await b.close();}
