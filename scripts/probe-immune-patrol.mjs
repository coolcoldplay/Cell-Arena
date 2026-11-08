import vm from 'node:vm';import {readFile,writeFile,mkdir} from 'node:fs/promises';
const shared=await Promise.all(['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js'].map(f=>readFile(f,'utf8')));
const contexts={};for(const [name,file] of [['before','output/immune-patrol/model-before.js'],['after','src/model.js']]){const c=vm.createContext({console,performance});vm.runInContext(shared.join('\n')+'\n'+await readFile(file,'utf8'),c);contexts[name]=c;}
const module=await WebAssembly.compile(await readFile('build/cpm-kernel.wasm'));
const distance=(x,y,s)=>Math.hypot(Math.min(Math.abs(x),s.width-Math.abs(x)),Math.min(Math.abs(y),s.height-Math.abs(y)));
function measure(s){const live=s.live(),n=live.length;let touching=0,nearest=0,radius=0,largest=0;const seen=new Set();
  for(const m of live){if(s.contacts.get(m.id).size)touching++;radius+=distance(m.x-s.width/2,m.y-s.height/2,s);nearest+=Math.min(...live.filter(c=>c!==m).map(c=>distance(m.x-c.x,m.y-c.y,s)));if(!seen.has(m.id)){const queue=[m.id];seen.add(m.id);for(let i=0;i<queue.length;i++)for(const id of s.contacts.get(queue[i]).keys())if(!seen.has(id)){seen.add(id);queue.push(id);}largest=Math.max(largest,queue.length);}}
  return {contactFraction:touching/n,largestComponent:largest,nearestDistance:nearest/n,sourceDistance:radius/n};
}
const results=[];
for(const seed of [17,41,101])for(const [version,channel] of [['before',null],['after',null],['after','danger'],['after','trail']]){
  const c=contexts[version],s=new c.CellLab.Simulation({width:128,height:96,boundary:'wrap',scene:'empty',warmup:0,seed,settings:{growth:0,apoptosis:0,immuneGrowth:0,metabolism:0}});
  for(let i=0;i<12;i++){const angle=i/12*2*Math.PI,id=s.seed(3,64+24*Math.cos(angle),48+24*Math.sin(angle),4);if(!id)throw Error('Overlapping fixture');}
  await c.CellLabWasm.install(s,module);const tail=[];
  for(let n=0;n<600;n++){
    if(channel&&n%4===0){const f=s.fields[channel];for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const d=distance((x+.5)*s.fieldScale-64,(y+.5)*s.fieldScale-48,s);f.values[y*f.width+x]=10*Math.exp(-d*d/800);}}
    s.advance(1);if(n>=400&&n%10===0)tail.push(measure(s));
  }
  const row={version,channel,seed,mean:Object.fromEntries(Object.keys(tail[0]).map(k=>[k,tail.reduce((sum,r)=>sum+r[k],0)/tail.length])),recognitions:s.counters.recognitions,recruiters:s.live().filter(m=>m.recruitment>0).length};results.push(row);console.log(JSON.stringify(row));
}
await mkdir('output/immune-patrol',{recursive:true});await writeFile('output/immune-patrol/comparison.json',JSON.stringify({fixture:'12 immune cells on a radius-24 ring; 128x96 periodic dish; 600 MCS; tail mean 400-590; optional externally maintained Gaussian local field, amplitude 10, sigma 20',results},null,2));
