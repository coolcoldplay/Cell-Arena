import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/display-fields.js','src/experiment.js'])vm.runInThisContext(await readFile(file,'utf8'),{filename:file});

test('founder traits are seeded, independent of location and local hostility, with declared bounded priors',()=>{
  const values=[];
  for(let seed=1;seed<=24;seed++){
    const make=()=>new CellLab.Simulation({width:64,height:48,scene:'empty',seed,warmup:0});
    const a=make(),b=make();a.scene=b.scene='oncogenesis';
    const body=(s,x)=>{const id=s.C.makeNewCellID(1);for(let dx=0;dx<10;dx++)for(let y=15;y<25;y++)s.C.setpix([x+dx,y],id);s.refreshPositions();s.beginAbnormal(id);return s.cells[id];};
    const low=body(a,5),high=body(b,40);low.adversity=0;low.oxygen=1;low.acid=0;high.adversity=1;high.oxygen=0;high.acid=1;
    a.becomeTumor(low.id);b.becomeTumor(high.id);
    assert.deepEqual(low.genome,high.genome,'no location- or stress-directed founder assignment');
    assert.equal(low.kind,2);assert.equal(a.immunity.genes(low).peptides.length,1);
    assert.ok(low.genome.tolerance>=1.2&&low.genome.tolerance<=2.8);
    for(const key of ['proliferation','invasion'])assert.ok(low.genome[key]>=.6&&low.genome[key]<=1.4);
    values.push(low.genome);
  }
  for(const key of ['tolerance','proliferation','invasion'])assert.ok(new Set(values.map(g=>g[key])).size>20);
  assert.ok(values.some(g=>g.invasion>g.proliferation)&&values.some(g=>g.invasion<g.proliferation));
});

test('environment groups use actual living-cell pressure rather than geometry or phenotype labels',()=>{
  const cells=Array.from({length:8},(_,i)=>({id:i+1,birth:i+1,kind:2,adversity:i/7,x:8-i,y:0,geneClone:i%2,genome:{tolerance:1+i/7,proliferation:1,invasion:2-i/7},antigenLevel:i/7}));
  cells.push({...cells[0],id:9,kind:1},{...cells[7],id:10,dying:true,genome:{tolerance:30}});
  const before=JSON.stringify(cells),r=CellLabDisplay.tumorEcology({cells});
  assert.equal(r.count,8);assert.equal(r.clones,2);assert.equal(r.groupSize,2);assert.equal(r.all.tolerance.max,2);
  assert.ok(r.high.tolerance.mean>r.low.tolerance.mean);assert.ok(r.high.invasion.mean<r.low.invasion.mean);
  assert.equal(JSON.stringify(cells),before);
  const mirrored=cells.map(m=>({...m,x:-m.x,y:99}));assert.deepEqual(CellLabDisplay.tumorEcology({cells:mirrored}),r);
  assert.equal(CellLabDisplay.tumorEcology({cells:cells.map(m=>({...m,adversity:0}))}).groupSize,0);
  assert.equal(CellLabDisplay.tumorEcology({cells:cells.slice(0,7)}).groupSize,0);
});

test('trait shading distinguishes inherited potential from reversible antigen presentation and serializes',()=>{
  const D=CellLabDisplay,m={kind:2,genome:{tolerance:.25,proliferation:3,invasion:1.5},antigenLevel:1},before=JSON.stringify(m);
  const p=D.normalizeColors({tumorTrait:'tolerance'});assert.ok(D.bodyColor(m,p)[0]>D.bodyColor(m,D.normalizeColors())[0]);
  const a=D.normalizeColors({tumorTrait:'antigenLevel'}),hidden={...m,antigenLevel:0};assert.ok(D.bodyColor(hidden,a)[0]>D.bodyColor(m,a)[0]);assert.equal(JSON.stringify(m),before);
  const recipe={version:'4.0.0',schemaVersion:3,scene:'empty',seed:17,worldWidth:240,worldHeight:180,refinement:1.5,boundary:'wrap',settings:{},display:{cellColors:p}};
  assert.equal(CellLabExperiment.parse(recipe).display.cellColors.tumorTrait,'tolerance');
  assert.throws(()=>CellLabExperiment.parse({...recipe,display:{cellColors:{tumorTrait:'core'}}}));
  assert.equal(D.normalizeColors({tumorTrait:'core'}).tumorTrait,'proliferation');
});

test('tolerance trades injury resistance for resource demand, not free nutrients or universal growth superiority',()=>{
  const s=new CellLab.Simulation({width:64,height:48,scene:'empty',seed:1,warmup:0,settings:{traitCost:1,metabolism:0}});
  const cells=[8,38].map(x=>{const id=s.C.makeNewCellID(2);for(let dx=0;dx<10;dx++)for(let y=15;y<25;y++)s.C.setpix([x+dx,y],id);return s.cells[id];});
  s.refreshPositions();
  cells.forEach((m,i)=>s.immunity.alter(m,g=>{Object.assign(g.traits,{tolerance:i?2.8:.7,proliferation:1,invasion:1,repair:1});}));
  s.fields.oxygen.values.fill(.2);s.fields.glucose.values.fill(.2);s.fields.acid.values.fill(.6);s.updateMetabolism(10);
  assert.ok(cells[1].stress<cells[0].stress);assert.equal(cells[1].oxygen,cells[0].oxygen);
  assert.ok(s.traitEconomy(cells[1]).demand>s.traitEconomy(cells[0]).demand);
  assert.ok(s.traitEconomy(cells[1]).growth<s.traitEconomy(cells[0]).growth);
});
