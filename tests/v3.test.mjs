import {cognateCulture,peptide,receptor,trait} from './cognate-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context=vm.createContext({structuredClone,console,performance});
vm.runInContext(await readFile(new URL('../vendor/artistoo.js',import.meta.url),'utf8'),context);
for(const f of ['immune-genetics.js','model.js'])vm.runInContext(await readFile(new URL('../src/'+f,import.meta.url),'utf8'),context);
const make=(settings={},options={})=>cognateCulture(new context.CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0,seed:17,settings:{growth:0,apoptosis:0,normalMotility:0,tumorMotility:0,immuneMotility:0,...settings},...options}));
const fill=(s,kind,x0,y0,x1,y1)=>{const id=s.C.makeNewCellID(kind);for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)s.C.setpix([x,y],id);s.refreshPositions();return id;};

test('connectivity permits a globally connected loop to open, but protects a narrow neck',()=>{
  const s=make(),id=s.C.makeNewCellID(3);
  for(let x=10;x<=20;x++){s.C.setpix([x,10],id);s.C.setpix([x,20],id);}
  for(let y=11;y<20;y++){s.C.setpix([10,y],id);s.C.setpix([20,y],id);}
  const i=s.C.grid.p2i([15,10]);assert.ok(s.topology.fulfilled(i-1,i,0,id));
  const n=fill(s,1,30,24,40,24),j=s.C.grid.p2i([35,24]);assert.equal(s.topology.fulfilled(j-1,j,0,n),false);
});

test('crowded tissue consumes oxygen and glucose, acidifies, and recovers gradually after removal',()=>{
  const dense=make({supply:1}),empty=make({supply:1});fill(dense,2,12,8,51,39);
  for(let i=0;i<100;i++){dense.updateEnvironment(4);empty.updateEnvironment(4);}
  const f=dense.fields.oxygen,index=f.index(8,6);
  assert.ok(f.values[index]<empty.fields.oxygen.values[index]-.2);
  assert.ok(dense.fields.glucose.values[index]<.6);
  assert.ok(dense.fields.acid.values[index]>.3);
  const before=f.values[index];for(const c of dense.live())dense.eraseCell(c.id);
  dense.updateEnvironment(4);assert.ok(dense.fields.oxygen.values[index]<before+.1,'no instant recovery');
  for(let i=0;i<150;i++)dense.updateEnvironment(4);
  assert.ok(dense.fields.oxygen.values[index]>before+.2);
  for(const key of ['oxygen','glucose','acid','density'])assert.ok(dense.fields[key].values.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});

test('sustained adverse conditions suppress immune mechanics and growth and accumulate lethal stress',()=>{
  const s=make({immuneMotility:1,growth:1,immuneGrowth:1});const ctl=s.seed(3,15,24,5),tumor=s.seed(2,40,24,6);
  s.cells[ctl].activation=1000;const drive=s.cells[ctl].drive,target=s.cells[tumor].target;
  s.fields.oxygen.values.fill(.01);s.fields.glucose.values.fill(.01);s.fields.acid.values.fill(.99);
  s.updateMetabolism(4);assert.ok(s.cells[ctl].drive<drive*.2);assert.ok(s.cells[ctl].fitness<.1);
  s.biology(20);assert.ok(s.cells[tumor].target-target<.1);
  assert.equal(s.cells[tumor].dying,false,'stress must persist');
  for(let i=0;i<400;i++)s.updateMetabolism(4);
  assert.ok(s.cells[tumor].dying);assert.equal(s.cells[tumor].deathCause,'environment');
});

test('environmental escape reads local gradients without any other cells',()=>{
  const s=make({immuneMotility:1,chemotaxis:0,noise:0,repulsion:0,alignment:0,escape:3}),id=s.seed(3,24,24,4),m=s.cells[id];
  m.px=0;m.py=1;const f=s.fields.oxygen;s.fields.glucose.values.fill(.15);s.fields.acid.values.fill(.6);
  for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=x/f.width;
  s.updateMetabolism(4);s.scanContacts();s.updatePolarity(4);assert.ok(m.px>0);
});

test('only cognate contact activates recruitment; responders do not relay it',()=>{
  const s=make({antigen:100,kill:0});const t=s.seed(2,30,24,5),a=s.seed(3,40,24,4),b=s.seed(3,12,24,4);
  for(let i=0;i<30;i++)s.updateLocal(4);
  assert.ok(s.cells[a].activation>0);assert.ok(s.cells[a].recruitment>0);assert.equal(s.cells[b].activation,0);
  s.updateSignals(4);assert.ok(s.fields.trail.values.some(v=>v>0));
  s.moveCell(a,50,24);assert.equal(s.cells[a].targetID,0);assert.ok(s.cells[a].recruitment>0);
  assert.equal(s.cells[b].recruitment,0);
});

test('immune lineage has finite division budget while tumors have no generation limit',()=>{
  const s=make({immuneDivisions:1});const id=s.seed(3,16,24,6),child=s.divide(id);
  assert.ok(child);assert.equal(s.cells[id].divisionsLeft,0);assert.equal(s.cells[child].divisionsLeft,0);assert.equal(s.divide(id),0);
  const t=s.seed(2,44,24,7);s.cells[t].generation=10000;assert.ok(s.divide(t));assert.equal(s.cells[t].generation,10001);
});

test('tumor traits inherit exactly without mutation and mutate reproducibly without aliasing',()=>{
  const s=make({mutation:0}),id=s.seed(2,30,24,7),before=JSON.stringify(s.cells[id].genome),daughter=s.divide(id);
  assert.ok(daughter);assert.equal(JSON.stringify(s.cells[daughter].genome),before);assert.equal(JSON.stringify(s.cells[id].genome),before);
  assert.equal(s.cells[id].genome,s.cells[daughter].genome);assert.ok(Object.isFrozen(s.cells[id].genome));assert.equal(s.cells[id].clone,s.cells[daughter].clone);
  const a=make({mutation:100}),b=make({mutation:100});
  for(const sim of [a,b]){const parent=sim.seed(2,30,24,7);sim.divide(parent);}
  assert.equal(JSON.stringify(a.live().map(c=>c.genome)),JSON.stringify(b.live().map(c=>c.genome)));
  assert.notEqual(a.live()[0].geneClone,a.live()[1].geneClone);
  for(const m of a.live()){assert.ok(m.genome.antigen>=0&&m.genome.antigen<=1);for(const k of ['tolerance','proliferation','invasion'])assert.ok(m.genome[k]>=.25&&m.genome[k]<=3);}
});

test('changing founder antigen probability never overwrites existing inherited traits',()=>{
  const s=make({antigen:0});const a=s.seed(2,15,24,5),before=JSON.stringify(s.cells[a].genome);
  s.set('antigen',100);const b=s.seed(2,45,24,5);
  assert.equal(JSON.stringify(s.cells[a].genome),before);assert.equal(s.cells[a].antigen,false);assert.equal(s.cells[b].antigen,true);
});

test('refinement changes lattice resolution but preserves physical cell target area and field scale',()=>{
  const a=make({}, {width:undefined,height:undefined,worldWidth:192,worldHeight:144,refinement:1}),b=make({}, {width:undefined,height:undefined,worldWidth:192,worldHeight:144,refinement:2});
  const x=a.seed(3,40,40,4),y=b.seed(3,80,80,8);
  assert.equal(b.width,a.width*2);assert.equal(b.cells[y].base,a.cells[x].base*4);assert.equal(b.fields.oxygen.width,a.fields.oxygen.width);
});

test('snapshot distinguishes explicit solid walls from inactive cell pixels',()=>{
  const s=make();s.seed(1,20,24,5);s.paint(40,24,2);const snap=s.snapshot();
  assert.ok(snap.walls);for(let i=0;i<snap.grid.length;i++)if(snap.grid[i])assert.equal(!!snap.walls[i],s.C.cellKind(snap.grid[i])===4);
  assert.equal(snap.orphans,0);
});

test('amoeboid cells and invasive tumors traverse a sub-diameter slit but never a closed wall',()=>{
  for(const kind of [3,2])for(const gap of [0,6]){
    const s=make({noise:0,alignment:0,cohesion:0,repulsion:0,chemotaxis:3,escape:0,metabolism:0,immuneMotility:1,tumorMotility:.7,immuneGrowth:0},{width:80,height:56});
    for(let y=0;y<56;y++)if(y<28-gap/2||y>=28+gap/2)for(let x=34;x<=38;x++)s.paint(x,y,0,false,false);s.rebuildMask();
    const id=s.seed(kind,20,28,kind===3?5:8),m=s.cells[id];m.px=1;m.py=0;if(kind===2){m.target=150;trait(s,m,'invasion',2);s.updateMechanics(m);}
    const walls=[...s.C.pixels()].filter(([,j])=>s.C.cellKind(j)===4),area=s.C.getVolume(id);let maxX=0;
    for(let n=0;n<700;n++){
      for(const key of ['danger','cohesion']){const f=s.fields[key];for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)if(!f.blocked[y*f.width+x])f.values[y*f.width+x]=x*.5;}
      s.advance(1);maxX=Math.max(maxX,m.x);assert.ok(s.C.getVolume(id)>area*.4,'passage cannot be obtained by deleting the body');
      if(n%50===0)assert.equal(s.components(id).length,1);
    }
    assert.ok(walls.every(([p,j])=>s.C.pixt(p)===j));
    if(gap)assert.ok(maxX>50,`kind ${kind} should reach the other side, got ${maxX}`);else assert.ok(maxX<34);
  }
});

test('immune cell intercalates through contacting normal tissue without killing or fragmenting neighbours',()=>{
  const s=make({normalMotility:0,immuneMotility:1,noise:0,alignment:0,repulsion:0,cohesion:0,chemotaxis:3,metabolism:0,immuneGrowth:0},{width:88,height:60});
  for(let x=0;x<88;x++){s.paint(x,5,0,false,false);s.paint(x,54,0,false,false);}s.rebuildMask();
  for(let y=6;y<54;y+=12)for(let x=6;x<66;x+=12){const id=s.C.makeNewCellID(1);for(let xx=x;xx<x+12;xx++)for(let yy=y;yy<y+12;yy++)if(Math.hypot(xx-20,yy-30)>6)s.C.setpix([xx,yy],id);const m=s.cells[id];m.target=s.C.getVolume(id);m.base=m.target;s.updateMechanics(m);}
  const id=s.seed(3,20,30,5);s.cells[id].px=1;s.cells[id].py=0;let maxX=0;
  for(let n=0;n<1200;n++){const f=s.fields.danger;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=x*.6;s.advance(1);maxX=Math.max(maxX,s.cells[id].x);}
  assert.ok(maxX>65);assert.equal(s.live().filter(c=>c.kind===1).length,20);
  for(const m of s.live())assert.equal(s.components(m.id).length,1);
  assert.equal(s.counters.kills,0);assert.equal(s.snapshot().orphans,0);
});

test('metabolic fields use the same no-flux barriers as chemokines',()=>{
  const s=make({supply:0,metabolism:0});for(let y=0;y<48;y++)s.paint(32,y,0,false,false);s.rebuildMask();
  for(const key of ['oxygen','glucose','acid']){const f=s.fields[key];f.values.fill(0);f.values[6*f.width+6]=1;}
  for(let n=0;n<50;n++)s.updateEnvironment(4);
  for(const key of ['oxygen','glucose','acid']){const f=s.fields[key];for(let y=0;y<f.height;y++)for(let x=9;x<f.width;x++)assert.equal(f.values[y*f.width+x],0);}
});

test('immune metabolic inhibition reduces delivered damage and activated growth at identical contact',()=>{
  const healthy=make({antigen:100,kill:1,immuneGrowth:1}),poor=make({antigen:100,kill:1,immuneGrowth:1});
  for(const s of [healthy,poor]){s.seed(2,30,24,5);s.seed(3,40,24,4);for(let n=0;n<30;n++)s.updateLocal(4);s.cells[1].damage=0;}
  // Hold cycle licensing and supported biomass equal to isolate metabolism.
  for(const s of [healthy,poor]){const m=s.cells[2];m.antigenMemory=.8;m.cycle.phase='G1';m.target=s.C.getVolume(m.id);s.fields.il2.values.fill(2);}
  poor.fields.oxygen.values.fill(.1);poor.fields.glucose.values.fill(.1);poor.fields.acid.values.fill(.9);poor.updateMetabolism(4);
  for(const s of [healthy,poor]){s.updateLocal(8);s.biology(8);}
  assert.ok(poor.cells[1].damage<healthy.cells[1].damage*.1);assert.ok(poor.cells[2].target<healthy.cells[2].target);
});

test('heritable tumor traits change growth, migration mechanics and stress tolerance',()=>{
  const a=make({growth:1,tumorMotility:1}),b=make({growth:1,tumorMotility:1});
  for(const s of [a,b]){s.seed(2,30,24,6);s.cells[1].cycle.phase='G1';s.cells[1].target=s.C.getVolume(1);}
  a.immunity.alter(a.cells[1],g=>{Object.assign(g.traits,{proliferation:.5,invasion:.5,tolerance:.5});});b.immunity.alter(b.cells[1],g=>{Object.assign(g.traits,{proliferation:2,invasion:2,tolerance:2});});
  const t=a.cells[1].target;a.biology(10);b.biology(10);assert.ok(b.cells[1].target-t>(a.cells[1].target-t)*3);assert.ok(b.cells[1].drive>a.cells[1].drive*3);
  for(const s of [a,b]){s.fields.oxygen.values.fill(.1);s.fields.glucose.values.fill(.1);s.fields.acid.values.fill(.8);s.updateMetabolism(100);}
  assert.ok(a.cells[1].stress>b.cells[1].stress*3);
});

test('normal cells also die after sustained severe metabolic stress',()=>{
  const s=make(),id=s.seed(1,30,24,6);s.fields.oxygen.values.fill(0);s.fields.glucose.values.fill(0);s.fields.acid.values.fill(1);
  s.updateMetabolism(4);assert.equal(s.cells[id].dying,false);
  for(let n=0;n<60;n++)s.updateMetabolism(4);
  assert.equal(s.cells[id].deathCause,'environment');assert.ok(s.cells[id].dying);
});

test('manual division immediately invalidates pre-division immune contact histories',()=>{
  const s=make({antigen:100,kill:0,mutation:0});const tumor=s.seed(2,30,24,5),ctl=s.seed(3,40,24,4);
  for(let n=0;n<40;n++)s.updateLocal(4);assert.equal(s.cells[ctl].targetID,tumor);
  assert.ok(s.divide(tumor));assert.equal(s.cells[ctl].targetID,0);assert.ok([...s.histories.values()].every(h=>h.dwell===0));
});

test('zero trait amplitude preserves scalar traits while antigen sequences can still mutate',()=>{
  const s=make({mutation:100,mutationSize:0}),id=s.seed(2,30,24,7),genome=JSON.stringify(s.cells[id].genome);
  assert.ok(s.divide(id));assert.ok(s.counters.mutations>0);assert.ok(s.live().every(m=>JSON.stringify(m.genome)===genome));
});

test('division preserves Act age instead of painting relabelled cytoplasm as a new protrusion',()=>{
  const s=make(),id=s.seed(2,30,24,7),before=[];let age=0;
  for(const [p,cid] of s.C.pixels())if(cid===id){const i=s.C.grid.p2i(p),a=age++%25;s.act.cellpixelsact[i]=a;before.push([i,a]);}
  assert.ok(s.divide(id));for(const [i,a] of before)assert.equal(s.act.pxact(i),a);
});
