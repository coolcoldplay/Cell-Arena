import {openBrowser,delay} from './browser-session.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const browser=await openBrowser('output/artistoo-v1.html');
try{
  for(let i=0;i<100;i++){if(await browser.evaluate('!!window.artistooLab'))break;await delay(100);}
  await browser.evaluate('artistooLab.setPlaying(false)');
  const timings=await browser.evaluate(`(()=>{const L=artistooLab,C=L.model;const bench=f=>{const t=performance.now();for(let i=0;i<60;i++)f();return (performance.now()-t)/60;};const full=bench(()=>C.timeStep());const hard=C.hard_constraints;C.hard_constraints=hard.filter(c=>c.constructor.name!=='ConnectivityConstraint');const withoutGlobalConnectivity=bench(()=>C.timeStep());C.hard_constraints=hard;const rendering=bench(()=>L.draw());return {full,withoutGlobalConnectivity,rendering};})()`);
  const speeds=[];
  for(const speed of [1,3,12]){
    await browser.evaluate(`artistooLab.start('crawl',false,true);artistooLab.setParameter('speed',${speed});window.t0=artistooLab.model.time;artistooLab.setPlaying(true)`);
    const begin=performance.now();await delay(1800);await browser.evaluate('artistooLab.setPlaying(false)');
    const steps=await browser.evaluate('artistooLab.model.time-t0');speeds.push({speed,steps,mcsPerSecond:steps*1000/(performance.now()-begin)});
  }
  const report={timings,speeds,speedControlEffective:speeds[2].mcsPerSecond>speeds[0].mcsPerSecond*2,errors:browser.errors};
  await mkdir('output',{recursive:true});await writeFile('output/baseline-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
