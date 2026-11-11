import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'));
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const quiet={growth:0,apoptosis:0,metabolism:0,immuneGrowth:0,normalMotility:0,noise:0,alignment:0,cohesion:0,repulsion:0,chemotaxis:3};
async function sim(extra={}){const s=new CellLab.Simulation({width:96,height:72,warmup:0,scene:'empty',settings:quiet,...extra});await CellLabWasm.install(s,module);return s;}
function fill(s,kind,points){const id=s.C.makeNewCellID(kind);for(const [x,y] of points)s.C.setpix([x,y],id);const m=s.cells[id];m.target=s.C.getVolume(id);m.base=m.target;s.refreshPositions();assert.ok(s.section.initialize(m,points.map(p=>s.C.grid.p2i(p))));s.updateMechanics(m);return id;}
function rect(x,y,w,h){const out=[];for(let a=x;a<x+w;a++)for(let b=y;b<y+h;b++)out.push([a,b]);return out;}
function gradient(s){const f=s.fields.danger;for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)if(!f.blocked[y*f.width+x])f.values[y*f.width+x]=x*.6;}
test('bounded reversible slice yielding retains biological target and metabolic material',async()=>{
  const s=await sim(),a=fill(s,1,rect(20,25,12,12)),b=fill(s,3,rect(32,25,8,8)),m=s.cells[a];s.cells[b].px=-1;s.cells[b].py=0;const mass=m.target;
  // Yield follows occupied-area displacement, rather than manufacturing a
  // smaller target just because an immune cell points at an intact neighbour.
  for(const p of rect(29,25,3,8))s.C.setpix(p,b);
  s.refreshPositions();s.scanContacts();
  for(let i=0;i<100;i++)s.section.update(1);
  assert.ok(m.sectionFraction>=.65&&m.sectionFraction<.95);assert.equal(m.target,mass);assert.equal(m.planarTarget+m.offPlaneTarget,mass);
  s.prepareEnvironment();const visible=s.densities[1].reduce((a,b)=>a+b,0),material=s.loads[1].reduce((a,b)=>a+b,0);assert.ok(material>visible*1.05);
  const fraction=m.sectionFraction;s.set('sectionYield',0);s.section.update(1);assert.ok(m.sectionFraction-fraction<=.006001,'no instantaneous height/slice restoration');
  s.eraseCell(b);s.scanContacts();for(let i=0;i<100;i++)s.section.update(1);assert.equal(m.sectionFraction,1);assert.equal(m.offPlaneTarget,0);assert.equal(m.target,mass);
});
test('a short front can grow, but a one-pixel filament must widen and a lobe cannot sever',async()=>{
  const s=await sim(),id=fill(s,3,rect(25,25,8,8));const i=(x,y)=>s.C.grid.p2i([x,y]);
  assert.equal(s.section.allowed(i(32,29),i(33,29),id,0),true);
  s.C.setpixi(i(33,29),id);
  assert.equal(s.section.allowed(i(33,29),i(34,29),id,0),false,'one-pixel shaft cannot elongate');
  const core=s.cells[id];assert.equal(s.section.allowed(i(24,25),i(core.nucleusX,core.nucleusY),0,id),false,'nuclear occupancy protected');
  assert.equal(s.topology.fulfilled(i(33,28),i(32,29),0,id),false,'tip cannot be severed from its body');
});
test('nuclear body passes a sufficient slit, but cannot cross a narrower opening or solid wall',async()=>{
  for(const gap of [0,2,7]){
    const s=await sim();for(let y=0;y<s.height;y++)if(y<32-Math.floor(gap/2)||y>=32+Math.ceil(gap/2))s.paint(48,y,0,false,false);s.rebuildMask();
    const id=s.seed(3,22,32,5),m=s.cells[id];m.px=1;m.py=0;let reached=0;
    for(let n=0;n<900;n++){gradient(s);s.advance(1);assert.ok(s.section.fits(m,m.nucleusX,m.nucleusY));reached=Math.max(reached,m.nucleusX);}
    if(gap<3)assert.ok(reached<48,`gap ${gap}: ${reached}`);else assert.ok(reached>60,`sufficient opening: ${reached}`);
    for(let y=0;y<s.height;y++)if(y<32-Math.floor(gap/2)||y>=32+Math.ceil(gap/2))assert.equal(s.C.cellKind(s.C.pixt([48,y])),4);
  }
});
test('immune body intercalates through a sealed tissue strip while neighbours yield, stay alive and keep their nuclei',async()=>{
  const s=await sim({width:88,height:60});for(let x=0;x<88;x++){s.paint(x,5,0,false,false);s.paint(x,54,0,false,false);}s.rebuildMask();
  const normal=[];for(let y=6;y<54;y+=12)for(let x=6;x<66;x+=12)normal.push(fill(s,1,rect(x,y,12,12).filter(([xx,yy])=>Math.hypot(xx-20,yy-30)>6)));
  const id=s.seed(3,20,30,5),m=s.cells[id];m.px=1;m.py=0;let min=1;
  for(let n=0;n<550;n++){gradient(s);s.advance(1);for(const c of s.live()){assert.ok(s.section.fits(c,c.nucleusX,c.nucleusY));min=Math.min(min,c.sectionFraction);}}
  assert.ok(m.x>66,`reached ${m.x}`);assert.ok(min<.9);assert.equal(s.live().length,21);assert.equal(s.counters.kills,0);for(const id of normal)assert.equal(s.components(id).length,1);
});
test('division conserves full target and out-of-slice budget and creates two valid nuclear regions',async()=>{
  const s=await sim(),id=fill(s,2,rect(25,25,18,12)),m=s.cells[id];m.sectionFraction=.72;m.target=300;s.updateMechanics(m);const target=m.target,hidden=m.offPlaneTarget;
  const child=s.divide(id);assert.ok(child);assert.equal(m.target+s.cells[child].target,target);assert.ok(Math.abs(m.offPlaneTarget+s.cells[child].offPlaneTarget-hidden)<1e-10);
  for(const c of [m,s.cells[child]])assert.ok(s.section.fits(c,c.nucleusX,c.nucleusY));
  s.moveCell(child,70,45);assert.ok(s.section.fits(s.cells[child],s.cells[child].nucleusX,s.cells[child].nucleusY));
});
