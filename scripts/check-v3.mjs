import {openBrowser,delay} from './browser-session.mjs';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const browser=await openBrowser('dist/artistoo-playground.html',9363),checks=[];
const testedManifest=JSON.parse(await readFile('dist/manifest.json','utf8'));
const {evaluate,call}=browser;
const check=(ok,name,detail={})=>{checks.push({name,passed:!!ok,...detail});if(!ok)throw Error(name+' '+JSON.stringify(detail));};
await mkdir('output/v3',{recursive:true});
const shot=async name=>{await evaluate('artistooLab.render();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const r=await call('Page.captureScreenshot',{format:'png'});await writeFile('output/v3/'+name+'.png',Buffer.from(r.data,'base64'));};
const mouse=async(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});
const click=async(x,y)=>{await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y);await delay(100);};
const point=async(x,y)=>evaluate(`(()=>{const s=artistooLab.snapshot,r=document.getElementById('world').getBoundingClientRect();return {x:r.x+(${x}+.5)/s.width*r.width,y:r.y+(${y}+.5)/s.height*r.height};})()`);
try{
  for(let i=0;i<200;i++){if(await evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await evaluate('artistooLab.rpc("playing",{value:false})');
  const initial=await evaluate('({scene:artistooLab.snapshot.scene,width:artistooLab.snapshot.width,height:artistooLab.snapshot.height,refinement:artistooLab.snapshot.refinement,kinds:[...new Set(artistooLab.snapshot.cells.map(c=>c.kind))],worker:!!document.getElementById("worker-source"),mainCPM:typeof CPM})');
  check(initial.scene==='ecosystem'&&initial.width===360&&initial.height===270&&initial.kinds.length===3&&initial.worker&&initial.mainCPM==='undefined','Fine-grid ecosystem starts in a worker',initial);
  await evaluate('document.getElementById("supply").value=1.35;document.getElementById("supply").dispatchEvent(new Event("input"));artistooLab.rpc("snapshot")');
  check(await evaluate('artistooLab.snapshot.settings.supply===1.35'),'Metabolism slider updates actual model');
  await evaluate('document.getElementById("world-size").value="320";document.getElementById("refinement").value="2";document.getElementById("apply-grid").click();artistooLab.rpc("snapshot")');
  check(await evaluate('artistooLab.snapshot.width===640&&artistooLab.snapshot.height===480&&artistooLab.snapshot.fieldScale===8'),'World size and refinement change real lattice independently');
  await evaluate('document.getElementById("world-size").value="192";document.getElementById("refinement").value="1.5";document.getElementById("apply-grid").click();artistooLab.rpc("snapshot")');
  const speeds=[];
  for(const speed of [.5,2,4]){
    await evaluate(`artistooLab.rpc('start',{scene:'ecosystem',seed:17,worldWidth:192,worldHeight:144,refinement:1.5}).then(()=>artistooLab.rpc('speed',{value:${speed}})).then(()=>{window.firstTime=artistooLab.snapshot.time;window.frames=0;window.stopFrames=false;function sample(){frames++;if(!stopFrames)requestAnimationFrame(sample);}requestAnimationFrame(sample);return artistooLab.rpc('playing',{value:true})})`);
    const begin=performance.now();await delay(2600);
    const live=await evaluate('({limited:artistooLab.snapshot.limited,rate:artistooLab.snapshot.rate,target:artistooLab.snapshot.targetRate})');
    await evaluate('artistooLab.rpc("playing",{value:false})');const elapsed=performance.now()-begin,result=await evaluate('stopFrames=true;({steps:artistooLab.snapshot.time-firstTime,frames})');
    speeds.push({speed,mcsPerSecond:result.steps*1000/elapsed,uiFPS:result.frames*1000/elapsed,...live});
  }
  check(speeds[1].mcsPerSecond>speeds[0].mcsPerSecond*1.5,'Playback multiplier changes actual model time; compute saturation is reported',{speeds});
  check(speeds.filter(s=>s.mcsPerSecond<s.target*.7).every(s=>s.limited),'Sub-target throughput is explicitly marked CPU limited',{speeds});
  check(speeds.every(s=>s.uiFPS>35),'UI remains responsive at fine lattice resolution',{speeds});
  await evaluate('artistooLab.rpc("start",{scene:"empty",width:96,height:72,refinement:1,warmup:0,settings:{growth:0,apoptosis:0,metabolism:0}})');
  await evaluate('document.querySelector("[data-tool=seed]").click();document.getElementById("seed-kind").value="3"');
  let p=await point(20,25);await click(p.x,p.y);
  const id=await evaluate('artistooLab.snapshot.cells[0]?.id');check(!!id,'Mouse seeds chosen immune cell');
  await evaluate('document.querySelector("[data-tool=move]").click();window.area=artistooLab.snapshot.cells[0].area');
  await mouse('mousePressed',p.x,p.y);await delay(60);const p2=await point(29,25);await mouse('mouseMoved',p2.x,p2.y);await delay(80);await mouse('mouseReleased',p2.x,p2.y);await delay(120);
  check(await evaluate('artistooLab.snapshot.cells[0].x>27&&artistooLab.snapshot.cells[0].area===area&&!artistooLab.snapshot.playing'),'Mouse moves actual body and preserves pause state');
  await evaluate('document.querySelector("[data-tool=signal]").click();document.getElementById("signal-kind").value="trail"');p=await point(40,25);await click(p.x,p.y);
  check(await evaluate('artistooLab.snapshot.fields.trail.values.some(v=>v>0)&&artistooLab.snapshot.fields.danger.values.every(v=>v===0)'),'Mouse deposits selected recruitment channel');
  await evaluate('document.querySelector("[data-tool=wall]").click()');p=await point(55,8);const end=await point(55,55);await mouse('mousePressed',p.x,p.y);await mouse('mouseMoved',end.x,end.y);await delay(80);await mouse('mouseReleased',end.x,end.y);await delay(120);
  const wallCount=await evaluate('window.walls=[...artistooLab.snapshot.walls].map((v,i)=>v?i:-1).filter(i=>i>=0);walls.length');
  check(wallCount>100,'Mouse paints explicit solid walls',{wallCount});
  await evaluate('artistooLab.rpc("advance",{steps:150})');check(await evaluate('walls.every(i=>artistooLab.snapshot.walls[i]===1)&&artistooLab.snapshot.orphans===0'),'Solid obstacles stay fixed without ghost walls');
  // Zoom changes display geometry only. Pointer coordinates must remain correct.
  await evaluate('document.getElementById("zoom").value="200";document.getElementById("zoom").dispatchEvent(new Event("change"));document.querySelector("[data-tool=seed]").click()');p=await point(12,12);await click(p.x,p.y);
  check(await evaluate('artistooLab.snapshot.cells.length===2&&artistooLab.snapshot.grid[12*96+12]>0'),'Mouse coordinates remain accurate at 200% zoom');
  await evaluate('document.getElementById("zoom").value="100";document.getElementById("zoom").dispatchEvent(new Event("change"));document.getElementById("boundary").value="wrap";document.getElementById("boundary").dispatchEvent(new Event("change"));artistooLab.rpc("snapshot")');
  check(await evaluate('artistooLab.snapshot.boundary==="wrap"&&artistooLab.snapshot.time===0'),'Periodic boundary reinitializes consistently in the empty interaction fixture');
  await evaluate('document.getElementById("boundary").value="solid";document.querySelector("[data-scene=ecosystem]").click();artistooLab.rpc("snapshot")');
  await evaluate('artistooLab.rpc("advance",{steps:1500})');
  const bio=await evaluate('({counters:artistooLab.snapshot.counters,cells:artistooLab.snapshot.cells.length,orphans:artistooLab.snapshot.orphans,genomes:artistooLab.snapshot.cells.filter(c=>c.kind===2).every(c=>c.genome&&Number.isFinite(c.genome.invasion)),budgets:artistooLab.snapshot.cells.filter(c=>c.kind===3).every(c=>c.divisionsLeft>=0)})');
  check(bio.counters.recognitions>0&&bio.counters.kills>0&&bio.counters.divisions>0&&bio.counters.immuneDivisions>0&&bio.counters.mutations>0&&bio.orphans===0&&bio.genomes&&bio.budgets,'End-to-end recruitment, clonal expansion, mutation and killing',bio);
  // Inspect real pixels: activity is rendered inside protrusions, not just at boundaries.
  await evaluate('document.getElementById("field-view").value="none";for(const id of ["nuclei","antigen-marks","cycle-marks"])document.getElementById(id).checked=false;document.getElementById("edge-activity").checked=true;artistooLab.render()');
  const pixels=await evaluate(`(()=>{const s=artistooLab.snapshot,c=document.getElementById('world'),ctx=c.getContext('2d'),scale=c.width/s.width,meta=new Map(s.cells.map(m=>[m.id,m]));let interior=0,plainEdges=0;const colors=[null,[174,184,181],[48,56,65],[190,65,78]];
    for(let y=2;y<s.height-2;y++)for(let x=2;x<s.width-2;x++){const q=y*s.width+x,m=meta.get(s.grid[q]);if(!m||m.dying)continue;const inside=[q-1,q+1,q-s.width,q+s.width].every(j=>s.grid[j]===m.id),a=s.activity[q],rgb=ctx.getImageData(Math.floor((x+.5)*scale),Math.floor((y+.5)*scale),1,1).data;
      if(inside&&a>0&&rgb[0]===Math.min(255,a*2)&&rgb[1]===Math.min(255,(255-a)*2)&&rgb[2]===0)interior++;
      if(!inside&&!a&&colors[m.kind].every((v,k)=>v===rgb[k]))plainEdges++;
    }return {interior,plainEdges};})()`);
  check(pixels.interior>10&&pixels.plainEdges>50,'Meaningful Act colors include interior protrusions and zero-activity edges have no gray ring',pixels);
  await shot('ecosystem');
  let png=await evaluate('document.getElementById("world").toDataURL("image/png").split(",")[1]');await writeFile('output/v3/ecosystem-cells.png',Buffer.from(png,'base64'));
  const exported=await evaluate('artistooLab.rpc("export")');check(exported.version==='3.0.0'&&exported.lineage.length>0&&exported.cells.some(c=>c.genome)&&exported.events.some(e=>e.type==='recognize'),'Export carries phenotypes, ancestry, settings and interaction history');
  await evaluate('document.querySelector("[data-scene=stress]").click();artistooLab.rpc("snapshot")');
  const samples=[];for(let n=0;n<6;n++){await evaluate('artistooLab.rpc("advance",{steps:200})');samples.push(await evaluate('({time:artistooLab.snapshot.time,deaths:artistooLab.snapshot.counters.environment,oxygen:Math.min(...artistooLab.snapshot.fields.oxygen.values),acid:Math.max(...artistooLab.snapshot.fields.acid.values),glucose:Math.min(...artistooLab.snapshot.fields.glucose.values)})'));}
  const env={deaths:samples.at(-1).deaths,oxygen:Math.min(...samples.map(s=>s.oxygen)),glucose:Math.min(...samples.map(s=>s.glucose)),acid:Math.max(...samples.map(s=>s.acid)),samples};
  check(env.deaths>0&&env.oxygen<.3&&env.glucose<.3&&env.acid>.5,'Dense stressed scene develops sustained metabolic injury before cell clearance and recovery',env);
  for(const view of ['oxygen','glucose','acid','density']){await evaluate(`document.getElementById('field-view').value='${view}';artistooLab.render()`);check(await evaluate('!document.getElementById("field-legend").textContent.includes("undefined")'),'Heatmap legend: '+view);}
  await evaluate('document.getElementById("field-view").value="acid";artistooLab.render()');await shot('acid');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
  check(await evaluate('document.documentElement.scrollWidth<=392'),'Mobile layout has no horizontal overflow');await shot('mobile');
  check(browser.errors.length===0&&(await evaluate('artistooLab.errors.length'))===0,'No browser runtime errors');check(browser.requests.length===0,'Standalone artifact works without remote requests');
  const vendor=await readFile('vendor/artistoo.js'),hash=createHash('sha256').update(vendor).digest('hex');check(hash==='cf324da4b8a475853f02bcc842662ade65140132fe11d6db4e034ea17a5ca7e5','Official Artistoo bundle remains unchanged');
}catch(error){checks.push({passed:false,error:String(error)});process.exitCode=1;console.error(error);}
finally{await writeFile('output/v3/browser-checks.json',JSON.stringify(checks,null,2));await writeFile('output/v3/tested-manifest.json',JSON.stringify(testedManifest,null,2));console.log(JSON.stringify(checks,null,2));await browser.close();}
