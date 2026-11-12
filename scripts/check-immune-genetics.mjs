import {openBrowser,delay} from './browser-session.mjs';import {readFile,writeFile,mkdir} from 'node:fs/promises';
const out='output/antigen-upgrade/browser';await mkdir(out,{recursive:true});
const b=await openBrowser('dist/index.html',9461,{gpu:true}),checks=[];
const check=(name,ok,data)=>{checks.push({name,passed:!!ok,data});if(!ok)throw Error(name+' '+JSON.stringify(data));};
const wait=async e=>{for(let i=0;i<240;i++){if(await b.evaluate(e))return;await delay(100);}throw Error('Timeout '+e);};
const shot=async name=>{const r=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(r.data,'base64'));};
const enter=async name=>{const d=JSON.parse(await readFile('experiments/immune-genetics/'+name+'.json','utf8'));await b.evaluate('artistooLab.importData('+JSON.stringify(d)+')');await delay(200);return d;};
try{
 await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('document.getElementById("language").value="zh";document.getElementById("language").dispatchEvent(new Event("change"))');
 await enter('01-specific-recognition');check('v2 import preserves the four initial cells and independent receptor codes',await b.evaluate('artistooLab.snapshot.cells.length===4&&artistooLab.snapshot.immunity.length===6&&artistooLab.snapshot.time===0'));
 await b.evaluate('artistooLab.rpc("advance",{steps:600})');await delay(200);
 const result=await b.evaluate('({kills:artistooLab.snapshot.counters.kills,recognitions:artistooLab.snapshot.counters.recognitions,unmatched:artistooLab.snapshot.cells.find(c=>c.id===2)})');
 check('only the matching tumor is damaged or killed in an actual CPM simulation',result.recognitions>0&&result.unmatched&&!result.unmatched.dying&&result.unmatched.damage===0,result);
 await b.evaluate('artistooLab.setTool("inspect")');
 const point=await b.evaluate('(()=>{const s=artistooLab.snapshot,m=s.cells.find(c=>c.id===2),r=document.getElementById("world").getBoundingClientRect();return {x:r.x+(m.nucleusX+.5)/s.width*r.width,y:r.y+(m.nucleusY+.5)/s.height*r.height};})()');
 for(const type of ['mousePressed','mouseReleased'])await b.call('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
 await b.evaluate('document.querySelector("[data-panel=cell-inspector]").click()');await wait('document.getElementById("immune-system-inspector").textContent.includes("P1")');
 check('selection shows sequence, presentation, checkpoint and surface targets',await b.evaluate('(()=>{const x=document.getElementById("immune-system-inspector");return x.querySelectorAll(".immune-slot").length===4&&x.textContent.includes("通道能力")&&x.textContent.includes("免疫刹车")&&x.textContent.includes("独立表面靶标");})()'));await shot('selected-antigens');
 await b.evaluate('document.getElementById("language").value="en";document.getElementById("language").dispatchEvent(new Event("change",{bubbles:true}))');await delay(300);
 const english=await b.evaluate('document.getElementById("immune-system-inspector").textContent');check('new selected-cell information supports English',english.includes('Presented')&&!/\p{Script=Han}/u.test(english),english);
 await b.evaluate('document.querySelector("[data-panel=statistics-panel]").click();document.getElementById("genetics-statistics").open=true');await delay(300);
 check('clonal history and actual encounter coverage are visible',await b.evaluate('document.getElementById("clone-history").checkVisibility()&&document.getElementById("clone-legend").children.length>0&&document.getElementById("genetics-summary").textContent.length>60'));await shot('clonal-statistics');
 const exported=await b.evaluate('artistooLab.exportData()');check('export includes initial genotypes, genetic lineage and new parameters',exported.schemaVersion===2&&exported.initialCells.length===4&&exported.immunity.lineage.length>0&&exported.settings.primingRate===1.5);
 await b.evaluate('artistooLab.importData('+JSON.stringify(exported)+')');await delay(200);check('reimport starts the same genetic recipe rather than fabricating a checkpoint',await b.evaluate('artistooLab.snapshot.time===0&&artistooLab.snapshot.cells.length===4'));
 const legacy={...exported,schemaVersion:1};delete legacy.initialCells;delete legacy.immunity;
 const migrated=await b.evaluate('CellLabExperiment.parse('+JSON.stringify(legacy)+')');check('legacy files explicitly report migration',migrated.migration&&migrated.warnings.length===1);
 await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await b.evaluate('document.querySelector("[data-panel=parameter-groups]").click();document.querySelector("[data-module=module-immune]").click();document.getElementById("immune-cycle-controls").open=true;document.getElementById("primingRate").scrollIntoView({block:"center"})');await delay(300);
 check('new immune controls fit a phone panel',await b.evaluate('document.documentElement.scrollWidth<=391&&document.getElementById("primingRate").getBoundingClientRect().right<=391'));await shot('mobile-priming');
 for(const name of ['02-reversible-hiding','03-heritable-escape','03-control-kill-off','04-clonal-replacement']){await enter(name);await b.evaluate('artistooLab.rpc("advance",{steps:64})');check('demo loads and advances: '+name,await b.evaluate('artistooLab.snapshot.time===64&&artistooLab.snapshot.immunity.clones.length>0'));}
 check('no page or worker errors',b.errors.length===0&&await b.evaluate('artistooLab.errors.length===0'),b.errors);
 check('local testing sends no analytics',b.requests.length===0,b.requests);
}catch(e){checks.push({passed:false,error:String(e)});process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
