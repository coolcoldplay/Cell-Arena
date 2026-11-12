import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const version=process.argv[2]||'after',out='output/patrol-memory';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
if(version!=='before')vm.runInThisContext(await readFile('src/immune-genetics.js','utf8'));
const model=version==='before'?execFileSync('git',['show','411dbd1:src/model.js'],{encoding:'utf8'}):await readFile('src/model.js','utf8');vm.runInThisContext(model,{filename:version+'-model.js'});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm')),results=[];
for(const seed of [17,41,101]){
  const s=new CellLab.Simulation({scene:'oncogenesis',worldWidth:240,worldHeight:180,refinement:1,seed,settings:{metabolism:0,stressMutation:0,progression:0,immuneGrowth:0}});
  await CellLabWasm.install(s,module);
  const visited=new Set(),checked=new Set(),dwell=new Map(),tracks=s.live().filter(m=>m.kind===3).map(m=>({id:m.id,start:[m.nucleusX,m.nucleusY],previous:[m.nucleusX,m.nucleusY],x:0,y:0,path:0,range:0,windows:0,confined:0,contacts:new Set()}));
  const mark=(i,id)=>{if(s.cells[id]?.kind===3&&!s.cells[id].dying)visited.add(i);};
  for(const i of s.positions)mark(i,s.C.pixti(i));s.C.post_setpix_listeners.push((i,old,id)=>mark(i,id));
  const begin=performance.now();
  for(let t=1;t<=1200;t++){
    s.advance(1);const seen=new Set();
    for(const p of tracks){const m=s.cells[p.id],x=m.nucleusX,y=m.nucleusY,dx=x-p.previous[0],dy=y-p.previous[1];p.x+=dx;p.y+=dy;p.path+=Math.hypot(dx,dy);p.range=Math.max(p.range,Math.hypot(x-p.start[0],y-p.start[1]));p.previous=[x,y];
      for(const edge of s.contacts.get(m.id).values()){const target=s.cells[edge.id];if(!target||target.dying||target.kind===3)continue;const key=m.birth+':'+target.birth;seen.add(key);const q=(dwell.get(key)||0)+Math.min(1,edge.length/(3*s.scale))*m.fitness;dwell.set(key,q);if(q>=6){checked.add(target.birth);p.contacts.add(target.birth);}}
      if(t%128===0){p.windows++;if(Math.hypot(p.x,p.y)<8)p.confined++;p.x=0;p.y=0;p.path=0;}
    }
    for(const key of dwell.keys())if(!seen.has(key))dwell.delete(key);
  }
  const row={version,seed,time:s.C.time,coverage:visited.size/(s.width*s.height),checked:checked.size,confinedWindows:tracks.reduce((n,p)=>n+p.confined,0),windows:tracks.reduce((n,p)=>n+p.windows,0),tracks:tracks.map(p=>({range:p.range,checked:p.contacts.size,confined:p.confined})),milliseconds:Math.round(performance.now()-begin)};results.push(row);console.log(JSON.stringify(row));
}
await mkdir(out,{recursive:true});await writeFile(out+'/'+version+'.json',JSON.stringify(results,null,2));
