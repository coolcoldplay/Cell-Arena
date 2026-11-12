import {openBrowser,delay} from './browser-session.mjs';import {readFile,writeFile} from 'node:fs/promises';
const browser=await openBrowser('dist/artistoo-playground.html',9373,{gpu:true}),checks=[];
const {evaluate}=browser;const check=(ok,name,detail={})=>{checks.push({name,passed:!!ok,...detail});if(!ok)throw Error(name+' '+JSON.stringify(detail));};
try{
  for(let i=0;i<120;i++){if(await evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}await evaluate('artistooLab.rpc("playing",{value:false})');
  check(await evaluate('artistooLab.snapshot.kernel==="wasm"&&artistooLab.renderer.gpu'),'WASM mechanics and hardware WebGL2 rendering initialize',await evaluate('artistooLab.renderer'));
  check(await evaluate('!document.getElementById("tumor-activity").checked&&!document.getElementById("immune-activity").checked'),'Tumor and immune Act colors start disabled');
  await evaluate('artistooLab.rpc("start",{scene:"ecosystem",seed:17}).then(()=>document.getElementById("clear-overlays").click())');
  await evaluate(`window.sampleColors=()=>{const s=artistooLab.snapshot,c=document.getElementById('world'),ctx=c.getContext('2d'),z=c.width/s.width,meta=new Map(s.cells.map(m=>[m.id,m])),counts={plain:[0,0,0,0],act:[0,0,0,0]};const rgb=[[204,204,204],[204,204,204],[0,0,0],[153,0,0]];
    for(let y=1;y<s.height-1;y++)for(let x=1;x<s.width-1;x++){const q=y*s.width+x,m=meta.get(s.grid[q]);if(!m||m.dying||![q-1,q+1,q-s.width,q+s.width].every(i=>s.grid[i]===m.id))continue;const v=ctx.getImageData(Math.floor((x+.5)*z),Math.floor((y+.5)*z),1,1).data;
    if(CellLabDisplay.bodyColor(m).every((n,k)=>n===v[k]))counts.plain[m.kind]++;const a=s.activity[q];if(a>0&&v[0]===Math.min(255,a*2)&&v[1]===Math.min(255,(255-a)*2)&&v[2]===0)counts.act[m.kind]++;}return counts;};
    window.toggle=(kind,value)=>{document.getElementById(kind+'-activity').checked=value;artistooLab.render();};document.getElementById('cell-seams').checked=false;artistooLab.render();window.beforeTime=artistooLab.snapshot.time;window.beforeGrid=Array.from(artistooLab.snapshot.grid).join(',');`);
  const plain=await evaluate('sampleColors()');check(plain.plain[2]>100&&plain.plain[3]>50&&plain.act.every(n=>n===0),'Classic body colors are visible without gradient rings',plain);
  await evaluate('toggle("immune",true)');const ctl=await evaluate('sampleColors()');check(ctl.act[3]>10&&ctl.act[2]===0&&ctl.plain[2]>100,'Immune Act can be enabled independently',ctl);
  await evaluate('toggle("immune",false);toggle("tumor",true)');const tumor=await evaluate('sampleColors()');check(tumor.act[2]>10&&tumor.act[3]===0&&tumor.plain[3]>50,'Tumor Act can be enabled independently',tumor);
  check(await evaluate('artistooLab.snapshot.time===beforeTime&&Array.from(artistooLab.snapshot.grid).join(",")===beforeGrid'),'Display switches do not advance or mutate mechanics');
  await evaluate('toggle("tumor",false);document.getElementById("nuclei").checked=true;artistooLab.render()');check(await evaluate('artistooLab.snapshot.cells.every(m=>m.hasNucleus&&Number.isFinite(m.nucleusX)&&m.sectionFraction>=.5)'),'Nuclear occupancy and slice budgets reach the debug view');
  await evaluate('artistooLab.rpc("backend",{mode:"gpu"})');check(await evaluate('artistooLab.snapshot.compute.active==="gpu"'),'Worker explicitly enables real WebGPU field computation',await evaluate('artistooLab.snapshot.compute'));
  // The command queue must not mutate a grid while a field readback is pending.
  const serialized=await evaluate(`(async()=>{const t=artistooLab.snapshot.time;await Promise.all([artistooLab.rpc('advance',{steps:16}),artistooLab.rpc('set',{name:'supply',value:1.25}),artistooLab.rpc('backend',{mode:'cpu'})]);return {delta:artistooLab.snapshot.time-t,supply:artistooLab.snapshot.settings.supply,active:artistooLab.snapshot.compute.active};})()`);
  check(serialized.delta===16&&serialized.supply===1.25&&serialized.active==='cpu','Commands serialize across asynchronous GPU steps',serialized);
  const sources=await Promise.all(['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/gpu-fields.js'].map(f=>readFile(f,'utf8')));await evaluate(sources.join('\n'));
  const parity=await evaluate(`(async()=>{
    const results=[];for(const boundary of ['solid','wrap']){const opts={width:80,height:56,scene:'empty',warmup:0,boundary},a=new CellLab.Simulation(opts),b=new CellLab.Simulation(opts);
      for(const s of [a,b]){s.seed(2,24,25,8);s.seed(3,45,25,4);for(let y=0;y<56;y++)s.paint(38,y,0,false,false);s.rebuildMask();for(const key of ['oxygen','glucose','acid'])for(let i=0;i<s.fields[key].values.length;i++)s.fields[key].values[i]=s.fields[key].blocked[i]?0:.1+((i*17)%67)/80;s.prepareEnvironment();}
      const gpu=await CellLabGPU.GPUFields.create(b);for(let i=0;i<20;i++){a.integrateEnvironment(4);await gpu.step(b,4);}let error=0;for(const k of ['oxygen','glucose','acid'])for(let i=0;i<a.fields[k].values.length;i++)error=Math.max(error,Math.abs(a.fields[k].values[i]-b.fields[k].values[i]));
      const zero=a.fields.oxygen.blocked.every((v,i)=>!v||b.fields.oxygen.values[i]===0);results.push({boundary,error,blockedZero:zero});gpu.destroy();}
    const s=new CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0}),backend=new CellLabGPU.ComputeBackend();s.seed(2,30,24,8);s.prepareEnvironment();const before=s.fields.oxygen.values.slice();await backend.configure(s,'auto');const calibrationUntouched=before.every((v,i)=>v===s.fields.oxygen.values[i]);
    await backend.configure(s,'gpu');backend.gpu.destroy();await new Promise(r=>setTimeout(r,40));const ref=s.fields.oxygen.values.slice();await backend.step(s,4);const lossFallback=backend.active==='cpu'&&s.fields.oxygen.values.some((v,i)=>v<ref[i]);return {results,calibrationUntouched,lossFallback};})()`);
  check(parity.results.every(r=>r.error<2e-5&&r.blockedZero),'WebGPU / CPU fields agree over 80 MCS, including walls and periodic boundaries',parity);
  check(parity.calibrationUntouched,'Automatic backend benchmark restores simulation fields');check(parity.lossFallback,'GPU device loss recomputes the current field step on CPU');
  check(browser.errors.length===0&&(await evaluate('artistooLab.errors.length'))===0,'GPU paths produce no browser runtime errors');
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile('output/v4/gpu-checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await browser.close();}
