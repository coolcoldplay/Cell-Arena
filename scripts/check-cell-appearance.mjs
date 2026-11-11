import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const target=process.argv[2]||'http://127.0.0.1:4175/',out=target.startsWith('https:')?'output/cell-appearance/live':'output/cell-appearance';await mkdir(out,{recursive:true});
const b=await openBrowser(target,9471,{gpu:true,initScript:`try{localStorage.clear();}catch{}const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){const value=get.call(this,type,...args);if(type==='webgl2'&&!window.appearanceGL)window.appearanceGL=value;return value;};`}),checks=[];
function check(name,ok,details={}){checks.push({name,passed:!!ok,...details});assert.ok(ok,name);}
async function wait(expr){for(let i=0;i<300;i++){if(await b.evaluate(expr))return;await delay(100);}throw Error('Timed out: '+expr);}
async function shot(name){await b.evaluate('artistooLab.render()');await delay(60);const r=await b.call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+name+'.png',Buffer.from(r.data,'base64'));}
try{
  await wait('!!window.artistooLab?.snapshot');await b.evaluate('artistooLab.ready');await b.evaluate('artistooLab.rpc("playing",{value:false})');
  await b.evaluate('CellLabAppearance.ready');check('Compiled optical kernel loads in the production browser',await b.evaluate('CellLabAppearance.accelerated'));
  check('Default preview enables shape-aware translucency on WebGL2',await b.evaluate(`document.getElementById('body-feather').value==='80'&&artistooLab.renderer.gpu&&!artistooLab.renderer.error`),{renderer:await b.evaluate('artistooLab.renderer')});
  await b.evaluate(`document.getElementById('clear-overlays').click();document.getElementById('cycle-marks').checked=false;document.getElementById('antigen-marks').checked=false;document.getElementById('module-display').open=true;document.getElementById('module-colors').open=true;`);
  await shot('confluent-gradient');
  await b.evaluate(`window.stateBefore=JSON.stringify(artistooLab.snapshot);window.setFade=value=>{const e=document.getElementById('body-feather');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));artistooLab.render();};setFade(0);`);await shot('confluent-solid');
  await b.evaluate('setFade(80)');check('Changing appearance preserves every simulation snapshot field',await b.evaluate('JSON.stringify(artistooLab.snapshot)===stateBefore'));
  // Render a controlled shape through the same production shader, checking
  // pixel centers at an odd integer scale against the shared distance field.
  const pixels=await b.evaluate(`(()=>{
    const width=72,height=56,grid=new Uint16Array(width*height),activity=new Uint8Array(grid.length),walls=new Uint8Array(grid.length);
    for(let y=5;y<25;y++)for(let x=4;x<23;x++)grid[y*width+x]=1;
    for(let y=5;y<31;y++)for(let x=23;x<48;x++)if(!(x<36&&y>14&&y<21))grid[y*width+x]=2;
    for(let y=32;y<51;y++)for(let x=4;x<62;x++)if(((x-13)**2+(y-40)**2)<64)grid[y*width+x]=3;else if(x>32&&x<43)grid[y*width+x]=4;else if(x>49&&x<60)grid[y*width+x]=5;
    for(let y=3;y<52;y++){grid[y*width+66]=6;walls[y*width+66]=1;}
    const cells=[{id:1,kind:1},{id:2,kind:2,antigen:true,genome:{proliferation:3}},{id:3,kind:3},{id:4,kind:3,activation:100},{id:5,kind:3,immunePhenotype:'suppressive'},{id:6,kind:4}];for(const c of cells)c.area=grid.reduce((n,id)=>n+(id===c.id),0);
    const s={width,height,grid,activity,walls,cells,boundary:'solid',fieldScale:1},surface=new CellLabAppearance.Surface().get(s),canvas=document.createElement('canvas');canvas.width=3*width;canvas.height=3*height;
    const ctx=canvas.getContext('2d'),renderer=new CellLabRenderer(),options={actFlags:[0,0,0,0],seams:false,selected:0,surface,edgeFade:.8};renderer.draw(ctx,s,options);
    const image=ctx.getImageData(0,0,canvas.width,canvas.height).data;let maxError=0,edgeCount=0,coreCount=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const q=y*width+x,id=grid[q],m=cells.find(c=>c.id===id);if(!m||m.kind===4)continue;
      const alpha=1-.8*(1-surface.interior[q]/255),base=CellLabDisplay.bodyColor(m),under=CellLabDisplay.BODY_COLORS[0],p=((3*y+1)*canvas.width+3*x+1)*4;
      for(let k=0;k<3;k++)maxError=Math.max(maxError,Math.abs(image[p+k]-Math.round(under[k]+(base[k]-under[k])*alpha)));
      if(surface.interior[q]<15)edgeCount++;if(surface.interior[q]===255)coreCount++;
    }
    window.appearanceFixture={s,options,canvas,ctx,renderer,surface};
    return {maxError,edgeCount,coreCount,gpuError:renderer.gl.getError()};
  })()`);
  check('All cell states use the correct silhouette gradient, including concavities and touching cells',pixels.maxError<=2&&pixels.edgeCount>30&&pixels.coreCount>30&&pixels.gpuError===0,pixels);
  const zero=await b.evaluate(`(()=>{const {s,options,canvas,ctx,renderer}=appearanceFixture;renderer.draw(ctx,s,{...options,edgeFade:0});const a=ctx.getImageData(0,0,canvas.width,canvas.height).data;renderer.draw(ctx,s,{...options,surface:null,edgeFade:0});const b=ctx.getImageData(0,0,canvas.width,canvas.height).data;let difference=0,colorError=0;for(let i=0;i<a.length;i++)difference=Math.max(difference,Math.abs(a[i]-b[i]));for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const m=s.cells.find(c=>c.id===s.grid[y*s.width+x]);if(!m||m.kind===4)continue;const p=((3*y+1)*canvas.width+3*x+1)*4,base=CellLabDisplay.bodyColor(m);for(let k=0;k<3;k++)colorError=Math.max(colorError,Math.abs(a[p+k]-base[k]));}return {difference,colorError};})()`);
  check('Zero strength exactly restores solid body colors and bypasses the gradient',zero.difference===0&&zero.colorError<=1,zero);
  const annotations=await b.evaluate(`(()=>{const {s,options,canvas,ctx,renderer}=appearanceFixture,q=40*s.width+13;s.activity[q]=255;renderer.snapshot=null;renderer.draw(ctx,s,{...options,actFlags:[0,0,0,1]});const act=[...ctx.getImageData(3*13+1,3*40+1,1,1).data];s.activity[q]=0;renderer.snapshot=null;renderer.draw(ctx,s,{...options,showAntigen:true});const antigen=ctx.getImageData(0,0,canvas.width,canvas.height).data;let red=0;for(let i=0;i<antigen.length;i+=4)if(antigen[i]>160&&antigen[i+1]<90&&antigen[i+2]<100)red++;return {act,red};})()`);
  check('Act retains its scientific colors and antigen outlines remain visible',annotations.act[0]===255&&annotations.act[1]===0&&annotations.red>20,annotations);
  const overlay=await b.evaluate(`(()=>{
    const {s,options,canvas,ctx,renderer,surface}=appearanceFixture,values=new Float32Array(s.grid.length).fill(.7),rgba=new Uint8Array(s.grid.length*4),bodyRGBA=new Uint8Array(rgba.length);
    for(let q=0;q<s.grid.length;q++){rgba.set([157,100,219,120],q*4);bodyRGBA.set([157,100,219,40],q*4);}
    const field={width:s.width,height:s.height,values},info=CellLabDisplay.FIELD_INFO.adversity,signal={width:s.width,height:s.height,rgba},bodySignal={...signal,rgba:bodyRGBA};
    s.cells[1].dying=true;s.cells[1].deathCause='kill';s.cells[1].deathProgress=.5;renderer.snapshot=null;
    renderer.draw(ctx,s,{...options,field,info,signal,bodySignal,environmentOpacity:.6,bodyEnvironmentOpacity:.2});
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let maxError=0;
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
      const q=y*s.width+x,m=s.cells.find(c=>c.id===s.grid[q]);if(!m||m.kind===4)continue;
      const heat=info.palette[0][Math.round(values[q]*255)],mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
      const under=mix(mix(CellLabDisplay.BODY_COLORS[0],heat,.6),[157,100,219],120/255);
      const body=CellLabDisplay.deathColor(mix(mix(CellLabDisplay.bodyColor(m),heat,.2),[157,100,219],40/255),m);
      const expected=mix(under,body,1-.8*(1-surface.interior[q]/255)),p=((3*y+1)*canvas.width+3*x+1)*4;
      for(let k=0;k<3;k++)maxError=Math.max(maxError,Math.abs(pixels[p+k]-Math.round(expected[k])));
    }return {maxError};
  })()`);
  check('Translucent rims reveal local environmental layers while retaining the orange death transition',overlay.maxError<=2,overlay);
  await b.evaluate(`artistooLab.rpc('start',{scene:'network',seed:29,worldWidth:160,worldHeight:120,refinement:2,warmup:35})`);
  await b.evaluate(`artistooLab.rpc('advance',{steps:400})`);
  await b.evaluate(`document.getElementById('clear-overlays').click();for(const id of ['edge-activity','cycle-marks','antigen-marks'])document.getElementById(id).checked=false;document.getElementById('nuclei').checked=true;document.getElementById('module-display').open=true;document.getElementById('module-colors').open=true;setFade(80);`);
  await shot('branched-gradient');
  await b.evaluate('setFade(0)');await shot('branched-solid');await b.evaluate('setFade(80)');
  const motion=await b.evaluate(`(async()=>{const cache=new CellLabAppearance.Surface(),a=cache.get(artistooLab.snapshot).interior.slice(),before=artistooLab.snapshot.time;await artistooLab.rpc('advance',{steps:40});const s=artistooLab.snapshot,next=cache.get(s);return {changed:next.interior.reduce((n,v,i)=>n+(v!==a[i]),0),steps:s.time-before,orphans:s.orphans};})()`);
  check('Advancing real deforming cells updates the gradient from their new shapes',motion.changed>100&&motion.steps===40&&motion.orphans===0,motion);
  await b.evaluate(`(async()=>{setFade(45);window.savedAppearance=await artistooLab.exportData();setFade(0);await artistooLab.importData(savedAppearance);})()`);
  check('Export and import retain the appearance strength',await b.evaluate(`savedAppearance.display.edgeFade===45&&document.getElementById('body-feather').value==='45'`));
  await b.evaluate(`artistooLab.rpc('start',{scene:'hot',seed:29,worldWidth:512,worldHeight:384,refinement:2,warmup:0})`);
  const timing=await b.evaluate(`(()=>{const s=artistooLab.snapshot,cache=new CellLabAppearance.Surface(),times=[];for(let i=0;i<12;i++){const snap={...s},t=performance.now();cache.get(snap);if(i>=3)times.push(performance.now()-t);}const t=performance.now();for(let i=0;i<100;i++)cache.get(cache.snapshot);times.sort((a,b)=>a-b);return {lattice:[s.width,s.height],cells:s.cells.length,medianMs:times[4],p90Ms:times[8],cachedMs:(performance.now()-t)/100};})()`);
  check('Maximum-size distance field reuses buffers and paused frames reuse the cache',timing.cachedMs<.1&&timing.medianMs<100,timing);
  await b.evaluate(`artistooLab.rpc('eraseCells',{points:[[40,40]],radius:12})`);
  const highMask=await b.evaluate(`(()=>{for(const id of ['nuclei','cycle-marks','antigen-marks','edge-activity','cell-seams'])document.getElementById(id).checked=false;document.getElementById('clear-overlays').click();setFade(80);const s=artistooLab.snapshot,c=document.getElementById('world'),ctx=c.getContext('2d'),meta=new Map(s.cells.map(m=>[m.id,m])),bg=CellLabDisplay.BODY_COLORS[0],pixels=ctx.getImageData(0,0,c.width,c.height).data;const mismatches=[];let outside=0,outsideError=0,edges=0,faded=0;for(let py=2;py<c.height-2;py+=3)for(let px=2;px<c.width-2;px+=3){const x=Math.floor((px+.5)*s.width/c.width),y=Math.floor((py+.5)*s.height/c.height),q=y*s.width+x,id=s.grid[q],m=meta.get(id),p=(py*c.width+px)*4;if(x<8||y<8||x>=s.width-8||y>=s.height-8)continue;if(!id&&!s.walls[q]){outside++;for(let k=0;k<3;k++)outsideError=Math.max(outsideError,Math.abs(pixels[p+k]-bg[k]));if(mismatches.length<5&&bg.some((v,k)=>Math.abs(v-pixels[p+k])>1))mismatches.push({px,py,x,y,fx:(px+.5)*s.width/c.width,fy:(py+.5)*s.height/c.height,pixel:[...pixels.slice(p,p+3)]});}else if(m?.kind<4&&[q-1,q+1,q-s.width,q+s.width].some(n=>s.grid[n]!==id)){const base=CellLabDisplay.bodyColor(m,artistooLab.colors),contrast=Math.max(...base.map((v,k)=>Math.abs(v-bg[k]))),drawn=Math.max(...bg.map((v,k)=>Math.abs(pixels[p+k]-v)));edges++;if(drawn<=contrast*.65+1)faded++;}}return {mismatches,display:[c.width,c.height],outside,outsideError,edges,faded,scale:new CellLabAppearance.Surface().get(s).scale};})()`);
  check('Large-grid optical detail never spills outside the full-resolution silhouette and still fades original membranes',highMask.scale===2&&highMask.outside>0&&highMask.outsideError===0&&highMask.edges>100&&highMask.faded===highMask.edges,highMask);
  await b.evaluate(`artistooLab.rpc('start',{scene:'empty',seed:29,worldWidth:96,worldHeight:72,refinement:1,warmup:0})`);
  await b.evaluate(`(async()=>{for(const [kind,x,y]of [[1,20,25],[2,45,25],[3,70,25]])await artistooLab.rpc('seed',{kind,x,y});await artistooLab.rpc('advance',{steps:20});for(const id of ['nuclei','cycle-marks','antigen-marks','edge-activity','cell-seams'])document.getElementById(id).checked=false;document.getElementById('clear-overlays').click();setFade(80);window.gpuFrame=document.getElementById('world').toDataURL();appearanceGL.getExtension('WEBGL_lose_context').loseContext();})()`);
  await delay(100);await b.evaluate('artistooLab.render()');
  const fallback=await b.evaluate(`(()=>{const s=artistooLab.snapshot,c=document.getElementById('world'),ctx=c.getContext('2d'),surface=new CellLabAppearance.Surface().get(s);let maxError=0,samples=0;for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const q=y*s.width+x,m=s.cells.find(m=>m.id===s.grid[q]);if(!m||m.kind===4)continue;const actual=ctx.getImageData(Math.floor((x+.5)*c.width/s.width),Math.floor((y+.5)*c.height/s.height),1,1).data,base=CellLabDisplay.bodyColor(m,artistooLab.colors),under=CellLabDisplay.BODY_COLORS[0],alpha=1-.8*(1-surface.interior[q]/255);for(let k=0;k<3;k++)maxError=Math.max(maxError,Math.abs(actual[k]-Math.round(under[k]+(base[k]-under[k])*alpha)));samples++;}return {gpu:artistooLab.renderer.gpu,samples,maxError};})()`);
  check('Context loss retains the same silhouette-based opacity in Canvas2D pixels',!fallback.gpu&&fallback.samples>50&&fallback.maxError<=1,fallback);
  await shot('canvas-fallback');
  await b.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await b.evaluate(`document.getElementById('language').value='en';document.getElementById('language').dispatchEvent(new Event('change'));document.querySelector('[data-panel="display-panel"]').click();const e=document.getElementById('body-feather');for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;e.scrollIntoView({block:'center'});`);await delay(150);
  check('Mobile appearance slider is visible, translated and fits the panel',await b.evaluate(`document.getElementById('body-feather').checkVisibility()&&document.getElementById('body-feather').closest('label').textContent.includes('Edge translucency')&&document.documentElement.scrollWidth<=392`));await shot('mobile-control');
  check('No browser or simulation errors',!b.errors.length&&await b.evaluate('artistooLab.errors.length===0'),{errors:b.errors});
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(out+'/checks.json',JSON.stringify({target,checks},null,2));await writeFile(out+'/tested-manifest.json',await readFile('dist/manifest.json'));console.log(JSON.stringify(checks,null,2));await b.close();}
