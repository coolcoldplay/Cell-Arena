import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/display-fields.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=()=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,seed:17,sectionModel:false,settings:{mutation:0,metabolism:0,growth:0,apoptosis:0}});
function body(s,kind,x,y){const id=s.C.makeNewCellID(kind);for(let xx=x;xx<x+12;xx++)for(let yy=y;yy<y+12;yy++)s.C.setpix([xx,yy],id);s.refreshPositions();s.scanContacts();return s.cells[id];}
function antigen(s,m,sequence,channel=0){s.immunity.alter(m,g=>{g.peptides.forEach(p=>p.present=false);Object.assign(g.peptides[0],{present:true,sequence,channel,base:1});});m.expression.peptides[0]=1;m.expression.presentation=[1,1];s.immunity.summarize(m);}
const key=(s,m)=>s.immunity.visualReport().cloneProfiles[m.geneClone]?.[0];
test('inheritance and non-antigen mutations preserve color, peptide mutation changes it',()=>{
  const s=make(),a=body(s,2,15,15),b=body(s,2,45,15),seq=s.immunity.repertoire[0].sequence;antigen(s,a,seq);
  s.immunity.inherit(b,a.geneClone,a.expression);const original=key(s,a),color=CellLabDisplay.antigenProfileStyle(original);
  assert.equal(key(s,b),original);s.immunity.alter(b,g=>g.traits.proliferation=2);assert.notEqual(b.geneClone,a.geneClone);assert.equal(key(s,b),original);
  b.expression.peptides[0]=.01;s.immunity.summarize(b);assert.equal(key(s,b),original);assert.deepEqual(CellLabDisplay.antigenProfileStyle(key(s,b)),color);
  const next=s.immunity.substitute(seq);antigen(s,b,next);assert.notEqual(key(s,b),original);assert.notEqual(CellLabDisplay.antigenProfileStyle(key(s,b)).color,color.color);
});
test('independent founders with identical antigen sets share color; channel and antigen loss remain distinct',()=>{
  const s=make(),a=body(s,2,15,15),b=body(s,2,45,15),seq=s.immunity.repertoire[0].sequence;antigen(s,a,seq);antigen(s,b,seq);assert.notEqual(a.geneClone,b.geneClone);assert.equal(key(s,a),key(s,b));
  antigen(s,b,seq,1);assert.notEqual(key(s,a),key(s,b));s.immunity.alter(b,g=>g.peptides[0].present=false);assert.equal(key(s,b),undefined);
});
test('one stable receptor can match multiple profile colors without activation or new contact',()=>{
  const s=make(),a=body(s,2,15,15),b=body(s,2,45,15),ctl=body(s,3,70,45),r=s.immunity.repertoire[0];
  const seq=r.sequence,last='ATCG'.split('').find(c=>c!==seq.at(-1)&&!s.immunity.self.includes(seq.slice(0,-1)+c));antigen(s,a,seq,r.channel);antigen(s,b,seq.slice(0,-1)+last,r.channel);
  s.immunity.alter(ctl,g=>g.receptor={sequence:seq,channel:r.channel});ctl.primed=false;ctl.immunePhenotype='suppressive';
  const before=JSON.stringify({rng:[s.C.mt.mt,s.C.mt.mti,s.immunity.rng],metrics:s.immunity.metrics,activation:ctl.activation,genes:s.immunity.genes(ctl),counters:s.counters});
  const report=s.immunity.visualReport(),matches=report.immuneMatches[ctl.geneClone];assert.equal(matches.length,2);assert.ok(matches.includes(key(s,a))&&matches.includes(key(s,b)));
  assert.equal(JSON.stringify({rng:[s.C.mt.mt,s.C.mt.mti,s.immunity.rng],metrics:s.immunity.metrics,activation:ctl.activation,genes:s.immunity.genes(ctl),counters:s.counters}),before);
  const styles=CellLabDisplay.antigenVisuals(s.snapshot());assert.deepEqual(styles.nuclei.get(ctl.id).map(p=>p.color).sort(),[styles.outlines.get(a.id).segments[0].color,styles.outlines.get(b.id).segments[0].color].sort());
  s.immunity.alter(ctl,g=>g.receptor.channel=1-r.channel);assert.equal(s.immunity.visualReport().immuneMatches[ctl.geneClone].length,0);
});
test('low presentation stays dim with stable identity; dying cells have no matching overlay',()=>{
  const s=make(),a=body(s,2,15,15);antigen(s,a,s.immunity.repertoire[0].sequence);let styles=CellLabDisplay.antigenVisuals(s.snapshot()),bright=styles.outlines.get(a.id).segments[0];
  a.expression.presentation=[0,0];s.immunity.summarize(a);styles=CellLabDisplay.antigenVisuals(s.snapshot());assert.equal(styles.outlines.get(a.id).segments[0].color,bright.color);assert.ok(styles.outlines.get(a.id).segments[0].alpha<bright.alpha);
  s.beginDeath(a.id,'environment');styles=CellLabDisplay.antigenVisuals(s.snapshot());assert.equal(styles.outlines.size,0);
});
test('shared antigens keep the same segment color across tumors with different other antigens',()=>{
  const s=make(),a=body(s,2,15,15),b=body(s,2,45,15),r=s.immunity.repertoire[0];antigen(s,a,r.sequence,r.channel);antigen(s,b,r.sequence,r.channel);
  const shared=key(s,a);s.immunity.alter(b,g=>Object.assign(g.peptides[1],{present:true,sequence:s.immunity.repertoire[1].sequence,channel:1-r.channel}));
  const visuals=CellLabDisplay.antigenVisuals(s.snapshot()),one=visuals.outlines.get(a.id),two=visuals.outlines.get(b.id);assert.equal(one.segments.length,1);assert.equal(two.segments.length,2);assert.equal(one.segments[0].color,two.segments.find(p=>p.key===shared).color);
  const wrap={width:96,height:72,boundary:'wrap'};assert.equal(CellLabDisplay.antigenSegment(two,two.x+4,two.y+3,wrap).key,CellLabDisplay.antigenSegment(two,two.x+100,two.y+75,wrap).key);
});
test('nuclear arcs divide an irregular closed perimeter into equal lengths without gaps',()=>{
  const contour=[[0,0],[9,0],[9,2],[6,7],[0,3]],length=arc=>arc.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-arc[i][0],p[1]-arc[i][1]),0);
  for(const count of [1,2,3,7,19]){const arcs=CellLabDisplay.equalContourArcs(contour,count),total=length([...contour,contour[0]]);assert.equal(arcs.length,count);
    for(let i=0;i<count;i++){assert.ok(Math.abs(length(arcs[i])-total/count)<1e-9);assert.deepEqual(arcs[i].at(-1),arcs[(i+1)%count][0]);}}
  assert.deepEqual(CellLabDisplay.equalContourArcs([[0,0],[0,0]],2),[]);
});
test('nuclear color arcs repeat across periodic seams and snapshot cache invalidates after mutation',()=>{
  class Path{constructor(){this.points=[];}moveTo(x,y){this.points.push([x,y]);}lineTo(x,y){this.points.push([x,y]);}}
  const previous=globalThis.Path2D;globalThis.Path2D=Path;
  try{
    const key='0:ATCGAT',cell={id:1,kind:3,geneClone:8,hasNucleus:true,nucleusX:.1,nucleusY:20,nucleusRadius:4,nucleusStrainX:1,nucleusStrainY:1},s={width:96,height:72,boundary:'wrap',refinement:1,cells:[cell],immunity:{visuals:{profiles:[{key,count:1}],cloneProfiles:{},immuneMatches:{8:[key]}}}};
    const cache=new CellLabDisplay.Cache(),arcs=cache.nucleusArcBatches(s);assert.ok(arcs.some(b=>b.count===2));assert.equal(cache.nucleusArcBatches(s),arcs);
    const next={...s,immunity:{visuals:{...s.immunity.visuals,immuneMatches:{8:[]}}}};assert.equal(cache.nucleusArcBatches(next).length,0);
  }finally{globalThis.Path2D=previous;}
});
