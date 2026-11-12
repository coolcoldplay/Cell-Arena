import {openBrowser,delay} from './browser-session.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const out='output/cell-cycle';await mkdir(out,{recursive:true});
const browser=await openBrowser('dist/index.html',9417,{gpu:true}),checks=[];
const check=(name,passed,details={})=>{checks.push({name,passed:!!passed,...details});assert.ok(passed,name);};
try{
  for(let i=0;i<200;i++){if(await browser.evaluate('!!window.artistooLab?.snapshot'))break;await delay(100);}
  await browser.evaluate('(async()=>{await artistooLab.ready;await artistooLab.rpc("playing",{value:false});await artistooLab.rpc("start",{scene:"empty",worldWidth:128,worldHeight:96,warmup:0});await artistooLab.rpc("backend",{mode:"gpu"});await artistooLab.rpc("seed",{kind:2,x:35,y:48});await artistooLab.rpc("seed",{kind:3,x:90,y:48});await artistooLab.rpc("source",{type:"il2",x:90,y:48,radius:12});await artistooLab.rpc("advance",{steps:80});})()');
  const worker=await browser.evaluate('({compute:artistooLab.snapshot.compute,time:artistooLab.snapshot.time,cycles:artistooLab.snapshot.cycles,il2:Math.max(...artistooLab.snapshot.fields.il2.values)})');
  check('Worker advances cycles and IL-2 with real WebGPU metabolism',worker.compute.active==='gpu'&&worker.time===80&&worker.il2>0&&worker.cycles.immune.G0===1,worker);
  const sources=await Promise.all(['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/gpu-fields.js'].map(f=>readFile(f,'utf8')));
  await browser.evaluate(sources.join('\n'));
  const parity=await browser.evaluate(`(async()=>{
    const results=[];
    for(const boundary of ['solid','wrap'])for(const sectionModel of [true,false]){
      const options={width:96,height:72,scene:'empty',warmup:0,boundary,sectionModel},a=new CellLab.Simulation(options),b=new CellLab.Simulation(options);
      for(const s of [a,b]){
        s.seed(1,15,20,6);s.seed(2,30,48,7);s.seed(2,70,48,7);s.seed(3,70,20,4);
        for(let y=0;y<72;y++)s.paint(48,y,0,false,false);s.rebuildMask();
        const tumor=s.live().filter(m=>m.kind===2);tumor[0].cycle.phase='S';tumor[1].cycle.phase='G0';
        const ctl=s.live().find(m=>m.kind===3);ctl.cycle.phase='G2';ctl.antigenMemory=.8;
        for(const k of ['oxygen','glucose','acid'])for(let i=0;i<s.fields[k].values.length;i++)s.fields[k].values[i]=s.fields[k].blocked[i]?0:.1+((i*17)%67)/80;
        s.prepareEnvironment();
      }
      const gpu=await CellLabGPU.GPUFields.create(b);
      try{
        for(let i=0;i<20;i++){
          if(i===10)for(const s of [a,b]){s.live().find(m=>m.kind===2).cycle.arrest='nutrients';s.live().find(m=>m.kind===3).cycle.phase='G0';s.prepareEnvironment();}
          a.integrateEnvironment(4);await gpu.step(b,4);
        }
        let error=0;for(const k of ['oxygen','glucose','acid'])for(let i=0;i<a.fields[k].values.length;i++)error=Math.max(error,Math.abs(a.fields[k].values[i]-b.fields[k].values[i]));
        const blockedZero=['oxygen','glucose','acid'].every(k=>b.fields[k].blocked.every((v,i)=>!v||b.fields[k].values[i]===0));
        results.push({boundary,sectionModel,error,blockedZero,adapter:gpu.adapter});
      }finally{gpu.destroy();}
    }
    return results;
  })()`);
  for(const result of parity)check('Phase-weighted CPU / GPU loads agree: '+result.boundary+', section='+result.sectionModel,result.error<2e-5&&result.blockedZero,result);
  check('No browser or Worker errors',browser.errors.length===0&&await browser.evaluate('artistooLab.errors.length===0'));
}catch(error){checks.push({passed:false,error:String(error)});console.error(error);process.exitCode=1;}
finally{await writeFile(out+'/gpu-checks.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await browser.close();}
