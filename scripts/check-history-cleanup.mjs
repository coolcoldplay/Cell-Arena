import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const target=process.argv[2]||'dist/index.html',out='output/history-cleanup',downloads=path.resolve(out,'downloads-'+Date.now());
await mkdir(downloads,{recursive:true});
// This is a separate headless profile. Only this profile's fixture data is cleared.
const b=await openBrowser(target,9514,{gpu:true,initScript:`if(!sessionStorage.getItem('cleanup-test-init')){localStorage.clear();sessionStorage.setItem('cleanup-test-init','1');localStorage.setItem('cell-arena-auto-random-v1','0');}`}),checks=[];
const check=(name,value)=>{checks.push({name,passed:!!value});assert.ok(value,name);};
const wait=async expression=>{for(let n=0;n<400;n++){if(await b.evaluate(expression))return;await delay(100);}throw Error('Timed out: '+expression);};
const click=id=>b.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
const shot=async name=>{const image=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(image.data,'base64'));};
const ready=async()=>{await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate(`artistooLab.rpc('playing',{value:false})`);};
const readStore=()=>b.evaluate(`new Promise((resolve,reject)=>{const open=indexedDB.open('cell-arena-rounds');open.onsuccess=()=>{const db=open.result,tx=db.transaction(['rounds','active']);let records,active;const r=tx.objectStore('rounds').getAll();r.onsuccess=()=>records=r.result;const a=tx.objectStore('active').getAll();a.onsuccess=()=>active=a.result;tx.oncomplete=()=>{db.close();resolve({records,active});};tx.onerror=()=>reject(tx.error);};})`);
async function selectRound(id){
  for(let n=0;n<20;n++){
    if(await b.evaluate(`(()=>{const c=[...document.querySelectorAll('[data-round-select]')].find(c=>c.dataset.roundSelect===${JSON.stringify(id)});if(c){c.click();return true;}return false;})()`))return;
    if(await b.evaluate(`document.getElementById('round-older').disabled`)){
      while(!await b.evaluate(`document.getElementById('round-newer').disabled`))await click('round-newer');
    }else await click('round-older');
  }
  throw Error('Round not found: '+id);
}
try{
  await b.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});await ready();
  check('Old implicit zero migrates to checked auto restart with one minute',await b.evaluate(`document.getElementById('auto-random-enabled').checked&&document.getElementById('auto-random-minutes').value==='1'&&artistooLab.autoRandom.minutes===1`));
  await b.evaluate(`document.getElementById('auto-random-minutes').value='3';document.getElementById('auto-random-minutes').dispatchEvent(new Event('input'));document.getElementById('auto-random-enabled').click()`);
  check('Explicit opt-out disables the timer and export without forgetting the wait',await b.evaluate(`(async()=>artistooLab.autoRandom.minutes===0&&document.getElementById('auto-random-minutes').disabled&&(await artistooLab.exportData()).display.autoRandomMinutes===0)()`));
  await b.evaluate(`new Promise((resolve,reject)=>{const open=indexedDB.open('cell-arena-rounds');open.onsuccess=()=>{const db=open.result,tx=db.transaction(['rounds','active'],'readwrite');tx.objectStore('rounds').clear();tx.objectStore('active').clear();for(let i=1;i<=9;i++){const j=new CellLabRounds.Journal();j.begin({...artistooLab.snapshot,seed:i},0,new Date(2026,9,1,10,i,59).toISOString());const r=j.finish('manual-random',1000);r.id='cleanup-fixture-'+i;tx.objectStore('rounds').put(r);}tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};})`);
  await b.call('Page.reload');await ready();
  check('Explicit disabled preference and three-minute duration survive reload',await b.evaluate(`!document.getElementById('auto-random-enabled').checked&&document.getElementById('auto-random-minutes').value==='3'&&artistooLab.autoRandom.minutes===0`));
  await b.evaluate(`document.querySelector('[data-panel="statistics-panel"]').click();document.getElementById('history-rounds-tab').click()`);
  check('Every visible collapsed row shows its local starting minute',await b.evaluate(`[...document.querySelectorAll('.round-start time')].every(t=>/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$/.test(t.textContent)&&t.dateTime&&t.checkVisibility())&&document.querySelectorAll('.round-start time').length===6`));
  const before=await b.evaluate(`artistooLab.roundHistory.completed`),initialActive=await b.evaluate(`artistooLab.roundHistory.current.id`);
  await click('round-cleanup');
  check('Empty selection disables both bulk operations',await b.evaluate(`document.getElementById('round-delete-selected').disabled&&document.getElementById('round-keep-selected').disabled`));
  await selectRound('cleanup-fixture-9');await selectRound('cleanup-fixture-1');
  check('Selections survive pagination and the count includes other pages',await b.evaluate(`document.getElementById('round-selected-count').textContent==='2'&&document.getElementById('round-select-all').indeterminate`));
  await click('round-delete-selected');
  check('Confirmation states the exact number to delete',await b.evaluate(`document.getElementById('round-cleanup-dialog').open&&document.getElementById('round-delete-count').textContent==='2'`));
  await click('round-cleanup-cancel');check('Cancelling changes no records',await b.evaluate(`artistooLab.roundHistory.completed.length===${before.length}`));
  // Throw after one queued deletion: the entire IndexedDB transaction must abort.
  await b.evaluate(`window.savedIDBDelete=IDBObjectStore.prototype.delete;window.failedDeleteCount=0;IDBObjectStore.prototype.delete=function(key){if(this.name==='rounds'&&++window.failedDeleteCount===2)throw new DOMException('test transaction failure','AbortError');return window.savedIDBDelete.call(this,key);};`);
  await click('round-delete-selected');await click('round-cleanup-confirm');await wait(`document.getElementById('round-cleanup-error').textContent.length>0`);
  check('Storage failure leaves all rows in memory and on disk',await b.evaluate(`artistooLab.roundHistory.completed.length===${before.length}`)&&(await readStore()).records.length===before.length);
  await b.evaluate(`IDBObjectStore.prototype.delete=window.savedIDBDelete`);await click('round-cleanup-confirm');await wait(`!document.getElementById('round-cleanup-dialog').open`);
  const afterDelete=await b.evaluate('artistooLab.roundHistory.completed');
  check('Confirmed deletion removes exactly the selected records without renumbering',afterDelete.length===before.length-2&&afterDelete.every(r=>r.id!=='cleanup-fixture-1'&&r.id!=='cleanup-fixture-9'&&r.roundNumber===before.find(x=>x.id===r.id).roundNumber));
  check('Active simulation survives history cleanup',await b.evaluate(`artistooLab.roundHistory.current.id===${JSON.stringify(initialActive)}`));
  check('Deleted records are removed from persistent storage',(await readStore()).records.length===afterDelete.length);
  await click('export-rounds');let csvFile;
  for(let n=0;n<80;n++){csvFile=(await readdir(downloads)).find(f=>f.endsWith('.csv'));if(csvFile)break;await delay(100);}assert.ok(csvFile);
  const csv=await readFile(path.join(downloads,csvFile),'utf8');
  check('CSV contains retained histories and current round, without deleted records',csv.includes('cleanup-fixture-2')&&!csv.includes('cleanup-fixture-1')&&!csv.includes('cleanup-fixture-9')&&csv.includes('"running"')&&csv.includes('started_at'));
  await selectRound('cleanup-fixture-3');await click('round-keep-selected');
  check('Keep-selected announces deletion of all unselected pages',await b.evaluate(`Number(document.getElementById('round-delete-count').textContent)===${afterDelete.length-1}`));
  // An additional archive created after confirmation must not enter its deletion set.
  await b.evaluate(`artistooLab.importData({scene:'empty',seed:711,worldWidth:96,worldHeight:72,refinement:1,warmup:0,boundary:'wrap',settings:{},display:{autoRandomMinutes:0}})`);
  await click('round-cleanup-confirm');await wait(`!document.getElementById('round-cleanup-dialog').open`);
  const kept=await b.evaluate('artistooLab.roundHistory.completed');
  check('Keep-selected preserves the choice and any newly archived round',kept.length===2&&kept.some(r=>r.id==='cleanup-fixture-3')&&kept.some(r=>r.id===initialActive));
  await shot('desktop-cleanup');await click('language');await delay(150);
  check('Cleanup controls and start dates translate to English',await b.evaluate(`document.getElementById('round-keep-selected').textContent==='Keep selected only'&&document.getElementById('round-delete-selected').textContent==='Delete selected'&&[...document.querySelectorAll('.round-start>span')].every(s=>s.textContent.trim()==='Started')`));
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await click('statistics-expand');await delay(200);await b.evaluate(`document.getElementById('round-cleanup-controls').scrollIntoView({block:'center'})`);await shot('mobile-cleanup');
  check('Mobile cleanup controls fit with touch-sized buttons',await b.evaluate(`document.documentElement.scrollWidth===390&&['round-keep-selected','round-delete-selected','round-select-all'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=390;})&&document.getElementById('round-delete-selected').getBoundingClientRect().height>=40`));
  await click('round-select-all');await click('round-delete-selected');await click('round-cleanup-confirm');await wait(`artistooLab.roundHistory.completed.length===0`);
  check('Select-all clears every archived row and keeps the active round',await b.evaluate(`!!artistooLab.roundHistory.current&&document.getElementById('round-total').textContent==='0'`)&&(await readStore()).records.length===0);
  await b.evaluate(`artistooLab.importData({scene:'empty',seed:712,worldWidth:96,worldHeight:72,refinement:1,warmup:0,boundary:'wrap',settings:{},display:{autoRandomMinutes:0}})`);
  await wait(`artistooLab.roundHistory.completed.length===1`);await delay(100);
  const newest=await b.evaluate(`artistooLab.roundHistory.completed[0]`);
  check('New archives keep increasing their serial after clear-all',newest.roundNumber>Math.max(...kept.map(r=>r.roundNumber)));
  await b.call('Page.reload');await ready();
  check('Reload retains the new round and never resurrects cleared fixtures',await b.evaluate(`artistooLab.roundHistory.completed.some(r=>r.id===${JSON.stringify(newest.id)})&&!artistooLab.roundHistory.completed.some(r=>r.id.startsWith('cleanup-fixture-'))`));
  await b.evaluate(`document.getElementById('auto-random-minutes').value='1';document.getElementById('auto-random-enabled').click()`);
  check('Timer can be enabled again after opting out',await b.evaluate(`artistooLab.autoRandom.minutes===1&&!document.getElementById('auto-random-minutes').disabled`));
  check('No browser or application errors',!b.errors.length&&await b.evaluate('artistooLab.errors.length===0'));
}catch(error){checks.push({passed:false,error:String(error),browserErrors:b.errors});console.error(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify({target,checks},null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
