import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/display-fields.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=()=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,settings:{metabolism:0,growth:0,apoptosis:0}});
function reshape(s,m,a,b){for(const [p,id]of [...s.C.pixels()])if(id===m.id)s.C.setpix(p,0);for(let x=25;x<71;x++)for(let y=18;y<54;y++)if(((x-48)/a)**2+((y-36)/b)**2<=1)s.C.setpix([x,y],m.id);s.refreshPositions();m.nucleusX=48;m.nucleusY=36;}
test('nuclear contours are individually varied and remain bounded within the protected envelope',()=>{
  const s=make();for(const [kind,x]of[[1,20],[2,48],[3,76]])s.seed(kind,x,36,5);
  const contours=s.live().map(m=>CellLabDisplay.nucleusContour(m));assert.ok(contours.every(p=>p.length===32));
  for(const [i,m]of s.live().entries()){const radii=contours[i].map(([x,y])=>Math.hypot(x,y));assert.ok(Math.max(...radii)-Math.min(...radii)>.03*m.nucleusRadius);assert.ok(Math.max(...radii)<m.nucleusRadius);assert.ok(Math.min(...radii)>.6*m.nucleusRadius);}
  assert.notDeepEqual(contours[0].map(p=>p.map(v=>v/s.live()[0].nucleusRadius)),contours[1].map(p=>p.map(v=>v/s.live()[1].nucleusRadius)));
});
test('nuclear shape responds gradually to real local body geometry, then relaxes without random draws or altered occupancy',()=>{
  const s=make(),id=s.seed(2,48,36,6),m=s.cells[id];reshape(s,m,17,5);const grid=s.C.grid._pixels.slice(),rng=s.C.mt.mt.slice();
  s.section.updateNucleusShape(m,4);const first=Math.hypot(m.nucleusStrainX,m.nucleusStrainY);for(let i=0;i<40;i++)s.section.updateNucleusShape(m,4);const stretched=Math.hypot(m.nucleusStrainX,m.nucleusStrainY);
  assert.ok(stretched>first+.08);assert.ok(m.nucleusStrainX>.1&&Math.abs(m.nucleusStrainY)<.06);assert.deepEqual(s.C.grid._pixels,grid);assert.deepEqual(s.C.mt.mt,rng);
  reshape(s,m,11,11);for(let i=0;i<80;i++)s.section.updateNucleusShape(m,4);assert.ok(Math.hypot(m.nucleusStrainX,m.nucleusStrainY)<stretched*.6);assert.ok(s.section.fits(m,48,36));
});
test('paused snapshots and display never animate the nucleus or change geometry; deformation remains exported',()=>{
  const s=make(),id=s.seed(3,48,36,5);s.advance(20);const a=s.snapshot(),before=JSON.stringify(a.cells),rng=s.C.mt.mt.slice();
  assert.ok(Number.isFinite(a.cells[0].nucleusStrainX));for(let i=0;i<20;i++)CellLabDisplay.nucleusContour(a.cells[0]);s.section.updateNucleusShape(s.cells[id],0);
  assert.equal(JSON.stringify(s.snapshot().cells),before);assert.deepEqual(s.C.mt.mt,rng);
});
