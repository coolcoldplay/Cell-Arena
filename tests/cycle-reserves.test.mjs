import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/model.js','src/experiment.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(settings={})=>new CellLab.Simulation({width:96,height:72,scene:'empty',warmup:0,seed:17,sectionModel:false,settings:{apoptosis:0,metabolism:0,mutation:0,normalMutationGain:0,tumorMutationGain:0,stressMutation:0,inflammation:0,normalRepair:0,...settings}});
function body(s,kind,x=30,y=22,w=20,h=20){const id=s.C.makeNewCellID(kind);for(let xx=x;xx<x+w;xx++)for(let yy=y;yy<y+h;yy++)s.C.setpix([xx,yy],id);s.refreshPositions();s.scanContacts();return s.cells[id];}
function environment(s,o=1,g=1,a=0){s.fields.oxygen.values.fill(o);s.fields.glucose.values.fill(g);s.fields.acid.values.fill(a);s.updateMetabolism(0);}
test('G1 and S use different nutrient loads while real occupied density is unchanged',()=>{
 const s=make(),m=body(s,2);m.cycle.phase='G1';s.prepareEnvironment();assert.ok(s.metabolicLoads,'resource-specific loads');const old=s.metabolicLoads.map(x=>x.reduce((a,b)=>a+b,0)),density=s.fields.density.values.slice();
 m.cycle.phase='S';s.prepareEnvironment();const next=s.metabolicLoads.map(x=>x.reduce((a,b)=>a+b,0));assert.notDeepEqual(next,old);assert.notEqual(next[0]/next[1],old[0]/old[1]);assert.deepEqual(s.fields.density.values,density);
});
test('reserve permits brief moderate deprivation, drains without supply, and refills only with nutrients',()=>{
 const s=make({growth:1}),m=body(s,2);assert.ok(m.resources);m.target=m.base;m.cycle.phase='S';m.resources.energy=.8;m.resources.precursor=.8;environment(s,.35,.18,0);
 const p=m.cycle.progress;s.biology(1);assert.ok(m.cycle.progress>p);const e=m.resources.energy;environment(s,0,0,0);for(let i=0;i<100;i++)s.biology(1);assert.ok(m.resources.energy<e);const starved=m.resources.energy;environment(s);for(let i=0;i<60;i++)s.biology(1);assert.ok(m.resources.energy>starved);
});
test('S phase starvation accumulates replication damage independently of immune injury; repair uses available resources',()=>{
 const s=make(),a=body(s,2,10,20),b=body(s,2,55,20);assert.ok(a.resources);a.cycle.phase='S';b.cycle.phase='G1';a.target=a.base;b.target=b.base;
 environment(s,0,0,0);for(let i=0;i<100;i++)s.biology(1);assert.ok(a.resources.dnaDamage>b.resources.dnaDamage);assert.equal(a.damage,0);assert.equal(s.counters.killStarted,0);
 a.cycle.phase='G2';a.resources.dnaDamage=.5;environment(s);const damage=a.resources.dnaDamage;for(let i=0;i<100;i++)s.biology(1);assert.ok(a.resources.dnaDamage<damage);
});
test('DNA checkpoint holds G2 and prevents completion until repaired; zero coupling restores the legacy gate',()=>{
 const s=make({dnaRepair:0}),m=body(s,2);assert.ok(m.resources);m.target=m.base;m.cycle.phase='G2';m.cycle.progress=.5;m.resources.dnaDamage=.7;s.biology(1);assert.equal(m.cycle.arrest,'dna');assert.equal(m.cycle.progress,.5);
 s.set('cycleCoupling',0);s.biology(1);assert.notEqual(m.cycle.arrest,'dna');assert.ok(m.cycle.progress>.5);
});
test('division partitions reserves by daughter mass, retains DNA damage and does not refill newborn cells',()=>{
 const s=make(),m=body(s,2);assert.ok(m.resources);m.target=400;m.resources.energy=.25;m.resources.precursor=.3;m.resources.dnaDamage=.22;
 const before=s.reserveAmounts(m),child=s.divide(m.id);assert.ok(child);const cells=[m,s.cells[child]],after=cells.map(c=>s.reserveAmounts(c));
 for(const key of ['energy','precursor'])assert.ok(Math.abs(after[0][key]+after[1][key]-before[key])<1e-6,key);
 for(const c of cells){assert.equal(c.resources.dnaDamage,.22);assert.notEqual(c.resources,cells.find(x=>x!==c).resources);}
});
test('high tumor traits cost nutrients and investment; zero tradeoff restores unpenalized behavior',()=>{
 const s=make({traitCost:1}),m=body(s,2);assert.equal(typeof s.traitEconomy,'function');m.genome={...m.genome,proliferation:.8,invasion:.8,tolerance:.8};const modest=s.traitEconomy(m);
 m.genome={...m.genome,proliferation:2,invasion:2,tolerance:2};const high=s.traitEconomy(m);assert.ok(high.demand>modest.demand);assert.ok(high.growth<modest.growth);assert.ok(high.migration<modest.migration);
 s.set('traitCost',0);assert.deepEqual(s.traitEconomy(m),{demand:1,growth:1,migration:1});
});
test('normal repair requires an actual local gap, respects lineage limits and excludes precancerous cells',()=>{
 const s=make({normalRepair:1,normalDivisions:2}),m=body(s,1);m.base=100;m.target=100;assert.equal(m.divisionsLeft,2);
 s.biology(1);assert.equal(m.cycle.arrest,'');for(let i=0;i<1800&&!s.counters.normalDivisions;i++)s.biology(1);assert.equal(s.counters.normalDivisions,1);
 assert.ok(s.live().every(c=>c.divisionsLeft===1));const daughter=s.live()[1];daughter.divisionsLeft=0;daughter.cycle.phase='G0';s.biology(1);assert.equal(daughter.cycle.arrest,'lineage');assert.equal(s.divide(daughter.id),0);
 s.beginAbnormal(m.id);for(let i=0;i<80;i++)s.biology(1);assert.equal(m.cycle.phase,'G0');assert.equal(s.counters.normalDivisions,1);
 const full=make({normalRepair:1}),n=body(full,1,0,0,96,72);n.target=n.base=96*72;for(let i=0;i<200;i++)full.biology(1);assert.equal(n.cycle.phase,'G0');assert.equal(n.cycle.arrest,'contact');assert.equal(full.counters.normalDivisions,0);
});
test('normal lineage budget is finite on both branches, tumor transformation has no division limit',()=>{
 const s=make({normalRepair:1,normalDivisions:1}),m=body(s,1);const child=s.divide(m.id);assert.ok(child);assert.equal(m.divisionsLeft,0);assert.equal(s.cells[child].divisionsLeft,0);assert.equal(s.divide(m.id),0);
 s.beginAbnormal(m.id);s.becomeTumor(m.id);assert.equal(m.kind,2);assert.equal(m.divisionsLeft,null);
});
test('pause, snapshot, and zero-time metabolism do not consume reserves; new controls are validated and exported',()=>{
 const s=make(),m=body(s,2);assert.ok(m.resources);const before=structuredClone(m.resources);s.snapshot();s.updateMetabolism(0);s.biology(0);assert.deepEqual(m.resources,before);
 const snap=s.snapshot();snap.cells[0].resources.energy=0;assert.notEqual(m.resources.energy,0);
 const data={scene:'empty',seed:17,boundary:'wrap',refinement:1,worldWidth:96,worldHeight:72,settings:{cycleCoupling:1,reserveCapacity:80,replicationStress:1,dnaRepair:1,checkpointIntegrity:1,traitCost:.5,normalRepair:.25,normalDivisions:4}};
 assert.deepEqual(CellLabExperiment.parse(data).config.settings,data.settings);assert.throws(()=>CellLabExperiment.parse({...data,settings:{...data.settings,normalDivisions:1.5}}));
});
