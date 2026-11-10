import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.argv[3]||'output/support-nuclei';await mkdir(out,{recursive:true});
const b=await openBrowser(process.argv[2]||'dist/index.html',9453,{gpu:true}),checks=[];
function check(name,passed,detail={}){checks.push({name,passed:!!passed,...detail});assert.ok(passed,name);}
async function wait(expr){for(let i=0;i<250;i++){if(await b.evaluate(expr))return;await delay(100);}throw Error('Timed out: '+expr);}
async function shot(name){const s=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(s.data,'base64'));}
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');
  await b.evaluate(`artistooLab.rpc('playing',{value:false}).then(()=>artistooLab.rpc('backend',{mode:'cpu'}))`);
  for(const [scene,value]of [['oncogenesis',35],['cold',25],['hot',20],['empty',0]]){
    await b.evaluate(`artistooLab.rpc('start',{scene:'${scene}',seed:29,worldWidth:192,worldHeight:144,refinement:1,warmup:0})`);
    check(scene+' has its explicit support default',await b.evaluate(`artistooLab.snapshot.settings.normalSupport===${value}&&Number(document.getElementById('normalSupport').value)===${value}`));
  }
  await b.evaluate(`(async()=>{for(const x of [25,65,105,145])await artistooLab.rpc('seed',{kind:1,x,y:50});await artistooLab.rpc('eraseCells',{points:[[25,50],[65,50]],radius:1});})()`);
  check('Custom normal loss is neutral until the user enables the slider',await b.evaluate(`(()=>{const n=artistooLab.snapshot.normalSupport;return n.living===2&&n.reference===4&&n.retained===.5&&n.factor===1;})()`));
  await b.evaluate(`document.getElementById('normalSupport').value='50';document.getElementById('normalSupport').dispatchEvent(new Event('input',{bubbles:true}))`);
  await wait('artistooLab.snapshot.settings.normalSupport===50');
  check('Slider controls real Worker supply and clearance, with a percent readout',await b.evaluate(`artistooLab.snapshot.normalSupport.factor===.75&&document.getElementById('normalSupport-out').textContent==='50%'&&!document.getElementById('normalSupport-number')&&document.getElementById('normal-support-status').textContent.includes('75%')`));
  await b.evaluate(`(async()=>{window.supportExport=await artistooLab.exportData();await artistooLab.importData(supportExport);})()`);
  check('Parameter import keeps explicit custom coupling and starts a fresh reference',await b.evaluate(`artistooLab.snapshot.settings.normalSupport===50&&artistooLab.snapshot.normalSupport.reference===0&&artistooLab.snapshot.normalSupport.factor===1&&!artistooLab.snapshot.playing`));
  await b.evaluate(`artistooLab.rpc('start',{scene:'empty',seed:29,worldWidth:192,worldHeight:144,refinement:1,warmup:0})`);
  check('A newly selected empty scene returns to zero coupling',await b.evaluate('artistooLab.snapshot.settings.normalSupport===0'));
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await b.evaluate(`document.getElementById('language').value='en';document.getElementById('language').dispatchEvent(new Event('change'));document.getElementById('mobile-expand').click();const e=document.getElementById('normalSupport');for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.scrollIntoView({block:'center'});`);await delay(400);
  check('English mobile support control fits the screen',await b.evaluate(`document.getElementById('normalSupport-label').textContent==='Normal-cell support coupling'&&!/[\u4e00-\u9fff]/.test(document.getElementById('normal-support-status').textContent)&&document.documentElement.scrollWidth<=innerWidth+1`));
  await shot('mobile-support');
  // Compare both numerical backends at a non-unit coupling factor, across walls.
  const sources=await Promise.all(['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/model.js','src/gpu-fields.js'].map(f=>readFile(f,'utf8')));await b.evaluate(sources.join('\n'));
  const parity=await b.evaluate(`(async()=>{const rows=[];for(const boundary of ['solid','wrap']){
    const options={width:96,height:72,scene:'empty',warmup:0,boundary,settings:{normalSupport:80,supply:2}},a=new CellLab.Simulation(options),s=new CellLab.Simulation(options);
    for(const m of [a,s]){const ids=[15,35,55,75].map(x=>m.seed(1,x,18,5));m.eraseCell(ids[0]);m.eraseCell(ids[1]);m.seed(2,25,48,6);m.seed(3,67,48,4);for(let y=0;y<72;y++)m.paint(46,y,0,false,false);m.rebuildMask();for(const key of ['oxygen','glucose','acid'])for(let i=0;i<m.fields[key].values.length;i++)m.fields[key].values[i]=m.fields[key].blocked[i]?0:.1+(i*17%67)/80;m.prepareEnvironment();}
    const report=s.normalSupportReport(),gpu=await CellLabGPU.GPUFields.create(s);for(let i=0;i<20;i++){a.integrateEnvironment(4);await gpu.step(s,4);}let error=0;for(const key of ['oxygen','glucose','acid'])for(let i=0;i<a.fields[key].values.length;i++)error=Math.max(error,Math.abs(a.fields[key].values[i]-s.fields[key].values[i]));
    rows.push({boundary,error,report,blockedZero:s.fields.oxygen.blocked.every((v,i)=>!v||['oxygen','glucose','acid'].every(k=>s.fields[k].values[i]===0))});gpu.destroy();
  }return rows;})()`);
  check('CPU and WebGPU apply identical support to all three fields over 80 MCS',parity.every(r=>r.error<2e-5&&r.blockedZero&&Math.abs(r.report.factor-.6)<1e-12),{parity});
  // Rendering batches must retain contours, individual colours and periodic copies.
  const nuclei=await b.evaluate(`(()=>{
    const results=[],cache=new CellLabDisplay.Cache(),width=100,height=80,grid=new Uint32Array(width*height),cells=[];
    for(const [i,x,y,kind,phase,dying]of [[1,2,2,2,'M',false],[2,28,20,1,'G2',false],[3,55,25,3,'G0',false],[4,80,55,2,'G1',true]]){
      const m={id:i,birth:i,kind,hasNucleus:true,nucleusX:x,nucleusY:y,nucleusRadius:4,nucleusStrainX:.12,nucleusStrainY:-.1,cycle:{phase,progress:.5},dying,deathIntact:true,deathProgress:.3};cells.push(m);
      for(let dy=-10;dy<=10;dy++)for(let dx=-10;dx<=10;dx++)if(dx*dx+dy*dy<=100)grid[((y+dy+height)%height)*width+(x+dx+width)%width]=i;
    }
    const s={width,height,grid,cells,boundary:'wrap'},palettes=[CellLabDisplay.normalizeColors(),CellLabDisplay.normalizeColors({normal:{nucleus:'#12aacc'},tumor:{nucleus:'#cc33aa'},immune:{nucleus:'#113355'}})];
    for(const palette of palettes)for(const scale of [2,5.25]){
      const canvases=[document.createElement('canvas'),document.createElement('canvas')];for(const c of canvases){c.width=width*scale;c.height=height*scale;}
      const ref=canvases[0].getContext('2d'),bat=canvases[1].getContext('2d');for(const ctx of [ref,bat]){ctx.fillStyle='#f6f0e2';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.lineWidth=1.5;}
      let paths=0;for(const m of s.cells){const contour=CellLabDisplay.nucleusContour(m,s),style=m.dying?{stroke:'#89531a',fill:'#ffe6a640'}:CellLabDisplay.nucleusStyle(m,palette);ref.strokeStyle=style.stroke;ref.fillStyle=style.fill;
        for(const dx of [-width,0,width])for(const dy of [-height,0,height]){ref.beginPath();contour.forEach(([x,y],i)=>ref[i?'lineTo':'moveTo']((m.nucleusX+.5+dx+x)*scale,(m.nucleusY+.5+dy+y)*scale));ref.closePath();ref.fill();ref.stroke();paths++;}}
      bat.save();bat.scale(scale,scale);bat.lineWidth=1.5/scale;const batches=cache.nucleusBatches(s,palette);for(const p of batches){bat.fillStyle=p.fill;bat.strokeStyle=p.stroke;bat.fill(p.path);bat.stroke(p.path);}bat.restore();
      const a=ref.getImageData(0,0,canvases[0].width,canvases[0].height).data,b=bat.getImageData(0,0,canvases[1].width,canvases[1].height).data;let error=0,large=0,ink=0;for(let i=0;i<a.length;i++){error+=Math.abs(a[i]-b[i]);if(Math.abs(a[i]-b[i])>8)large++;if(i%4!==3&&a[i]!==[246,240,226][i%4])ink++;}
      results.push({scale,meanError:error/a.length,largeFraction:large/a.length,ink,paths,batches:batches.length,cacheHit:cache.nucleusBatches(s,palette)===batches});
    }
    const old=cache.nucleusBatches(s,palettes[1]),next=cache.nucleusBatches({...s,cells:s.cells.map(m=>({...m,nucleusX:m.nucleusX+1}))},palettes[1]);return {results,newSnapshotInvalidates:old!==next};
  })()`);
  check('Batched nuclei preserve pixels, custom colours, death style and wrap copies',nuclei.results.every(r=>r.ink>100&&r.meanError<.1&&r.largeFraction<.001&&r.batches<r.paths&&r.cacheHit)&&nuclei.newSnapshotInvalidates,{nuclei});
  await b.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await b.evaluate(`document.getElementById('language').value='zh';document.getElementById('language').dispatchEvent(new Event('change'));artistooLab.rpc('start',{scene:'hot',seed:29,worldWidth:192,worldHeight:144,refinement:1,warmup:0})`);await delay(300);await b.evaluate('artistooLab.render()');await shot('tumor-nuclei');
  check('No runtime errors',b.errors.length===0&&(await b.evaluate('artistooLab.errors.length'))===0,{errors:b.errors});
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await b.close();}
