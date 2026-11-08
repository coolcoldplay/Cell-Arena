import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context=vm.createContext({console,performance,Float32Array,Float64Array,Uint8Array,Uint16Array,Uint32Array,Int32Array,Math,Map,Set});
vm.runInContext(await readFile(new URL('../vendor/artistoo.js',import.meta.url),'utf8'),context);
const source=await readFile(new URL('../src/model.js',import.meta.url),'utf8').catch(()=>null);
if(source)vm.runInContext(source,context);
const library=()=>{assert.ok(context.CellLab,'CellLab model with local communication is available');return context.CellLab;};
const create=(settings={})=>{const {Simulation}=library();return new Simulation({width:64,height:48,scene:'empty',warmup:0,seed:17,settings:{normalMotility:0,tumorMotility:0,immuneMotility:0,growth:0,apoptosis:0,...settings}});};
const disk=(s,kind,x,y,r=5)=>s.seed(kind,x,y,r);
test('diffusion is positive, conserves mass without decay, then decays',()=>{
  const {SignalField}=library();const f=new SignalField(16,12,false);f.values[6*16+8]=10;
  for(let i=0;i<30;i++)f.step(.18,0);
  assert.ok(f.values.every(v=>Number.isFinite(v)&&v>=0));
  assert.ok(Math.abs(f.values.reduce((a,b)=>a+b,0)-10)<1e-4);
  assert.ok(f.values[6*16+7]>0);
  f.step(.18,.1);assert.ok(f.values.reduce((a,b)=>a+b,0)<9.1);
});
test('solid barriers prevent signal transport; periodic boundaries wrap',()=>{
  const {SignalField}=library();const f=new SignalField(16,12,false);
  for(let y=0;y<12;y++)f.blocked[y*16+8]=1;
  f.values[6*16+6]=10;for(let i=0;i<80;i++)f.step(.2,0);
  for(let y=0;y<12;y++)for(let x=9;x<16;x++)assert.equal(f.values[y*16+x],0);
  const torus=new SignalField(16,12,true);torus.values[6*16]=10;torus.step(.2,0);assert.ok(torus.values[6*16+15]>0);
});
test('recognition and damage require present membrane contact and antigen',()=>{
  const s=create({antigen:100,kill:2});const tumor=disk(s,2,31,24),ctl=disk(s,3,10,24,4);
  s.updateLocal(100);assert.equal(s.cells[tumor].damage,0);assert.equal(s.counters.recognitions,0);
  // Recreate truly adjacent compact cells; only shared lattice edges count.
  const t=create({antigen:0,kill:2});const target=disk(t,2,30,24),immune=disk(t,3,40,24,4);
  t.scanContacts();assert.ok(t.contacts.get(target)?.has(immune));
  for(let i=0;i<30;i++)t.updateLocal(4);
  assert.equal(t.cells[target].damage,0);assert.equal(t.counters.recognitions,0);
  t.cells[target].genome.antigen=1;t.applyGenome(t.cells[target]);for(let i=0;i<80;i++)t.updateLocal(4);
  assert.ok(t.counters.recognitions>0);assert.ok(t.cells[target].dying);assert.equal(t.cells[target].deathCause,'kill');
});
test('contact loss stops damage immediately and clears the immune binding',()=>{
  const s=create({antigen:100,kill:1});const target=disk(s,2,30,24),ctl=disk(s,3,40,24,4);
  for(let i=0;i<50&&!s.cells[target].damage;i++)s.updateLocal(4);
  assert.ok(s.cells[target].damage>0);s.eraseCell(ctl);
  const before=s.cells[target].damage;s.updateLocal(20);
  assert.ok(s.cells[target].damage<=before);assert.ok(!s.cells[ctl]);
});
test('a local signal gradient changes polarity without any tumor coordinates',()=>{
  const s=create({immuneMotility:1,chemotaxis:3,noise:0,alignment:0,cohesion:0,repulsion:0});const ctl=disk(s,3,24,24,4);
  s.cells[ctl].px=0;s.cells[ctl].py=1;
  const f=s.fields.danger;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)f.values[y*f.width+x]=x*.5;
  s.scanContacts();s.updatePolarity(4);
  assert.ok(s.cells[ctl].px>0);assert.equal(s.live().filter(c=>c.kind===2).length,0);
});
test('local contact alignment increases directional agreement',()=>{
  const s=create({normalMotility:1,chemotaxis:0,noise:0,alignment:3,cohesion:0,repulsion:0});const a=disk(s,1,30,24),b=disk(s,1,40,24,4);
  s.cells[a].px=1;s.cells[a].py=0;s.cells[b].px=0;s.cells[b].py=1;
  s.scanContacts();s.updatePolarity(4);
  assert.ok(s.cells[a].py>0);assert.ok(s.cells[b].px>0);
});
test('CPM barriers remain fixed and living cells remain connected',()=>{
  const s=create({immuneMotility:1});disk(s,3,18,24,4);
  for(let y=0;y<48;y++)s.paint(32,y,1,false);
  const barrier=[...s.C.pixels()].filter(([,id])=>s.C.cellKind(id)===4).map(([p,id])=>[p,id]);
  s.advance(100);
  assert.ok(barrier.every(([p,id])=>s.C.pixt(p)===id));
  for(const c of s.live())assert.equal(s.components(c.id).length,1);
});
test('tumor division conserves pixels and apoptosis removes the cell',()=>{
  const s=create();const id=disk(s,2,30,24,7),before=s.C.getVolume(id),child=s.divide(id);
  assert.ok(child);assert.equal(s.C.getVolume(id)+s.C.getVolume(child),before);
  assert.equal(s.components(id).length,1);assert.equal(s.components(child).length,1);
  s.beginDeath(child,'spontaneous');s.advance(180);
  assert.ok(!s.cells[child]);assert.equal(s.counters.apoptosis,1);
});
test('antigen probability endpoints and fixed seed are reproducible',()=>{
  const a=create({antigen:0}),b=create({antigen:0});
  for(const s of [a,b]){disk(s,2,20,20);disk(s,3,40,25,4);s.advance(20);}
  assert.deepEqual(Array.from(a.C.grid._pixels),Array.from(b.C.grid._pixels));
  assert.equal(a.live().find(c=>c.kind===2).antigen,false);a.set('antigen',100);const fresh=disk(a,2,48,12,3);assert.equal(a.cells[fresh].antigen,true);assert.equal(a.live().find(c=>c.kind===2).antigen,false);
});
test('wall-clock pacing changes steps by multiplier and pause clears debt',()=>{
  const {StepClock}=library();const a=new StepClock(20),b=new StepClock(80);
  let low=0,high=0;for(let i=0;i<100;i++){low+=a.add(10);high+=b.add(10);}
  assert.equal(low,20);assert.equal(high,80);b.reset();assert.equal(b.add(0),0);
});
test('mouse relocation conserves the actual body and stops at obstacles',()=>{
  const s=create(),id=disk(s,1,15,24),area=s.C.getVolume(id);
  assert.equal(typeof s.moveCell,'function','Model supports geometry-aware dragging');
  for(let y=0;y<48;y++)s.paint(33,y,1,false);
  const moved=s.moveCell(id,28,24);assert.ok(moved.steps>0);
  assert.equal(s.C.getVolume(id),area);assert.equal(s.components(id).length,1);
  const blocked=s.moveCell(id,50,24);assert.ok(blocked.blocked);assert.ok(s.cells[id].x<33);
  for(const [p,cid] of s.C.pixels())if(cid===id)assert.ok(p[0]<32);
});
test('mouse signals are deposited in the selected channel only',()=>{
  const s=create();s.pulse(20,20,'cohesion');
  assert.ok(s.fields.cohesion.values.some(v=>v>0));assert.ok(s.fields.danger.values.every(v=>v===0));
});
test('periodic CPM keeps seam-spanning bodies connected and detects real contacts',()=>{
  const {Simulation}=library(),s=new Simulation({width:64,height:48,scene:'empty',warmup:0,boundary:'wrap',settings:{growth:0,apoptosis:0}});
  const a=s.seed(1,2,24,3),b=s.seed(2,59,24,3);assert.ok(a&&b);
  assert.equal(s.components(a).length,1);s.scanContacts();assert.ok(s.contacts.get(a).has(b));
  const before=s.C.getVolume(a);s.moveCell(a,4,24);assert.equal(s.C.getVolume(a),before);assert.equal(s.components(a).length,1);
  s.advance(60);for(const m of s.live())assert.equal(s.components(m.id).length,1);
});
