import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {openBrowser,delay} from './browser-session.mjs';
const url='http://127.0.0.1:4175/',out='output/hires-interaction',hash=b=>createHash('sha256').update(b).digest('hex');
const response=await fetch(url),served=Buffer.from(await response.arrayBuffer()),local=await readFile('dist/artistoo-playground.html'),manifest=JSON.parse(await readFile('dist/manifest.json')),tested=JSON.parse(await readFile(out+'/tested-manifest.json'));
if(response.status!==200||hash(served)!==hash(local)||hash(local)!==manifest.htmlSHA256||manifest.htmlSHA256!==tested.htmlSHA256)throw Error('Served artifact does not match tested build');
const b=await openBrowser(url,9387,{gpu:true});
try{
  await b.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1250,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<200;i++){if(await b.evaluate('!!window.artistooLab?.snapshot&&artistooLab.snapshot.speed===3'))break;await delay(100);}
  await b.evaluate('artistooLab.rpc("playing",{value:false})');
  const initial=await b.evaluate('({scene:artistooLab.snapshot.scene,nuclei:document.getElementById("nuclei").checked,kernel:artistooLab.snapshot.kernel,renderer:artistooLab.renderer})');
  if(initial.scene!=='oncogenesis'||!initial.nuclei||initial.kernel!=='wasm'||!initial.renderer.gpu)throw Error('Served startup smoke check failed');
  await b.evaluate(`(async()=>{await artistooLab.rpc('start',{scene:'hot',seed:17,warmup:0});await artistooLab.rpc('advance',{steps:100});await artistooLab.rpc('speed',{value:1});document.getElementById('clear-overlays').click();artistooLab.render();document.querySelector('.workspace').scrollIntoView({block:'start'});})()`);
  await delay(100);let screenshot=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/served-state-colors.png',Buffer.from(screenshot.data,'base64'));
  await b.evaluate(`document.querySelector('[data-layer=trail]').click();document.getElementById('opacity-trail').value=100;document.getElementById('opacity-trail').dispatchEvent(new Event('input'));document.getElementById('layer-settings').open=true;artistooLab.render();document.querySelector('.workspace').scrollIntoView({block:'start'});`);
  await delay(100);screenshot=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/served-recruitment-100.png',Buffer.from(screenshot.data,'base64'));
  if(b.errors.length||await b.evaluate('artistooLab.errors.length'))throw Error('Served page runtime error');
  const result={url,status:response.status,htmlSHA256:hash(served),bytes:served.length,matchesTestedBuild:true,initial,errors:0};await writeFile(out+'/served-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await b.close();}
