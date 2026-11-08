import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'));
const results=[];
for(const kind of [3,2]){
  const s=new CellLab.Simulation({width:88,height:60,scene:'empty',warmup:0,seed:17,settings:{normalMotility:0,immuneMotility:1,tumorMotility:1,noise:0,alignment:0,repulsion:0,cohesion:0,chemotaxis:3,metabolism:0,growth:0,immuneGrowth:0,apoptosis:0}});
  for(let x=0;x<88;x++){s.paint(x,5,0,false,false);s.paint(x,54,0,false,false);}s.rebuildMask();
  for(let y=6;y<54;y+=12)for(let x=6;x<66;x+=12){const id=s.C.makeNewCellID(1);for(let xx=x;xx<x+12;xx++)for(let yy=y;yy<y+12;yy++)if(Math.hypot(xx-20,yy-30)>6)s.C.setpix([xx,yy],id);s.cells[id].target=s.C.getVolume(id);s.cells[id].base=s.cells[id].target;s.updateMechanics(s.cells[id]);}
  const id=s.seed(kind,20,30,5),m=s.cells[id];if(kind===2){m.target=130;m.base=130;m.genome.invasion=2;}m.px=1;m.py=0;
  const frames=[];let maxX=0,fragments=0;
  for(let n=0;n<900;n++){
    for(const key of ['danger','cohesion']){const f=s.fields[key];for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=x*.6;}
    s.advance(1);maxX=Math.max(maxX,m.x);
    if(n%100===0){for(const c of s.live())if(!c.dying&&s.components(c.id).length!==1)fragments++;frames.push({time:n,x:m.x,y:m.y,volume:s.C.getVolume(id),contact:s.contacts.get(id)?.size});}
  }
  results.push({kind,maxX,fragments,initialNormals:20,finalNormals:s.live().filter(c=>c.kind===1).length,frames});
}
await writeFile('output/v3/intercalation.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
