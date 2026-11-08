import {openBrowser,delay} from './browser-session.mjs';import {writeFile} from 'node:fs/promises';
const b=await openBrowser('dist/artistoo-playground.html',9375,{gpu:true});
try{for(let i=0;i<120;i++){if(await b.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}await b.evaluate('artistooLab.rpc("advance",{steps:650})');
  await b.evaluate('artistooLab.render()');let png=await b.evaluate('document.getElementById("world").toDataURL("image/png").split(",")[1]');await writeFile('output/v4/classic-cells.png',Buffer.from(png,'base64'));
  const shot=await b.call('Page.captureScreenshot',{format:'png'});await writeFile('output/v4/classic-interface.png',Buffer.from(shot.data,'base64'));
  await b.evaluate('document.getElementById("nuclei").checked=true;artistooLab.render()');png=await b.evaluate('document.getElementById("world").toDataURL("image/png").split(",")[1]');await writeFile('output/v4/nuclear-debug.png',Buffer.from(png,'base64'));
  console.log(JSON.stringify(await b.evaluate('({time:artistooLab.snapshot.time,cells:artistooLab.snapshot.cells.length,kernel:artistooLab.snapshot.kernel,errors:artistooLab.errors})')));
}finally{await b.close();}
