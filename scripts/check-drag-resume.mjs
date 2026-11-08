import {openBrowser,delay} from './browser-session.mjs';
import {writeFile} from 'node:fs/promises';
const b=await openBrowser('dist/artistoo-playground.html',9358);
try{
  for(let i=0;i<100;i++){if(await b.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await b.evaluate('artistooLab.rpc("playing",{value:true})');
  const p=await b.evaluate('(()=>{const s=artistooLab.snapshot,c=s.cells.find(c=>c.kind===1),r=document.getElementById("world").getBoundingClientRect();return {x:r.x+c.x/s.width*r.width,y:r.y+c.y/s.height*r.height};})()');
  await b.call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await delay(150);
  const paused=await b.evaluate('!artistooLab.snapshot.playing');
  await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+3,y:p.y,buttons:1});await delay(50);
  await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+3,y:p.y,button:'left',buttons:0,clickCount:1});await delay(200);
  const resumed=await b.evaluate('artistooLab.snapshot.playing'),errors=await b.evaluate('artistooLab.errors');
  const report={passed:paused&&resumed&&!errors.length&&!b.errors.length,pausedDuringDrag:paused,resumedAfterRelease:resumed,errors:[...errors,...b.errors]};
  await writeFile('output/v2/drag-resume.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}finally{await b.close();}
