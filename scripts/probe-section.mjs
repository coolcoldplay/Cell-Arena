import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'));
const results=[];
for(const kernel of ['reference','fast']){
  const s=new CellLab.Simulation({worldWidth:320,worldHeight:240,refinement:2,kernel});s.advance(100);const begin=performance.now();s.advance(200);
  results.push({type:'benchmark',kernel,cells:s.live().length,lattice:[s.width,s.height],rate:200000/(performance.now()-begin)});
}
for(const yielding of [0,.35]){
  const s=new CellLab.Simulation({width:88,height:60,warmup:0,scene:'empty',settings:{normalMotility:0,immuneMotility:1,noise:0,alignment:0,cohesion:0,repulsion:0,chemotaxis:3,metabolism:0,immuneGrowth:0,growth:0,apoptosis:0,sectionYield:yielding}});
  for(let x=0;x<88;x++){s.paint(x,5,0,false,false);s.paint(x,54,0,false,false);}s.rebuildMask();
  for(let y=6;y<54;y+=12)for(let x=6;x<66;x+=12){const id=s.C.makeNewCellID(1),pts=[];for(let xx=x;xx<x+12;xx++)for(let yy=y;yy<y+12;yy++)if(Math.hypot(xx-20,yy-30)>6){s.C.setpix([xx,yy],id);pts.push(s.C.grid.p2i([xx,yy]));}const m=s.cells[id];m.target=s.C.getVolume(id);m.base=m.target;s.refreshPositions();s.section.initialize(m,pts);s.updateMechanics(m);}
  const id=s.seed(3,20,30,5),m=s.cells[id];m.px=1;m.py=0;let maxX=20,minFraction=1,invalid=0;const frames=[];
  for(let n=0;n<1800;n++){const f=s.fields.danger;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)if(!f.blocked[y*f.width+x])f.values[y*f.width+x]=x*.6;s.advance(1);maxX=Math.max(maxX,m.x);for(const c of s.live()){minFraction=Math.min(minFraction,c.sectionFraction);if(!c.dying&&!s.section.fits(c,c.nucleusX,c.nucleusY))invalid++;}if(n%200===0)frames.push({t:n,x:m.x,y:m.y,area:s.C.getVolume(id),fraction:m.sectionFraction,nx:m.nucleusX,ny:m.nucleusY});}
  results.push({type:'tissue',yielding,maxX,minFraction,invalid,cells:s.live().length,frames});
}
await writeFile('output/v4/section-probe.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
