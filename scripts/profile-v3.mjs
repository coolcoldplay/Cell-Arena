import vm from 'node:vm';import inspector from 'node:inspector';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const s=new CellLab.Simulation({worldWidth:320,worldHeight:240,refinement:2,seed:17});s.advance(100);
const session=new inspector.Session();session.connect();const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
await post('Profiler.enable');await post('Profiler.start');const start=performance.now();s.advance(200);const elapsed=performance.now()-start,{profile}=await post('Profiler.stop');session.disconnect();
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),times=new Map();for(let i=0;i<profile.samples.length;i++){const node=nodes.get(profile.samples[i]),name=node.callFrame.functionName+' @ '+node.callFrame.url+':'+node.callFrame.lineNumber;times.set(name,(times.get(name)||0)+profile.timeDeltas[i]);}
const report={lattice:[s.width,s.height],cells:s.live().length,steps:200,mcsPerSecond:200000/elapsed,top:[...times].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([name,us])=>({name,ms:us/1000,percent:us/1000/elapsed*100}))};
await writeFile('output/v4/baseline-profile.json',JSON.stringify(report,null,2));await writeFile('output/v4/baseline.cpuprofile',JSON.stringify(profile));console.log(JSON.stringify(report,null,2));
