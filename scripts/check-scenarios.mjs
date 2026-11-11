// Browser wiring checks; seeded long-run ecology is tested by the model suite.
import {openBrowser,delay} from './browser-session.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='output/scenario-calibration/browser';await mkdir(out,{recursive:true});
const b=await openBrowser('dist/index.html',9384,{gpu:true}),checks=[];
function check(ok,name,details={}){checks.push({name,passed:!!ok,...details});assert.ok(ok,name);}
async function wait(expr){for(let i=0;i<300;i++){if(await b.evaluate(expr))return;await delay(100);}throw Error('Timed out: '+expr);}
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');
  for(const [scene,tumor,immune,dependence,support] of [['oncogenesis',0,12,20,20],['cold',19,3,25,20],['hot',37,18,25,15]]){
    const revision=await b.evaluate('artistooLab.snapshot.revision');
    await b.evaluate(`document.querySelector('[data-scene="${scene}"]').click()`);
    await wait(`artistooLab.snapshot.revision>${revision}&&artistooLab.snapshot.scene==='${scene}'`);
    await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');
    const data=await b.evaluate(`(()=>{const s=artistooLab.snapshot;return {scene:s.scene,settings:s.settings,initial:s.scenario.initial,speed:s.speed,boundary:s.boundary,kernel:s.kernel,controls:Object.fromEntries(['supply','metabolism','vesselDependence','normalSupport','reserveCapacity'].map(k=>[k,Number(document.getElementById(k).value)]))};})()`);
    check(data.initial.tumor===tumor&&data.initial.immune===immune&&data.initial.endothelial>0,scene+' loads the intended founders and endothelial vessels',{initial:data.initial});
    check(data.settings.vesselDependence===dependence&&data.settings.normalSupport===support&&data.settings.vesselCount===2,scene+' loads rebalanced vascular and host-support settings');
    for(const [key,value] of Object.entries(data.controls))assert.equal(value,data.settings[key],scene+': '+key+' control agrees with the Worker');
    check(data.speed===3&&data.boundary==='wrap'&&data.kernel==='wasm',scene+' retains 3x wrap display and WASM');
    await b.evaluate('artistooLab.rpc("advance",{steps:40})');
    check(await b.evaluate('artistooLab.snapshot.orphans===0'),scene+' advances with intact geometry');
  }
  await b.evaluate(`document.querySelector('[data-scene="oncogenesis"]').click()`);await wait('artistooLab.snapshot.scene==="oncogenesis"');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');
  const exported=await b.evaluate('artistooLab.exportData()');
  check(exported.settings.reserveCapacity===140&&exported.settings.metabolism===.85&&Math.min(...exported.supplyMap)>.21&&Math.min(...exported.supplyMap)<.23&&Math.max(...exported.supplyMap)===1,'Development exports revised reserves and localized clearance');
  await b.evaluate(`artistooLab.importData(${JSON.stringify(exported)})`);
  check(await b.evaluate(`artistooLab.snapshot.seed===${exported.seed}&&artistooLab.snapshot.settings.vesselDependence===20&&!artistooLab.snapshot.playing`),'Import preserves seed and calibrated settings');
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
  check(await b.evaluate('document.documentElement.scrollWidth<=392'),'Preset controls still fit mobile');
  check(!b.errors.length&&await b.evaluate('artistooLab.errors.length===0'),'No browser or Worker errors');
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));await writeFile(out+'/tested-manifest.json',await readFile('dist/manifest.json'));console.log(JSON.stringify(checks,null,2));await b.close();}
