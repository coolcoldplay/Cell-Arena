import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const target=process.argv[2]||'dist/index.html',out='output/death-drag/'+(target.startsWith('https:')?'live':'local');await mkdir(out,{recursive:true});
const b=await openBrowser(target,9394,{gpu:true,initScript:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){const value=original.call(this,type,...args);if(type==='webgl2')window.testGL=value;return value;};`}),{evaluate,call}=b,checks=[];
const check=(ok,name,data={})=>{checks.push({name,passed:!!ok,...data});if(!ok)throw Error(name+' '+JSON.stringify(data));};
const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timed out: '+expression);};
const shot=async name=>{const image=await call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(image.data,'base64'));};
const pointer=async(type,x,y)=>{const p=await evaluate(`(()=>{const c=document.getElementById('world'),r=c.getBoundingClientRect(),s=artistooLab.snapshot;return{x:r.x+(${x}+.5)*r.width/s.width,y:r.y+(${y}+.5)*r.height/s.height};})()`);await call('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});};
const advance=steps=>evaluate(`artistooLab.rpc('advance',{steps:${steps}})`);
try{
  await wait('!!window.artistooLab?.snapshot&&artistooLab.snapshot.speed===4');await evaluate(`artistooLab.rpc('playing',{value:false})`);
  await evaluate(`(async()=>{await artistooLab.rpc('start',{scene:'empty',width:96,height:72,warmup:0,seed:17,settings:{growth:0,immuneGrowth:0,metabolism:0,apoptosis:0,kill:0,normalMotility:0,tumorMotility:0,immuneMotility:0}});window.dragID=await artistooLab.rpc('seed',{kind:3,x:12,y:36});for(const x of [30,45,60])await artistooLab.rpc('seed',{kind:1,x,y:36});await artistooLab.rpc('advance',{steps:40});artistooLab.setTool('move');document.getElementById('world').scrollIntoView({block:'center'});})()`);
  const cell=await evaluate('artistooLab.snapshot.cells.find(c=>c.id===dragID)');
  await evaluate(`artistooLab.rpc('playing',{value:true})`);await pointer('mousePressed',cell.nucleusX,cell.nucleusY);await wait('!artistooLab.snapshot.playing');
  // Density is a geometric measurement and follows moved bodies immediately;
  // oxygen, glucose, acid and all diffusing signals must remain frozen.
  await evaluate(`window.concentrations=()=>JSON.stringify(Object.fromEntries(Object.entries(artistooLab.snapshot.fields).filter(([key])=>key!=='density')));window.beforeDrag={time:artistooLab.snapshot.time,counters:JSON.stringify(artistooLab.snapshot.counters),fields:concentrations(),ids:artistooLab.snapshot.cells.map(c=>c.id)};`);
  await delay(350);
  for(let x=Math.round(cell.nucleusX)+5;x<=78;x+=5){await pointer('mouseMoved',x,36);await delay(40);}
  // Even explicit playback and single-step requests cannot progress biology
  // while the pointer holds a cell. The requested playback state resumes later.
  await evaluate(`artistooLab.rpc('playing',{value:true})`);const stepped=await advance(20);await delay(150);
  const held=await evaluate(`(()=>{const s=artistooLab.snapshot,m=s.cells.find(c=>c.id===dragID);return{time:s.time,before:beforeDrag.time,x:m.x,playing:s.playing,sameCounters:JSON.stringify(s.counters)===beforeDrag.counters,sameFields:concentrations()===beforeDrag.fields,sameIDs:JSON.stringify(s.cells.map(c=>c.id))===JSON.stringify(beforeDrag.ids),orphans:s.orphans};})()`);
  check(held.x>70&&!held.playing&&held.time===held.before&&held.sameCounters&&held.sameFields&&held.sameIDs&&held.orphans===0&&stepped===false,'Real pointer drag crosses neighbouring cells while the entire simulation stays paused',held);
  await shot('elastic-drag-held');await pointer('mouseReleased',78,36);await wait('artistooLab.snapshot.playing&&artistooLab.snapshot.time>beforeDrag.time');
  check(true,'Releasing a drag restores running playback');await evaluate(`artistooLab.rpc('playing',{value:false})`);
  const after=await evaluate('artistooLab.snapshot.cells.find(c=>c.id===dragID)');await pointer('mousePressed',after.nucleusX,after.nucleusY);await delay(100);await pointer('mouseReleased',after.nucleusX,after.nucleusY);await delay(150);
  check(await evaluate('!artistooLab.snapshot.playing'),'A drag that started paused stays paused after release');
  await evaluate(`artistooLab.rpc('playing',{value:true})`);await pointer('mousePressed',after.nucleusX,after.nucleusY);await wait('!artistooLab.snapshot.playing');await evaluate(`window.dispatchEvent(new Event('blur'))`);await wait('artistooLab.snapshot.playing');await pointer('mouseReleased',after.nucleusX,after.nucleusY);await evaluate(`artistooLab.rpc('playing',{value:false})`);
  check(true,'Losing focus releases the pause lock');
  await evaluate(`(async()=>{await artistooLab.rpc('beginDrag',{id:dragID,token:1000});await artistooLab.rpc('beginDrag',{id:dragID,token:1001});await artistooLab.rpc('endDrag',{token:1000});})()`);
  check(await advance(1)===false,'An old gesture cannot release a newer drag lock');await evaluate(`artistooLab.rpc('endDrag',{token:1001})`);
  // Natural events use the real recognition and death hazards, not a test-only
  // Worker command or a manually changed rendering snapshot.
  await evaluate(`(async()=>{await artistooLab.rpc('start',{scene:'empty',width:96,height:72,warmup:0,seed:17,settings:{growth:0,immuneGrowth:0,metabolism:0,apoptosis:30,tumorMotility:0}});for(let y=10;y<70;y+=17)for(let x=10;x<94;x+=17)await artistooLab.rpc('seed',{kind:2,x,y});document.getElementById('clear-overlays').click();window.deathFrames=[];window.saveFrame=title=>{artistooLab.render();deathFrames.push({title,image:document.getElementById('world').toDataURL('image/png')});};})()`);
  let dying;
  for(let n=0;n<150;n++){await advance(4);dying=await evaluate(`artistooLab.snapshot.cells.find(m=>m.deathCause==='spontaneous')`);if(dying)break;}
  check(!!dying&&dying.deathPhase==='shrinking','Natural spontaneous apoptosis exposes its shrinking phase');await evaluate(`saveFrame('自发凋亡：开始皱缩')`);await advance(12);
  const shrunk=await evaluate(`artistooLab.snapshot.cells.find(m=>m.id===${dying.id})`);
  check(!shrunk||shrunk.area<dying.area,'The apoptotic body loses actual lattice area',{before:dying.area,after:shrunk?.area||0});await evaluate(`saveFrame('自发凋亡：体积减小')`);
  await evaluate(`(async()=>{await artistooLab.rpc('start',{scene:'empty',width:96,height:72,warmup:0,seed:17,settings:{growth:0,immuneGrowth:0,metabolism:0,apoptosis:0,antigen:100,kill:2,normalMotility:0,tumorMotility:0,immuneMotility:0}});window.tumorID=await artistooLab.rpc('seed',{kind:2,x:40,y:36});await artistooLab.rpc('seed',{kind:3,x:49,y:36});})()`);
  let killed;
  for(let n=0;n<160;n++){await advance(4);killed=await evaluate(`artistooLab.snapshot.cells.find(m=>m.id===tumorID&&m.dying)`);if(killed)break;}
  check(!!killed&&killed.deathCause==='kill'&&killed.deathPhase==='rounding','Genuine antigen contact commits a kill with apoptosis set to zero',killed||{});
  await evaluate(`saveFrame('免疫杀伤：圆化、开始变为橙黄色')`);await advance(64);
  const swollen=await evaluate(`artistooLab.snapshot.cells.find(m=>m.id===tumorID)`);
  check(swollen?.deathIntact&&swollen.deathPhase==='swelling'&&swollen.area>killed.area*1.05,'The killed body remains occupied, rounds and swells before rupture',{before:killed.area,after:swollen?.area,progress:swollen?.deathProgress});await evaluate(`saveFrame('免疫杀伤：橙黄色肿胀')`);
  // Sample actual pixels before context loss; the same pending death must be
  // rendered identically by GPU and CPU, with no biological time advance.
  await evaluate(`document.getElementById('cell-seams').checked=false;document.getElementById('nuclei').checked=false;artistooLab.render();window.samples=[];const c=document.getElementById('world'),ctx=c.getContext('2d'),s=artistooLab.snapshot;for(let y=4;y<s.height-4;y+=2)for(let x=4;x<s.width-4;x+=2){const px=Math.floor((x+.5)*c.width/s.width),py=Math.floor((y+.5)*c.height/s.height);samples.push([px,py,[...ctx.getImageData(px,py,1,1).data]]);}window.usedGPU=artistooLab.renderer.gpu;testGL.getExtension('WEBGL_lose_context').loseContext();`);await delay(100);await evaluate('artistooLab.render()');
  const parity=await evaluate(`({wasGPU:usedGPU,gpu:artistooLab.renderer.gpu,maxError:Math.max(...samples.flatMap(([x,y,old])=>[...document.getElementById('world').getContext('2d').getImageData(x,y,1,1).data].map((v,k)=>Math.abs(v-old[k]))))})`);
  check(parity.wasGPU&&!parity.gpu&&parity.maxError<=2,'The death gradient agrees between GPU and Canvas rendering',parity);
  const amber=await evaluate(`(()=>{const s=artistooLab.snapshot,c=document.getElementById('world'),ctx=c.getContext('2d');for(let y=2;y<s.height-2;y++)for(let x=2;x<s.width-2;x++){const q=y*s.width+x;if(s.grid[q]===tumorID&&[q-1,q+1,q-s.width,q+s.width].every(j=>s.grid[j]===tumorID)){return [...ctx.getImageData(Math.floor((x+.5)*c.width/s.width),Math.floor((y+.5)*c.height/s.height),1,1).data].slice(0,3);}}return[];})()`);
  check(amber[0]>amber[1]+25&&amber[1]>90&&amber[2]<amber[1]*.5,'Actual killed-cell pixels become orange-yellow, distinct from inactive pink immune cells',{amber});
  await evaluate(`document.getElementById('cell-seams').checked=true;document.getElementById('nuclei').checked=true;`);
  for(let n=0;n<30;n++){await advance(2);if(await evaluate('!artistooLab.snapshot.cells.some(m=>m.id===tumorID)'))break;}
  const cleared=await evaluate(`({effects:artistooLab.snapshot.deathEffects,counters:artistooLab.snapshot.counters,time:artistooLab.snapshot.time,remaining:artistooLab.snapshot.cells.length})`);
  check(cleared.effects.length===1&&cleared.counters.kills===1&&cleared.counters.apoptosis===0&&cleared.remaining===1,'Rupture clears the body exactly once, emits visible debris and increments only immune kills',cleared);await evaluate(`saveFrame('免疫杀伤：膜破裂、碎片消退')`);
  await delay(250);check(await evaluate(`artistooLab.snapshot.time===${cleared.time}&&artistooLab.snapshot.deathEffects.length===1`),'Rupture effects freeze during pause');
  await advance(60);check(await evaluate('artistooLab.snapshot.deathEffects.length===0&&artistooLab.snapshot.counters.kills===1'),'Debris expires in simulation time without another death');
  await evaluate(`(()=>{const gallery=document.createElement('section');gallery.id='death-gallery';gallery.style.cssText='position:absolute;inset:0 auto auto 0;width:1440px;min-height:1000px;background:#111a20;z-index:10000;padding:24px;color:#e5ece7';const title=document.createElement('h1');title.textContent='Cell-Arena · 实际模拟中的死亡过程';gallery.append(title);const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:18px';for(const f of deathFrames){const card=document.createElement('div'),h=document.createElement('h3'),img=document.createElement('img');h.textContent=f.title;img.src=f.image;img.style.cssText='width:100%;height:340px;object-fit:contain;background:#f3f6f2';card.append(h,img);grid.append(card);}gallery.append(grid);document.body.append(gallery);window.scrollTo(0,0);})()`);await delay(120);await shot('death-comparison');await evaluate(`document.getElementById('death-gallery').remove()`);
  check(b.errors.length===0&&await evaluate('artistooLab.errors.length===0'),'No browser or Worker errors');
}catch(error){console.error(error);checks.push({passed:false,error:String(error)});process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
