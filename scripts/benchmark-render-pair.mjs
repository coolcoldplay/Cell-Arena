import {openBrowser,delay} from './browser-session.mjs';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
const baseline=process.argv[2]||'HEAD',browser=await openBrowser('dist/index.html',9511,{gpu:true});
try{
  for(let i=0;i<300;i++){if(await browser.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await browser.evaluate(`(async()=>{await artistooLab.ready;await CellLabAppearance.ready;await artistooLab.rpc('playing',{value:false});await artistooLab.rpc('start',{scene:'hot',seed:29,worldWidth:512,worldHeight:384,refinement:1.5,boundary:'wrap',warmup:0});await artistooLab.rpc('advance',{steps:16});window.currentAppearance=CellLabAppearance;window.currentDisplay=CellLabDisplay;})()`);
  for(const file of ['src/cell-appearance.js','src/display-fields.js'])await browser.evaluate(execFileSync('git',['show',baseline+':'+file],{encoding:'utf8'}));
  await browser.evaluate(`window.previousAppearance=CellLabAppearance;window.previousDisplay=CellLabDisplay;window.CellLabAppearance=currentAppearance;window.CellLabDisplay=currentDisplay;window.renderPairFixtures=[{surface:new previousAppearance.Surface(),cache:new previousDisplay.Cache()},{surface:new currentAppearance.Surface(),cache:new currentDisplay.Cache()}];window.renderPairs=[];`);
  for(let pair=-1;pair<6;pair++){
    const row=await browser.evaluate(`(()=>{const samples=[],s=artistooLab.snapshot;for(const i of ${pair%2?'[1,0]':'[0,1]'}){const f=renderPairFixtures[i],start=performance.now();let layer;for(let n=0;n<8;n++){const frame={...s};layer=f.surface.get(frame);f.cache.nucleusBatches(frame,currentDisplay.COLOR_DEFAULTS);}samples[i]=(performance.now()-start)/8;}return {beforeMs:samples[0],afterMs:samples[1],gain:samples[0]/samples[1],samePixels:renderPairFixtures[0].surface.layer.interior.every((v,i)=>v===renderPairFixtures[1].surface.layer.interior[i])};})()`);
    if(!row.samePixels)throw Error('Optical output changed');if(pair>=0)await browser.evaluate('renderPairs.push('+JSON.stringify(row)+')');await delay(100);
  }
  const result=await browser.evaluate(`({lattice:[artistooLab.snapshot.width,artistooLab.snapshot.height],cells:artistooLab.snapshot.cells.length,pairs:renderPairs,wasm:CellLabAppearance.accelerated})`);
  for(const key of ['beforeMs','afterMs'])result[key]=result.pairs.reduce((n,p)=>n+p[key],0)/result.pairs.length;result.speedup=result.beforeMs/result.afterMs;
  await mkdir('output/performance',{recursive:true});await writeFile('output/performance/interleaved-render.json',JSON.stringify({baseline,...result},null,2));console.log(JSON.stringify(result,null,2));
  if(browser.errors.length)throw Error(JSON.stringify(browser.errors));
}finally{await browser.close();}
