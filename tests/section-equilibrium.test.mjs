import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const quiet={vesselCount:0,metabolism:0,stressMutation:0,inflammation:0,apoptosis:0,kill:0,normalRepair:0,growth:0,immuneGrowth:0,normalMutationGain:0,tumorMutationGain:0};
function fill(s,kind,x,y,w,h){
  const id=s.C.makeNewCellID(kind),points=[];
  for(let xx=x;xx<x+w;xx++)for(let yy=y;yy<y+h;yy++){s.C.setpix([xx,yy],id);points.push(s.C.grid.p2i([xx,yy]));}
  const m=s.cells[id];m.base=m.target=points.length;s.refreshPositions();assert.ok(s.section.initialize(m,points));s.updateMechanics(m);return m;
}
function emptyArea(s){let n=0;for(const i of s.positions)if(s.C.pixti(i)===0)n++;return n;}

test('ordinary resting contacts do not pre-shrink the visible area target',()=>{
  const s=new CellLab.Simulation({scene:'empty',width:64,height:48,warmup:0,settings:{...quiet,normalMotility:0}});
  const a=fill(s,1,16,16,12,12);fill(s,1,28,16,12,12);s.scanContacts();
  assert.ok(a.confinement>0);
  for(let n=0;n<100;n++)s.section.update(1);
  assert.equal(a.planarTarget,a.target,'contact alone is not compressive strain');
  assert.equal(a.offPlaneTarget,0);
});

test('inward traction cannot store a large area deficit before actual deformation',()=>{
  const s=new CellLab.Simulation({scene:'empty',width:64,height:48,warmup:0,settings:quiet});
  const normal=fill(s,1,16,16,12,12),ctl=fill(s,3,28,16,8,8);ctl.px=-1;ctl.py=0;s.scanContacts();
  // Hold geometry still: direction bias must not create hidden space in advance.
  for(let n=0;n<100;n++)s.section.update(1);
  assert.equal(normal.planarTarget,normal.target);
});

test('a compressed cell recovers its visible target when traction stops despite continued contact',()=>{
  const s=new CellLab.Simulation({scene:'empty',width:64,height:48,warmup:0,settings:{...quiet,normalMotility:0}});
  const normal=fill(s,1,16,16,12,12),ctl=fill(s,3,28,16,8,8);ctl.px=-1;ctl.py=0;
  for(let x=25;x<28;x++)for(let y=16;y<24;y++)s.C.setpix([x,y],ctl.id);
  s.refreshPositions();s.scanContacts();
  for(let n=0;n<100;n++)s.section.update(1);
  const fraction=normal.sectionFraction;
  assert.ok(fraction<.95);assert.equal(normal.target,144);
  assert.ok(normal.planarTarget>=s.C.getVolume(normal.id),'yield cannot anticipate further shrinkage');
  s.set('immuneMotility',0);
  s.section.update(1);
  assert.ok(normal.sectionFraction>fraction&&normal.sectionFraction<1,'restoration is continuous');
  for(let n=0;n<100;n++)s.section.update(1);
  assert.ok(s.contacts.get(normal.id).has(ctl.id),'cells are still neighbours');
  assert.equal(normal.sectionFraction,1);assert.equal(normal.target,144);assert.equal(normal.offPlaneTarget,0);
});

test('one death in a confluent sheet does not release whole-tissue contraction',async t=>{
  const s=new CellLab.Simulation({scene:'oncogenesis',seed:17,worldWidth:240,worldHeight:180,refinement:1.5,boundary:'wrap',settings:quiet});
  await CellLabWasm.install(s,module);
  const initial=s.live().length,normal=s.live().filter(m=>m.state==='normal');
  const victim=normal.sort((a,b)=>Math.hypot(a.x-s.width/2,a.y-s.height/2)-Math.hypot(b.x-s.width/2,b.y-s.height/2))[0];
  const area=s.C.getVolume(victim.id),before=emptyArea(s);
  s.beginDeath(victim.id,'environment');s.advance(600);
  const gained=emptyArea(s)-before;
  t.diagnostic(`one death: empty-area gain / original cell area = ${(gained/area).toFixed(3)}`);
  assert.equal(s.deathHistory.length,1);assert.equal(s.counters.environment,1);assert.equal(s.live().length,initial-1);
  // A regression bound, not a cap imposed by the simulation on cavity size.
  assert.ok(gained<=3*area,'a single loss must not nucleate a many-cell cavity');
  assert.equal(s.snapshot().orphans,0);
});

test('repeated tissue loss still creates vacant space when repair and growth are disabled',async t=>{
  const s=new CellLab.Simulation({scene:'oncogenesis',seed:17,worldWidth:240,worldHeight:180,refinement:1,boundary:'wrap',settings:quiet});
  await CellLabWasm.install(s,module);
  const initial=s.live().length,victims=s.live().filter(m=>m.state==='normal')
    .sort((a,b)=>Math.hypot(a.x-s.width/2,a.y-s.height/2)-Math.hypot(b.x-s.width/2,b.y-s.height/2)).slice(0,24);
  const lostArea=victims.reduce((n,m)=>n+s.C.getVolume(m.id),0),before=emptyArea(s);
  for(const m of victims){s.beginDeath(m.id,'environment');s.advance(12);}
  s.advance(600);
  const gained=emptyArea(s)-before;
  t.diagnostic(`24 deaths: empty-area gain / original victims' area = ${(gained/lostArea).toFixed(3)}`);
  assert.equal(s.deathHistory.length,24);assert.equal(s.counters.environment,24);assert.equal(s.live().length,initial-24);
  assert.ok(gained>lostArea*.5,'survivors cannot expand without bound to hide tissue loss');
  assert.ok(gained<lostArea*1.5,'loss must not release a global target-area deficit');
  for(const m of s.live()){assert.equal(s.components(m.id).length,1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));}
});
