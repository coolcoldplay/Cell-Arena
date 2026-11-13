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
  const styles=CellLabDisplay.antigenVisuals(s.snapshot());assert.deepEqual(styles.outlines.get(ctl.id).segments.map(p=>p.color).sort(),[styles.outlines.get(a.id).segments[0].color,styles.outlines.get(b.id).segments[0].color].sort());
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
test('one peptide substitution replaces only its slot and preserves the other antigen colors',()=>{
  const s=make(),a=body(s,2,15,15),b=body(s,2,45,15);
  const sequences=['AAAAAA','AAAAAC','AAAAAG','AAAAAT'].filter(p=>!s.immunity.self.includes(p));assert.equal(sequences.length,4);
  s.immunity.alter(a,g=>g.peptides.forEach((p,i)=>Object.assign(p,{present:true,sequence:sequences[i],channel:0})));
  s.immunity.inherit(b,a.geneClone,a.expression);
  s.immunity.alter(b,g=>g.peptides[1].sequence='AAAACA');
  const profiles=s.immunity.visualReport().cloneProfiles;
  assert.deepEqual(profiles[a.geneClone],sequences.map(p=>'0:'+p).sort());
  assert.deepEqual(profiles[b.geneClone],['0:AAAAAA','0:AAAAAG','0:AAAAAT','0:AAAACA']);
  assert.equal(profiles[b.geneClone].includes('0:AAAAAC'),false);
});
test('immune body outlines support more than four matches, periodic seams and snapshot invalidation',()=>{
  const keys=Array.from({length:8},(_,i)=>'0:variant'+i),cell={id:1,kind:3,geneClone:8,x:.1,y:20,hasNucleus:false};
  const s={width:96,height:72,boundary:'wrap',cells:[cell],immunity:{visuals:{profiles:keys.map(key=>({key,count:1})),cloneProfiles:{},immuneMatches:{8:keys}}}};
  const cache=new CellLabDisplay.Cache(),data=cache.antigens(s),style=data.outlines.get(1);
  assert.equal(style.segments.length,8);assert.equal(cache.antigens(s),data);
  assert.ok(style.segments.every(p=>p.alpha===1));
  for(let i=0;i<8;i++){const angle=(i+.5)*2*Math.PI/8-Math.PI,x=style.x+4*Math.cos(angle),y=style.y+4*Math.sin(angle);
    assert.equal(CellLabDisplay.antigenSegment(style,x,y,s).key,keys[i]);
    assert.equal(CellLabDisplay.antigenSegment(style,x+96,y-72,s).key,keys[i]);}
  const next={...s,immunity:{visuals:{...s.immunity.visuals,immuneMatches:{8:[]}}}};
  assert.equal(cache.antigens(next).outlines.size,0);
  assert.equal(CellLabDisplay.antigenVisuals({...s,cells:[{...cell,dying:true}]}).outlines.size,0);
});
test('GPU color atlas retains every immune segment across rows and never overwrites the next cell',()=>{
  const segments=Array.from({length:8},(_,i)=>({...CellLabDisplay.antigenProfileStyle('0:variant'+i),alpha:1})),other={...segments[0],alpha:.4};
  const outlines=new Map([[1,{x:2,y:3,segments}],[2,{x:4,y:5,segments:[other]}],[65535,{x:8,y:9,segments}]]);
  const atlas=CellLabDisplay.antigenTextureData(outlines,{},4);
  assert.equal(atlas.width,4);assert.equal(atlas.height,3);
  assert.deepEqual([...atlas.centers.slice(4,8)],[2,3,8,0]);
  assert.deepEqual([...atlas.centers.slice(8,12)],[4,5,1,8]);
  assert.deepEqual([...atlas.centers.slice(65535*4)],[8,9,8,0]);
  for(let i=0;i<8;i++)assert.deepEqual([...atlas.colors.slice(i*4,i*4+4)],[...segments[i].rgb,255]);
  assert.deepEqual([...atlas.colors.slice(32,36)],[...other.rgb,102]);
  const reused=CellLabDisplay.antigenTextureData(new Map(),atlas,4);
  assert.equal(reused.centers,atlas.centers);assert.equal(reused.colors,atlas.colors);
  assert.ok(reused.centers.every(n=>n===0));assert.equal(reused.height,1);assert.ok(reused.colors.slice(0,16).every(n=>n===0));
});
test('GPU atlas overflow is explicit so Canvas can render the complete outline',()=>{
  const segments=Array.from({length:5},(_,i)=>({...CellLabDisplay.antigenProfileStyle('0:variant'+i),alpha:1}));
  assert.throws(()=>CellLabDisplay.antigenTextureData(new Map([[1,{x:1,y:1,segments}]]),{},2),/exceed render texture/);
});
