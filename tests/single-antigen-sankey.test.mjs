import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/experiment.js','src/display-fields.js','src/lineage-sankey.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=()=>new CellLab.Simulation({width:128,height:96,scene:'empty',seed:17,warmup:0,sectionModel:false,settings:{mutation:0,metabolism:0,growth:0,apoptosis:0}});
function body(s,kind,x){const id=s.C.makeNewCellID(kind);for(let a=x;a<x+8;a++)for(let b=20;b<28;b++)s.C.setpix([a,b],id);s.refreshPositions();return s.cells[id];}
function set(s,m,sequence){s.immunity.alter(m,g=>Object.assign(g.peptides[0],{sequence,channel:0,present:true,base:1}));}
test('one-slot model retains a single epitope through every division mutation category',()=>{
 const s=make(),p=body(s,2,15);s.settings.mutation=100;const events=new Set();
 for(let n=0;n<400;n++){const d={...p,resources:{...p.resources}};s.immunity.inherit(d,p.geneClone,p.expression);assert.equal(s.immunity.genes(d).peptides.length,1);assert.equal(d.expression.peptides.length,1);events.add(s.immunity.clones.get(d.geneClone).event.split(' ')[0]);}
 assert.ok(events.has('peptide')&&events.has('trait')&&events.has('presentation'));assert.throws(()=>s.immunity.alter(p,g=>g.peptides.push({...g.peptides[0]})),/one antigen/);
 for(const kind of [1,3])assert.equal(s.immunity.genes(body(s,kind,kind*25+15)).peptides.length,1);
});
test('antigen branches survive trait changes and extinction; convergent antigens never merge ancestry',()=>{
 const s=make(),a=body(s,2,15),b=body(s,2,45),c=body(s,2,75);set(s,a,'AAAAAA');set(s,b,'AAAAAA');set(s,c,'AAAAAA');
 s.immunity.inherit(b,a.geneClone,a.expression);const original=s.immunity.clones.get(a.geneClone).antigenBranch,independent=s.immunity.clones.get(c.geneClone).antigenBranch;
 assert.notEqual(independent,original);s.immunity.alter(b,g=>g.traits.proliferation=2);assert.equal(s.immunity.clones.get(b.geneClone).antigenBranch,original);s.immunity.record();
 s.C.time=30;set(s,b,'AAAAAC');const variant=s.immunity.clones.get(b.geneClone).antigenBranch;assert.equal(s.immunity.branches.get(variant).parent,original);s.immunity.record();
 s.C.time=60;set(s,b,'AAAAAA');const reverted=s.immunity.clones.get(b.geneClone).antigenBranch;assert.notEqual(reverted,original);assert.equal(s.immunity.branches.get(reverted).parent,variant);s.beginDeath(a.id,'kill');s.immunity.record();
 const before=JSON.stringify([s.C.mt.mt,s.C.mt.mti,s.immunity.rng]),r=s.immunity.evolutionReport(),again=s.immunity.evolutionReport();assert.equal(r,again);assert.equal(JSON.stringify([s.C.mt.mt,s.C.mt.mti,s.immunity.rng]),before);
 assert.ok(r.branches.some(x=>x.id===original));assert.ok(r.branches.some(x=>x.id===variant));assert.equal(r.rows.at(-1).total,2);assert.equal(r.rows.at(-1).counts[original]||0,0);assert.equal(r.rows[1].counts[variant],1);
 const chart=CellLabLineage.layout(r);assert.ok(chart.links.some(l=>l.id===variant&&l.ancestor===original));assert.ok(chart.links.some(l=>l.id===reverted&&l.ancestor===variant));assert.ok(chart.order.includes(independent));
 for(const col of chart.nodes)assert.ok(Math.abs(col.reduce((n,x)=>n+x.share,0)-1)<1e-12);
});
test('top branch grouping preserves totals, full export retains every branch and sampled peaks',()=>{
 const s=make(),p=body(s,2,15),branches=[];
 for(let i=0;i<20;i++){const g=structuredClone(s.immunity.genes(p));g.peptides[0].sequence='AA'+i.toString(4).padStart(4,'0').replace(/[0-3]/g,c=>'ATCG'[+c]);const id=s.immunity.create(g);branches.push(id);}
 s.immunity.history=branches.map((id,i)=>({time:i*30,counts:{},states:{},tumors:{[id]:i+1,[branches[0]]:3}}));s.immunity.evolutionView=null;
 const small=s.immunity.evolutionReport(),full=s.immunity.evolutionReport(true);assert.equal(small.shown.length,12);assert.equal(small.omitted,8);assert.equal(full.shown.length,20);
 for(let i=0;i<small.rows.length;i++){assert.equal(Object.values(small.rows[i].counts).reduce((a,b)=>a+b,0),full.rows[i].total);assert.equal(small.rows[i].total,full.rows[i].total);}
 const shown=CellLabLineage.columns(small.rows,small.shown);for(const id of small.shown)assert.equal(Math.max(...shown.map(r=>r.counts[id]||0)),Math.max(...small.rows.map(r=>r.counts[id]||0)));
});
test('empty histories, complete extinction and same-time observations stay well defined',()=>{
 const s=make();s.immunity.record();assert.equal(CellLabLineage.layout(s.immunity.evolutionReport()).order.length,0);
 const a=body(s,2,15);set(s,a,'AAAAAA');s.immunity.record();s.immunity.record();assert.equal(s.immunity.history.length,1);s.C.time=30;s.beginDeath(a.id,'kill');s.immunity.record();
 const chart=CellLabLineage.layout(s.immunity.evolutionReport());assert.equal(chart.rows.at(-1).total,0);assert.ok(chart.links.some(l=>l.start.count===1&&l.end.count===0));assert.ok(chart.nodes.at(-1).every(n=>n.share===0));
});
const recipe=JSON.parse(await readFile('experiments/immune-genetics/03-heritable-escape.json','utf8'));
test('legacy four-slot recipes explicitly retain P1, keep expressions aligned and do not mutate input',()=>{
 const old=structuredClone(recipe);old.schemaVersion=2;old.modelRevision='2026-11-onset-calibration-antigen-visuals-2';for(const c of old.initialCells){const p=c.genes.peptides[0];c.genes.peptides=[p,...[1,2,3].map(()=>({...p,sequence:'TTTTTT'}))];c.expression={peptides:[.12,.3,.4,.5],presentation:[1,1],checkpoint:.1};}
 const before=JSON.stringify(old),parsed=CellLabExperiment.parse(old);assert.ok(parsed.migration);assert.ok(parsed.warnings.some(x=>x.includes('P1')&&x.includes('P2–P4')));assert.equal(JSON.stringify(old),before);
 for(const c of parsed.config.initialCells){assert.equal(c.genes.peptides.length,1);assert.deepEqual(c.expression.peptides,[.12]);}
 const sim=new CellLab.Simulation(parsed.config);assert.ok(sim.live().every(m=>sim.immunity.genes(m).peptides.length===1));
 old.schemaVersion=3;assert.throws(()=>CellLabExperiment.parse(old));
});
