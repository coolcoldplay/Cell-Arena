import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const target=process.argv[2]||'http://127.0.0.1:4175/',out='output/auto-random/'+(target.startsWith('https:')?'live':'local');await mkdir(out,{recursive:true});
const b=await openBrowser(target,9474,{gpu:true,initScript:`try{if(!sessionStorage.getItem('auto-random-test-init')){localStorage.clear();sessionStorage.setItem('auto-random-test-init','1');}}catch{}`}),checks=[];
function check(name,ok,details={}){checks.push({name,passed:!!ok,...details});assert.ok(ok,name);}
async function wait(expr){for(let i=0;i<300;i++){if(await b.evaluate(expr))return;await delay(100);}throw Error('Timed out: '+expr);}
async function shot(name){const r=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(r.data,'base64'));}
const setMinutes=`window.setMinutes=value=>{const e=document.getElementById('auto-random-minutes');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();};`;
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');await b.evaluate(setMinutes);
  check('New visitors start with auto-randomization disabled',await b.evaluate(`artistooLab.autoRandom.minutes===0&&document.getElementById('auto-random-minutes').value==='0'`));
  for(const lang of ['zh','en']){
    await b.evaluate(`document.getElementById('language').value='${lang}';document.getElementById('language').dispatchEvent(new Event('change'));`);await delay(100);
    const rect=await b.evaluate(`(()=>{const a=document.getElementById('shuffle').getBoundingClientRect(),b=document.getElementById('auto-random-minutes').getBoundingClientRect();return {sameRow:Math.abs(a.y+a.height/2-b.y-b.height/2)<2,inside:b.right<=innerWidth&&a.left>=0,width:document.documentElement.scrollWidth};})()`);
    check(lang+' desktop places the minute input beside Randomize with no overflow',rect.sameRow&&rect.inside&&rect.width<=1440,rect);await shot('desktop-'+lang);
  }
  await b.evaluate(`(async()=>{await artistooLab.rpc('start',{scene:'empty',seed:17,worldWidth:96,worldHeight:72,refinement:1,warmup:0,settings:{metabolism:0,stressMutation:0}});await artistooLab.rpc('seed',{kind:1,x:45,y:35});setMinutes(.02);window.idleRevision=artistooLab.snapshot.revision;window.idleSeed=artistooLab.snapshot.seed;})()`);
  await delay(1600);check('Paused scenes do not auto-restart after the waiting duration',await b.evaluate(`artistooLab.snapshot.revision===idleRevision&&artistooLab.autoRandom.elapsedMs===0`));
  await b.evaluate(`artistooLab.rpc('playing',{value:true})`);await wait(`artistooLab.snapshot.revision>idleRevision&&!artistooLab.autoRandom.busy`);await b.evaluate(`artistooLab.rpc('playing',{value:false})`);
  const restarted=await b.evaluate(`({scene:artistooLab.snapshot.scene,seed:artistooLab.snapshot.seed,old:idleSeed,cells:artistooLab.snapshot.cells.length,minutes:artistooLab.autoRandom.minutes,settings:artistooLab.snapshot.settings.supply})`);
  check('Running cells with unchanged state trigger one fresh, bounded random setup',restarted.scene==='random'&&restarted.seed!==restarted.old&&restarted.cells>0&&restarted.minutes===.02&&restarted.settings>=2.3&&restarted.settings<=2.8,restarted);
  await b.evaluate(`setMinutes(0);window.stableRevision=artistooLab.snapshot.revision`);await delay(1400);
  check('Zero cancels further automatic rounds',await b.evaluate('artistooLab.snapshot.revision===stableRevision&&!artistooLab.autoRandom.fired'));
  await b.evaluate(`(async()=>{await artistooLab.rpc('start',{scene:'empty',seed:18,worldWidth:96,worldHeight:72,refinement:1,warmup:0});setMinutes(5);window.emptyRevision=artistooLab.snapshot.revision;})()`);
  await delay(900);check('Empty custom editing remains paused and is not replaced',await b.evaluate('artistooLab.snapshot.revision===emptyRevision&&!artistooLab.snapshot.playing'));
  const emptyAt=Date.now();await b.evaluate(`artistooLab.rpc('playing',{value:true})`);await wait('artistooLab.snapshot.revision>emptyRevision&&!artistooLab.autoRandom.busy');await b.evaluate(`artistooLab.rpc('playing',{value:false})`);
  check('An enabled empty running arena starts a new round without waiting five minutes',Date.now()-emptyAt<5000&&await b.evaluate(`artistooLab.snapshot.scene==='random'&&artistooLab.snapshot.cells.length>0`),{elapsedMs:Date.now()-emptyAt});
  await b.evaluate(`(async()=>{setMinutes(2.5);const e=document.getElementById('body-feather');e.value=0;e.dispatchEvent(new Event('input'));window.autoExport=await artistooLab.exportData();setMinutes(0);await artistooLab.importData(autoExport);})()`);
  check('Parameter export/import preserves minutes and the no-gradient endpoint while remaining paused',await b.evaluate(`autoExport.display.autoRandomMinutes===2.5&&autoExport.display.edgeFade===0&&artistooLab.autoRandom.minutes===2.5&&document.getElementById('body-feather').value==='0'&&!artistooLab.snapshot.playing`));
  await b.call('Page.reload');await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');await b.evaluate(setMinutes);
  check('Explicit auto-round and gradient choices survive reload',await b.evaluate(`artistooLab.autoRandom.minutes===2.5&&document.getElementById('body-feather').value==='0'`));
  await b.evaluate('setMinutes(0)');
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await b.evaluate(`document.getElementById('mobile-expand').click();document.getElementById('mobile-session').open=true;document.getElementById('auto-random-minutes').scrollIntoView({block:'center'});`);await delay(150);
  const phone=await b.evaluate(`(()=>{const a=document.getElementById('shuffle').getBoundingClientRect(),b=document.getElementById('auto-random-minutes').getBoundingClientRect();return {visible:document.getElementById('auto-random-minutes').checkVisibility(),sameRow:Math.abs(a.y+a.height/2-b.y-b.height/2)<2,height:b.height,right:b.right,width:document.documentElement.scrollWidth};})()`);
  check('Mobile moves Randomize and its editable minutes together with usable touch targets',phone.visible&&phone.sameRow&&phone.height>=44&&phone.right<=390&&phone.width<=392,phone);await shot('mobile-controls');
  await b.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await delay(150);
  check('Returning to desktop restores both controls to the transport row',await b.evaluate(`document.getElementById('auto-random-minutes').closest('.transport')!==null&&document.getElementById('shuffle').closest('.transport')!==null`));
  check('No application or browser errors',!b.errors.length&&await b.evaluate('artistooLab.errors.length===0'),{errors:b.errors});
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify({target,checks},null,2));await writeFile(out+'/tested-manifest.json',await readFile('dist/manifest.json'));console.log(JSON.stringify(checks,null,2));await b.close();}
