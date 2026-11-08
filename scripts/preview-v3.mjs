import {openBrowser,delay} from './browser-session.mjs';import {writeFile,mkdir} from 'node:fs/promises';
const b=await openBrowser('dist/artistoo-playground.html',9361);
try{
  for(let i=0;i<150;i++){if(await b.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await b.evaluate('artistooLab.rpc("playing",{value:false})');
  console.log(JSON.stringify(await b.evaluate('({width:artistooLab.snapshot.width,cells:artistooLab.snapshot.cells.length,errors:artistooLab.errors})')));
  for(const speed of [.5,2,4]){
    await b.evaluate(`artistooLab.rpc('speed',{value:${speed}}).then(()=>{window.startTime=artistooLab.snapshot.time;return artistooLab.rpc('playing',{value:true})})`);
    const start=performance.now();await delay(3000);await b.evaluate('artistooLab.rpc("playing",{value:false})');
    console.log(JSON.stringify({speed,ms:performance.now()-start,...await b.evaluate('({steps:artistooLab.snapshot.time-startTime,limited:artistooLab.snapshot.limited})')}));
  }
  await b.evaluate('artistooLab.render()');await mkdir('output/v3',{recursive:true});const shot=await b.call('Page.captureScreenshot',{format:'png'});await writeFile('output/v3/preview.png',Buffer.from(shot.data,'base64'));
  const png=await b.evaluate('document.getElementById("world").toDataURL("image/png").split(",")[1]');await writeFile('output/v3/cells.png',Buffer.from(png,'base64'));
  console.log(JSON.stringify({errors:b.errors,requests:b.requests}));
}finally{await b.close();}
