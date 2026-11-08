import {openBrowser,delay} from './browser-session.mjs';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const browser=await openBrowser('dist/artistoo-playground.html',9356),checks=[],failures=[];
const {evaluate,call}=browser;
const check=(condition,name,detail={})=>{checks.push({name,passed:!!condition,...detail});if(!condition)throw Error(name+' '+JSON.stringify(detail));};
await mkdir('output/v2',{recursive:true});
const shot=async name=>{await evaluate('artistooLab.render();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const r=await call('Page.captureScreenshot',{format:'png'});await writeFile('output/v2/'+name+'.png',Buffer.from(r.data,'base64'));};
const mouse=async(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});
try{
  for(let i=0;i<100;i++){if(await evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await evaluate('artistooLab.ready');await evaluate('artistooLab.rpc("playing",{value:false})');
  const initial=await evaluate('({scene:artistooLab.snapshot.scene,cells:artistooLab.snapshot.cells.length,worker:!!document.getElementById("worker-source"),mainCPM:typeof CPM})');
  check(initial.scene==='ecosystem'&&initial.cells===56&&initial.worker&&initial.mainCPM==='undefined','CPM runs in worker with all three populations',initial);
  const settings=await evaluate('document.getElementById("chemotaxis").value=2.4;document.getElementById("chemotaxis").dispatchEvent(new Event("input"));artistooLab.rpc("snapshot").then(()=>artistooLab.snapshot.settings.chemotaxis)');
  check(settings===2.4,'Slider reaches model in worker');
  // Test speed with the same scene, seed and cell count at each rate.
  const speeds=[];
  for(const speed of [.5,2,4]){
    await evaluate(`artistooLab.rpc('start',{scene:'ecosystem',seed:17,boundary:'solid'}).then(()=>artistooLab.rpc('speed',{value:${speed}})).then(()=>{window.firstTime=artistooLab.snapshot.time;window.frames=[];window.f0=performance.now();window.stopFrames=false;function sample(t){frames.push(t);if(!stopFrames)requestAnimationFrame(sample);}requestAnimationFrame(sample);return artistooLab.rpc('playing',{value:true});})`);
    const begin=performance.now();await delay(2400);await evaluate('artistooLab.rpc("playing",{value:false})');const elapsed=performance.now()-begin;
    const result=await evaluate('stopFrames=true;({steps:artistooLab.snapshot.time-firstTime,frames:frames.length,errors:artistooLab.errors})');
    speeds.push({speed,steps:result.steps,mcsPerSecond:result.steps*1000/elapsed,uiFPS:result.frames*1000/elapsed});
  }
  check(speeds[1].mcsPerSecond>speeds[0].mcsPerSecond*2.5,'Playback multiplier changes actual model speed',{speeds});
  check(speeds[2].uiFPS>35,'UI remains responsive while worker computes',{uiFPS:speeds[2].uiFPS});
  await evaluate('artistooLab.rpc("start",{scene:"collective",seed:17,boundary:"solid"})');
  const free=await evaluate(`(()=>{const s=artistooLab.snapshot;for(let y=10;y<s.height-10;y+=4)for(let x=10;x<s.width-14;x+=4){let empty=true;for(let dy=-7;dy<=7;dy++)for(let dx=-7;dx<=11;dx++)if(s.grid[(y+dy)*s.width+x+dx])empty=false;if(empty){const r=document.getElementById('world').getBoundingClientRect();return {gx:x,gy:y,x:r.x+(x+.5)/s.width*r.width,y:r.y+(y+.5)/s.height*r.height,scale:r.width/s.width};}}})()`);
  check(!!free,'Found free space for mouse interaction');
  await evaluate('document.querySelector("[data-tool=seed]").click();document.getElementById("seed-kind").value="3";window.beforeCount=artistooLab.snapshot.cells.length');
  await mouse('mousePressed',free.x,free.y);await mouse('mouseReleased',free.x,free.y);await delay(100);
  check(await evaluate('artistooLab.snapshot.cells.length===beforeCount+1'),'Mouse adds selected immune cell');
  const cellID=await evaluate(`artistooLab.snapshot.grid[${free.gy}*artistooLab.snapshot.width+${free.gx}]`);
  await evaluate(`document.querySelector('[data-tool=move]').click();window.dragArea=artistooLab.snapshot.cells.find(c=>c.id===${cellID}).area`);
  await mouse('mousePressed',free.x,free.y);await delay(50);await mouse('mouseMoved',free.x+4*free.scale,free.y);await delay(70);await mouse('mouseReleased',free.x+4*free.scale,free.y);await delay(100);
  const dragged=await evaluate(`(()=>{const m=artistooLab.snapshot.cells.find(c=>c.id===${cellID});return {x:m.x,area:m.area,before:dragArea,playing:artistooLab.snapshot.playing};})()`);
  check(dragged.x>free.gx+2&&dragged.area===dragged.before&&!dragged.playing,'Mouse dragging moves geometry and preserves pause state',dragged);
  await evaluate('document.querySelector("[data-tool=signal]").click();document.getElementById("signal-kind").value="cohesion";window.massBefore=artistooLab.snapshot.fields.cohesion.values.reduce((a,b)=>a+b,0)');
  await mouse('mousePressed',free.x,free.y+10*free.scale);await mouse('mouseReleased',free.x,free.y+10*free.scale);await delay(100);
  const signals=await evaluate('({added:artistooLab.snapshot.fields.cohesion.values.reduce((a,b)=>a+b,0)-massBefore,view:document.getElementById("field-view").value,danger:artistooLab.snapshot.fields.danger.values.reduce((a,b)=>a+b,0)})');
  check(signals.added>0&&signals.view==='cohesion'&&signals.danger===0,'Mouse releases selected chemotactic signal',signals);
  const box=await evaluate('(()=>{const r=document.getElementById("world").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()');
  await evaluate('document.querySelector("[data-tool=wall]").click()');
  const wx=box.x+182/192*box.w,wy=box.y+15/144*box.h;
  await mouse('mousePressed',wx,wy);await mouse('mouseMoved',wx,wy+85/144*box.h);await delay(70);await mouse('mouseReleased',wx,wy+85/144*box.h);await delay(120);
  const barriers=await evaluate('window.walls=[...artistooLab.snapshot.grid].map((id,i)=>id&&!artistooLab.snapshot.cells.some(c=>c.id===id)?[i,id]:null).filter(Boolean);walls.length');
  check(barriers>200,'Dragging draws actual solid obstacles',{pixels:barriers});
  await evaluate('artistooLab.rpc("advance",{steps:100})');
  check(await evaluate('walls.every(([i,id])=>artistooLab.snapshot.grid[i]===id)'),'Painted wall remains solid under simulation');
  await shot('mouse-tools');
  await evaluate('document.getElementById("boundary").value="wrap";document.getElementById("boundary").dispatchEvent(new Event("change"));artistooLab.rpc("snapshot")');
  check(await evaluate('artistooLab.snapshot.boundary==="wrap"&&artistooLab.snapshot.time===35'),'Boundary switch resets with periodic geometry');
  await evaluate('document.getElementById("boundary").value="solid";document.querySelector("[data-scene=ecosystem]").click();artistooLab.rpc("snapshot")');
  await evaluate('artistooLab.rpc("advance",{steps:900})');
  const biology=await evaluate('({counters:artistooLab.snapshot.counters,damage:artistooLab.snapshot.cells.filter(c=>c.kind===2).map(c=>c.damage),fieldMax:Math.max(...artistooLab.snapshot.fields.danger.values)})');
  check(biology.counters.recognitions>0&&biology.counters.kills>0&&biology.counters.divisions>0&&biology.fieldMax>0,'End-to-end secretion, recognition, division and killing',biology);
  await shot('ecosystem');
  const png=await evaluate('document.getElementById("world").toDataURL("image/png").split(",")[1]');await writeFile('output/v2/cells.png',Buffer.from(png,'base64'));
  check(await evaluate('(()=>{artistooLab.render();const s=artistooLab.snapshot,ctx=document.getElementById("world").getContext("2d"),m=s.cells.find(c=>c.kind===1);for(let y=2;y<s.height-2;y++)for(let x=2;x<s.width-2;x++){const i=y*s.width+x;if(s.grid[i]===m.id&&s.grid[i-1]===m.id&&s.grid[i+1]===m.id&&s.grid[i-s.width]===m.id&&s.grid[i+s.width]===m.id){const p=ctx.getImageData(x*5+2,y*5+2,1,1).data;return p[0]===174&&p[1]===184&&p[2]===181;}}return false;})()'),'Cell interior uses fixed type color');
  const exported=await evaluate('artistooLab.rpc("export")');check(exported.history.length>10&&exported.events.some(e=>e.type==='recognize'),'Export includes parameters, population curve and interaction events');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await shot('mobile');
  check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile layout has no horizontal overflow');
  check(browser.errors.length===0&&browser.requests.length===0&&!(await evaluate('artistooLab.errors.length')),'Offline worker and UI have no runtime errors or external requests',{errors:browser.errors,requests:browser.requests});
}catch(e){failures.push({message:String(e),stack:e.stack});console.error(e);await shot('failure').catch(()=>{});}
finally{
  const engine=await readFile('vendor/artistoo.js'),hash=createHash('sha1').update(Buffer.from('blob '+engine.length+'\0')).update(engine).digest('hex');checks.push({name:'Official Artistoo engine is unchanged',passed:hash==='0ebf46bc3b16ea71eec7093c92070bc944a0c47e'});
  const report={passed:!failures.length&&checks.every(c=>c.passed),checks,failures,htmlSHA256:createHash('sha256').update(await readFile('dist/artistoo-playground.html')).digest('hex')};await writeFile('output/v2/browser-checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();if(!report.passed)process.exitCode=1;
}
