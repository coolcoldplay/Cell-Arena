import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.argv[3]||'output/adaptive/checks';await mkdir(out,{recursive:true});
const b=await openBrowser(process.argv[2]||'dist/index.html',9451,{gpu:true,initScript:`
window.adaptiveProbe={delay:0,history:0};
const draw=CanvasRenderingContext2D.prototype.drawImage,clear=CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.drawImage=function(...a){if(this.canvas.id==='world'&&adaptiveProbe.delay){const until=performance.now()+adaptiveProbe.delay;while(performance.now()<until){}}return draw.apply(this,a);};
CanvasRenderingContext2D.prototype.clearRect=function(...a){if(this.canvas.id==='history')adaptiveProbe.history++;return clear.apply(this,a);};
`}),checks=[];
function check(name,passed,detail={}){checks.push({name,passed:!!passed,...detail});assert.ok(passed,name);}
async function wait(expr){for(let i=0;i<300;i++){if(await b.evaluate(expr))return;await delay(100);}throw Error('Timed out: '+expr);}
async function mode(name){await b.evaluate(`document.getElementById('performance-mode').value='${name}';document.getElementById('performance-mode').dispatchEvent(new Event('change'))`);await delay(100);}
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');
  check('Four performance modes are available without altering model controls',await b.evaluate(`document.getElementById('performance-mode').options.length===4&&!!artistooLab.performance`));
  await b.evaluate(`artistooLab.rpc('playing',{value:false}).then(()=>artistooLab.rpc('backend',{mode:'cpu'}))`);
  let reference;
  for(const selectedMode of ['auto','power','smooth','quality']){
    await mode(selectedMode);
    await b.evaluate(`artistooLab.rpc('start',{scene:'hot',seed:29,worldWidth:192,worldHeight:144,refinement:1,warmup:0}).then(()=>artistooLab.rpc('advance',{steps:120}))`);
    const state=await b.evaluate(`(()=>{const s=artistooLab.snapshot;return JSON.stringify({time:s.time,grid:Array.from(s.grid),cells:s.cells,fields:Object.fromEntries(Object.entries(s.fields).map(([k,f])=>[k,Array.from(f.values)])),counters:s.counters,history:s.history});})()`);
    reference??=state;check('Same fixed-MCS model state in '+selectedMode,state===reference);
  }
  await mode('auto');await b.evaluate(`document.getElementById('statistics-panel').open=false;artistooLab.rpc('speed',{value:8}).then(()=>artistooLab.rpc('playing',{value:true}))`);await delay(500);
  await b.evaluate('adaptiveProbe.history=0');await delay(1500);
  check('Collapsed history is not redrawn while the simulation advances',await b.evaluate('adaptiveProbe.history===0&&artistooLab.snapshot.time>120'));
  await b.evaluate(`document.getElementById('statistics-expand').click()`);await delay(500);
  const firstHistory=await b.evaluate('adaptiveProbe.history');await delay(400);
  check('Opening statistics immediately restores the current live chart',await b.evaluate(`adaptiveProbe.history>${firstHistory}&&document.getElementById('normal-count').textContent!=='—'`));
  await b.evaluate(`document.getElementById('statistics-expand').click();document.getElementById('statistics-panel').open=false;adaptiveProbe.delay=30;document.getElementById('recheck-performance').click()`);await delay(8500);
  check('Sustained render overload triggers measured adaptation',await b.evaluate(`artistooLab.performance.resolutionLevel>0&&artistooLab.performance.changes>0`),await b.evaluate('artistooLab.performance'));
  await b.evaluate(`adaptiveProbe.delay=0;artistooLab.rpc('playing',{value:false})`);
  await b.evaluate(`document.getElementById('render-resolution').value='2560';document.getElementById('render-resolution').dispatchEvent(new Event('change'));artistooLab.render()`);
  check('Explicit display resolution survives adaptation',await b.evaluate('document.getElementById("world").width===2560'));
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await b.evaluate(`document.getElementById('render-resolution').value='auto';document.getElementById('render-resolution').dispatchEvent(new Event('change'))`);await mode('auto');await delay(500);await b.evaluate('artistooLab.render()');
  check('High-DPI mobile uses a bounded canvas and keeps physical lattice',await b.evaluate(`world.width<=1200&&artistooLab.snapshot.width===192&&document.documentElement.scrollWidth<=innerWidth+1`));
  await b.evaluate(`document.getElementById('mobile-expand').click()`);await delay(700);
  check('Expanded mobile panel lowers preview publication rate',await b.evaluate('artistooLab.performance.preview&&artistooLab.performance.fps<=15'));
  await b.evaluate(`document.getElementById('mobile-expand').click()`);await delay(700);
  check('Returning to the arena restores the normal publication cap',await b.evaluate('!artistooLab.performance.preview&&artistooLab.performance.fps===60'));
  await b.evaluate(`document.getElementById('language').value='en';document.getElementById('language').dispatchEvent(new Event('change'))`);await delay(200);
  check('Performance modes and status support English',await b.evaluate(`document.getElementById('performance-mode').selectedOptions[0].textContent==='Automatic balance'&&!/[\u4e00-\u9fff]/.test(document.getElementById('adaptive-status').textContent)`));
  await mode('power');await b.call('Page.reload');await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');
  check('Device-local mode preference survives reload',await b.evaluate('artistooLab.performance.mode==="power"'));
  await b.evaluate(`artistooLab.rpc('playing',{value:false})`);
  check('No browser or model runtime errors',b.errors.length===0&&(await b.evaluate('artistooLab.errors.length'))===0,{errors:b.errors});
  const shot=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/mobile.png',Buffer.from(shot.data,'base64'));
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
