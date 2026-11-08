import {openBrowser,delay} from './browser-session.mjs';import {writeFile} from 'node:fs/promises';
const browser=await openBrowser('dist/artistoo-playground.html',9371,{gpu:true});
try{
  for(let i=0;i<100;i++){if(await browser.evaluate('!!window.artistooLab?.snapshot'))break;await delay(200);}
  const info=await browser.evaluate(`(async()=>{const a=artistooLab;await a.rpc('playing',{value:false});return {renderer:a.renderer,kernel:a.snapshot.kernel,kernelNote:a.snapshot.kernelNote,compute:a.snapshot.compute,cells:a.snapshot.cells.length,time:a.snapshot.time,errors:a.errors};})()`);console.log(JSON.stringify(info,null,2));
  await browser.evaluate(`artistooLab.render()`);const shot=await browser.call('Page.captureScreenshot',{format:'png'});await writeFile('output/v4/smoke.png',Buffer.from(shot.data,'base64'));
  console.log('runtimeErrors',JSON.stringify(browser.errors));await writeFile('output/v4/browser-smoke.json',JSON.stringify({...info,runtimeErrors:browser.errors},null,2));
}finally{await browser.close();}
