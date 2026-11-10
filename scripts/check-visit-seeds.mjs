import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const target=process.argv[2]||'dist/index.html',out='output/visit-seeds/'+(target.startsWith('http')?'live':'local');await mkdir(out,{recursive:true});
const b=await openBrowser(target,9468,{gpu:true}),checks=[];
function check(name,ok,details={}){checks.push({name,passed:!!ok,...details});assert.ok(ok,name);}
async function wait(expr){for(let i=0;i<300;i++){if(await b.evaluate(expr))return;await delay(100);}throw Error('Timed out: '+expr);}
async function ready(){await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');}
async function click(selector){const rev=await b.evaluate('artistooLab.snapshot.revision');await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await wait(`artistooLab.snapshot.revision>${rev}`);await b.evaluate('artistooLab.rpc("playing",{value:false})');}
const fingerprint=`(()=>{const s=artistooLab.snapshot;let h=2166136261;for(const v of s.grid)h=Math.imul(h^v,16777619);return JSON.stringify({seed:s.seed,time:s.time,hash:h>>>0,counters:s.counters,cells:s.cells.map(c=>[c.id,c.area,c.x,c.y,c.antigenLevel,c.cycle])});})()`;
try{
 await ready();const first=await b.evaluate('artistooLab.exportData()'),visits=[first.seed];
 check('The opening development experiment keeps the established parameters and 3x wrap display',first.scene==='oncogenesis'&&first.boundary==='wrap'&&first.speed===3&&first.scenario.initial.tumor===0&&first.scenario.initial.immune===12&&first.settings.supply===2.5&&first.settings.metabolism===1.2&&first.settings.normalSupport===35);
 for(let i=0;i<3;i++){
  const prior=visits.at(-1);await b.call('Page.reload',{ignoreCache:true});await wait(`!!window.artistooLab?.snapshot&&artistooLab.snapshot.seed!==${prior}`);await ready();
  const profile=await b.evaluate('artistooLab.exportData()');visits.push(profile.seed);assert.deepEqual(profile.settings,first.settings);assert.deepEqual(profile.supplyMap,first.supplyMap);
 }
 check('Four independent page loads get different uint32 seeds while retaining identical preset settings and supply map',new Set(visits).size===4&&visits.every(s=>Number.isInteger(s)&&s>=0&&s<=0xffffffff),{seeds:visits});
 const opening=visits.at(-1);
 await b.evaluate('artistooLab.rpc("backend",{mode:"cpu"})');
 await b.evaluate(`artistooLab.importData(${JSON.stringify(first)})`);
 check('Import restores the exported seed and pauses after the existing 35-MCS mechanical warmup',await b.evaluate(`artistooLab.snapshot.seed===${first.seed}&&!artistooLab.snapshot.playing&&artistooLab.snapshot.time===35`));
 await b.evaluate('artistooLab.rpc("advance",{steps:40})');const advanced=await b.evaluate(fingerprint);
 await click('#reset');check('Restart keeps the current imported seed and returns to the initial mechanical warmup state',await b.evaluate(`artistooLab.snapshot.seed===${first.seed}&&artistooLab.snapshot.time===35`));
 await b.evaluate('artistooLab.rpc("advance",{steps:40})');check('Imported experiment and Restart reproduce the same 40-MCS cells, geometry and counters',await b.evaluate(fingerprint)===advanced);
 await click('#restore-scenario');check('Restore returns to this page visit opening seed and the scenario defaults',await b.evaluate(`artistooLab.snapshot.seed===${opening}&&artistooLab.snapshot.settings.supply===2.5&&artistooLab.snapshot.scenario.initial.tumor===0`));
 await click('#shuffle');const randomSeed=await b.evaluate('artistooLab.snapshot.seed');check('Random Generate still creates a new bounded random-development experiment',await b.evaluate(`artistooLab.snapshot.scene==='random'&&artistooLab.snapshot.seed!==${opening}&&artistooLab.snapshot.settings.supply>=2.3&&artistooLab.snapshot.settings.supply<=2.8&&artistooLab.snapshot.scenario.initial.tumor===0`));
 await click('#reset');check('Random Generate also remains restartable',await b.evaluate(`artistooLab.snapshot.scene==='random'&&artistooLab.snapshot.seed===${randomSeed}`));
 await click('[data-scene="oncogenesis"]');check('Returning to development reuses this visit seed for controlled comparison',await b.evaluate(`artistooLab.snapshot.seed===${opening}`));
 for(const lang of ['zh','en']){
  await b.evaluate(`(()=>{const e=document.getElementById('language');e.value='${lang}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(100);
  check('Actual full-width seed is visible in '+lang,await b.evaluate(`document.getElementById('seed-label').textContent.includes('${opening}')`));
 }
 await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(100);
 check('Mobile page retains the actual seed and has no horizontal overflow',await b.evaluate(`document.documentElement.scrollWidth<=392&&artistooLab.snapshot.seed===${opening}`));
 check('No application or browser errors',!b.errors.length&&await b.evaluate('artistooLab.errors.length===0'));
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/checks.json',JSON.stringify({target,checks},null,2));await writeFile(out+'/tested-manifest.json',await readFile('dist/manifest.json'));console.log(JSON.stringify(checks,null,2));await b.close();}
