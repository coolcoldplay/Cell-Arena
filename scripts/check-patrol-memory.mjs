import {openBrowser,delay} from './browser-session.mjs';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const target=process.argv[2]||'dist/index.html',out='output/patrol-memory/browser';await mkdir(out,{recursive:true});
const b=await openBrowser(target,9404,{gpu:true}),checks=[];
const check=(name,value,details={})=>{checks.push({name,passed:!!value,...details});assert.ok(value,name);};
const wait=async expression=>{for(let i=0;i<200;i++){if(await b.evaluate(expression))return;await delay(100);}throw Error('Timed out: '+expression);};
const click=async selector=>{const point=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});await delay(100);};
const shot=async name=>{const p=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(p.data,'base64'));};
try{
 await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');
 await b.evaluate('(()=>{const e=document.querySelector("#language");e.value="zh";e.dispatchEvent(new Event("change",{bubbles:true}))})()');
 await b.evaluate('(async()=>{await artistooLab.rpc("playing",{value:false});await artistooLab.rpc("start",{scene:"oncogenesis",worldWidth:240,worldHeight:180,refinement:1,warmup:0,settings:{metabolism:0,stressMutation:0,progression:0,immuneGrowth:0}});})()');
 check('Fresh local run starts with empty patrol observations',await b.evaluate('artistooLab.snapshot.patrol.coverage===0&&artistooLab.snapshot.patrol.checkedCells===0'));
 await b.evaluate('artistooLab.rpc("advance",{steps:400})');await click('[data-panel="statistics-panel"]');
 const stats=await b.evaluate('({patrol:artistooLab.snapshot.patrol,coverage:document.querySelector("#patrol-coverage").textContent,checked:document.querySelector("#patrol-checked").textContent,visible:document.querySelector("#statistics-panel").open})');
 check('Statistics display physical coverage and unique inspected cells',stats.patrol.coverage>0&&stats.patrol.checkedCells>5&&stats.coverage===(stats.patrol.coverage*100).toFixed(1)+'%'&&Number(stats.checked)===stats.patrol.checkedCells&&stats.visible,stats);await shot('desktop-statistics');
 await b.evaluate('artistooLab.rpc("snapshot")');check('Pause and display reads leave patrol observations unchanged',await b.evaluate('JSON.stringify(artistooLab.snapshot.patrol)')===JSON.stringify(stats.patrol));
 const exported=await b.evaluate('artistooLab.exportData()');check('Export contains patrol totals and deduplicated birth identities',exported.patrol.checkedBirths.length===exported.patrol.checkedCells&&new Set(exported.patrol.checkedBirths).size===exported.patrol.checkedCells&&exported.cells.filter(c=>c.kind===3).every(c=>Number.isInteger(c.patrolChecked)));
 await click('[data-tool="inspect"]');const p=await b.evaluate('(()=>{const s=artistooLab.snapshot,m=s.cells.find(c=>c.kind===3),r=document.querySelector("#world").getBoundingClientRect();return {x:r.x+(m.nucleusX+.5)/s.width*r.width,y:r.y+(m.nucleusY+.5)/s.height*r.height}})()');for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});await delay(120);
 check('Selected immune cell reports its own distinct inspections',await b.evaluate('document.querySelector("#inspection").textContent.includes("本细胞已检查")'));await shot('immune-details');
 await b.evaluate('(()=>{const e=document.querySelector("#language");e.value="en";e.dispatchEvent(new Event("change",{bubbles:true}))})()');await delay(100);
 check('Patrol details translate to English',await b.evaluate('document.querySelector("#inspection").textContent.includes("distinct tissue cells")&&!/[\u3400-\u9fff]/.test(document.querySelector("#inspection").textContent)'));
 await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);await click('[data-panel="statistics-panel"]');await b.evaluate('document.querySelector(".patrol-metrics").scrollIntoView({block:"center"})');await delay(100);
 check('Mobile patrol statistics fit the screen and translate completely',await b.evaluate('document.documentElement.scrollWidth<=391&&document.querySelector(".patrol-metrics").getBoundingClientRect().right<=391&&!/[\u3400-\u9fff]/.test(document.querySelector("#patrol-current").textContent+document.querySelector(".patrol-definition").textContent)'));await shot('mobile-statistics');
 await b.evaluate('artistooLab.importData('+JSON.stringify(exported)+')');check('Import creates a new patrol session rather than restoring old inspection history',await b.evaluate('artistooLab.snapshot.patrol.checkedCells===0&&artistooLab.snapshot.patrol.coverage===0&&!artistooLab.snapshot.playing'));
 check('No runtime exceptions',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'));
}catch(e){checks.push({passed:false,error:String(e)});console.error(e);process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
