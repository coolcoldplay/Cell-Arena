import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const c=vm.createContext({console,performance});
vm.runInContext(await readFile('vendor/artistoo.js','utf8'),c);vm.runInContext(await readFile('src/model.js','utf8'),c);
const reports=[];
for(const kind of [3,2])for(const gap of [0,6,10]){
  const s=new c.CellLab.Simulation({width:80,height:56,scene:'empty',warmup:0,seed:17,settings:{noise:0,alignment:0,cohesion:0,repulsion:0,chemotaxis:3,escape:0,apoptosis:0,growth:0,immuneGrowth:0,metabolism:0}});
  for(let y=0;y<56;y++)if(y<28-gap/2||y>=28+gap/2)for(let x=34;x<=38;x++)s.paint(x,y,0,false,false);
  s.rebuildMask();const id=s.seed(kind,20,28,kind===3?5:8),m=s.cells[id];m.px=1;m.py=0;if(kind===2){m.target=150;m.genome.invasion=2;s.updateMechanics(m);}
  let minAspect=1,maxX=m.x,fragments=0,minimumArea=Infinity;
  const begin=performance.now();
  for(let i=0;i<700;i++){
    // Controlled local cue; no target lookup or position override.
    for(const key of ['danger','cohesion']){const f=s.fields[key];for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)if(!f.blocked[y*f.width+x])f.values[y*f.width+x]=x*.5;}
    s.advance(1);maxX=Math.max(maxX,m.x);minimumArea=Math.min(minimumArea,s.C.getVolume(id));
    if(i%20===0){const pts=[...s.C.pixels()].filter(([,j])=>j===id).map(([p])=>p),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);minAspect=Math.min(minAspect,(Math.max(...ys)-Math.min(...ys)+1)/(Math.max(...xs)-Math.min(...xs)+1));if(s.components(id).length!==1)fragments++;}
  }
  reports.push({type:'slit',kind,gap,x:m.x,maxX,minAspect,minimumArea,fragments,mcsPerSecond:700000/(performance.now()-begin)});
}
for(const scene of ['ecosystem','stress','invasion']){
  const s=new c.CellLab.Simulation({scene,worldWidth:192,worldHeight:144,refinement:1,seed:17});const begin=performance.now();let fragments=0;
  for(let i=0;i<1600;i++){s.advance(1);if(i%100===0)for(const m of s.live())if(!m.dying&&s.components(m.id).length!==1)fragments++;}
  const snap=s.snapshot();reports.push({type:'scene',scene,time:s.C.time,counts:[1,2,3].map(k=>s.live().filter(c=>c.kind===k).length),counters:s.counters,fragments,orphans:snap.orphans,means:s.live().length?{oxygen:s.live().reduce((a,b)=>a+b.oxygen,0)/s.live().length,fitness:s.live().reduce((a,b)=>a+b.fitness,0)/s.live().length}:null,mcsPerSecond:1600000/(performance.now()-begin)});
}
await mkdir('output/v3',{recursive:true});await writeFile('output/v3/probe.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
