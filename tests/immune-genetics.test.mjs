import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const make=(settings={},seed=17)=>new CellLab.Simulation({width:128,height:96,scene:'empty',seed,warmup:0,sectionModel:false,settings:{apoptosis:0,metabolism:0,growth:0,immuneGrowth:0,mutation:0,stressMutation:0,initialImmuneReady:100,checkpointStrength:0,damagePolarization:0,damageDeactivation:0,...settings}});
function body(s,kind,x,y,w=12,h=12){const id=s.C.makeNewCellID(kind);for(let a=x;a<x+w;a++)for(let b=y;b<y+h;b++)s.C.setpix([a,b],id);s.refreshPositions();s.scanContacts();return s.cells[id];}
function pair(s){const t=body(s,2,30,30),i=body(s,3,42,30);s.immunity.alter(t,g=>{g.peptides.forEach((p,n)=>{p.sequence='AAAAAA';p.present=n===0;p.base=1;p.channel=0;});g.presentation=[1,1];});t.expression.peptides=[1,0,0,0];t.expression.presentation=[1,1];s.immunity.alter(i,g=>{g.receptor={sequence:'AAAAAA',channel:0};});s.immunity.summarize(t);return {t,i};}
test('matching and mismatching immune clones discriminate a physically contacting target',()=>{const s=make(),{t,i}=pair(s);assert.ok(s.contacts.get(i.id).has(t.id));for(let n=0;n<40;n++)s.immuneInteractions(1);assert.ok(t.damage>0);const damage=t.damage;s.immunity.alter(i,g=>{g.receptor.sequence='TTTTTT';});for(let n=0;n<40;n++)s.immuneInteractions(1);assert.ok(t.damage<=damage);assert.ok(i.recognition.reasons.includes('mismatch'));assert.equal(i.targetID,0);});
test('chemotaxis and distant matching epitopes cannot deliver damage',()=>{const s=make(),{t,i}=pair(s);s.contacts.get(i.id).clear();s.fields.trail.values.fill(30);s.fields.danger.values.fill(30);for(let n=0;n<200;n++)s.immuneInteractions(1);assert.equal(t.damage,0);assert.ok(s.immunity.evaluate(i,t,false).reasons.includes('no-contact'));});
test('weighted cross-recognition tolerates some substitutions but loses others',()=>{const {affinity,threshold}=CellLabImmunity;assert.ok(affinity('AAAAAA','AAAAAC')>=threshold);assert.ok(affinity('AAAAAA','TAAAAA')<threshold);assert.ok(affinity('AAAAAA','AAAAAA')>affinity('AAAAAA','AAAAAC'));});
test('expression recovers without repairing a genetic deletion',()=>{const s=make(),{t}=pair(s);s.immunity.alter(t,g=>{g.peptides[0].stress=-2;});t.mutationPressure=1;for(let n=0;n<250;n++)s.immunity.express(t,4);assert.ok(t.expression.peptides[0]<.08);const gene=t.geneClone;t.mutationPressure=0;for(let n=0;n<250;n++)s.immunity.express(t,4);assert.equal(t.geneClone,gene);assert.ok(t.expression.peptides[0]>.8);s.immunity.alter(t,g=>{g.peptides[0].present=false;});for(let n=0;n<250;n++)s.immunity.express(t,4);assert.equal(t.expression.peptides[0],0);});
test('loss, failed presentation, absent repertoire and suppression have distinct diagnostics',()=>{for(const mode of ['loss','presentation','mismatch','suppression']){const s=make(),{t,i}=pair(s);if(mode==='loss')s.immunity.alter(t,g=>g.peptides.forEach(p=>p.present=false));if(mode==='presentation')t.expression.presentation=[0,0];if(mode==='mismatch')s.immunity.alter(i,g=>{g.receptor.sequence='TTTTTT';});if(mode==='suppression')i.immunePhenotype='suppressive';const r=s.immunity.evaluate(i,t,true);assert.equal(r.execution,0);assert.ok(r.reasons.includes(mode==='loss'?'antigen-loss':mode));}});
test('immune daughter retains receptor; genetic edits only affect one tumor branch',()=>{const s=make(),{t,i}=pair(s);const g=s.immunity.genes(i),parent=i.geneClone;const d=body(s,3,80,15);s.immunity.inherit(d,parent,i.expression);assert.equal(s.immunity.genes(d),g);const child=body(s,2,80,40);s.immunity.inherit(child,t.geneClone,t.expression);const common=s.immunity.genes(t);assert.equal(s.immunity.genes(child),common);s.immunity.alter(child,g=>{g.peptides[0].present=false;},'test loss');assert.equal(s.immunity.genes(t),common);assert.ok(common.peptides[0].present);assert.notEqual(child.geneClone,t.geneClone);assert.equal(s.immunity.clones.get(child.geneClone).parent,t.geneClone);assert.ok(Object.isFrozen(common.peptides[0]));});
test('immune pressure changes reversible expression, not the DNA or receptor',()=>{const s=make({contactEscape:5,signalEscape:5}),{t,i}=pair(s),g=s.immunity.genes(t),r=s.immunity.genes(i);t.immuneContactMemory=1;s.fields.trail.values.fill(30);for(let n=0;n<500;n++)s.evolutionStep(t,4);assert.equal(s.immunity.genes(t),g);assert.equal(s.immunity.genes(i),r);assert.ok(t.expression.presentation[0]<.7);});
test('cache eviction and snapshots do not change affinity, RNG, or decisions',()=>{const s=make(),{t,i}=pair(s),a=s.immunity.evaluate(i,t),state=s.C.mt.mti;s.immunity.cache.clear();s.snapshot();const b=s.immunity.evaluate(i,t);assert.deepEqual(a,b);assert.equal(s.C.mt.mti,state);});
test('background priming is delayed, finite and cannot retarget an existing clone',()=>{const s=make({primingRate:3}),{t,i}=pair(s),r=s.immunity.repertoire[0];s.immunity.alter(t,g=>{g.peptides[0].sequence=r.sequence;g.peptides[0].channel=r.channel;});const receptor=s.immunity.genes(i).receptor;i.primed=false;s.immunity.expose(t);s.immunity.tick(16);assert.equal(s.immunity.metrics.primed,0);for(let n=0;n<120;n++){s.C.time+=16;s.immunity.tick(16);}assert.ok(s.immunity.queue.length<=8);assert.deepEqual(s.immunity.genes(i).receptor,receptor);assert.equal(s.live().length,2,'no vessel means no magical new cell');});
test('identical genotypes from unrelated founders keep distinct genealogies',()=>{const s=make(),a=body(s,1,10,10),b=body(s,1,50,10);assert.notEqual(a.geneClone,b.geneClone);assert.equal(s.immunity.clones.get(a.geneClone).parent,0);assert.equal(s.immunity.clones.get(b.geneClone).parent,0);});
test('self reference is tolerant and precancer does not guarantee a new recognizable antigen',()=>{
 const s=make(),normals=[];for(let n=0;n<80;n++){const id=s.C.makeNewCellID(1),m=s.cells[id];s.beginAbnormal(id);normals.push(m);}
 assert.ok(normals.some(m=>!m.antigen)&&normals.some(m=>m.antigen));
 for(const r of s.immunity.repertoire)assert.ok(s.immunity.self.every(code=>CellLabImmunity.affinity(code,r.sequence)<CellLabImmunity.threshold));
});
test('heritable presentation loss stops a previously recognized synapse immediately',()=>{
 const s=make(),{t,i}=pair(s);for(let n=0;n<40;n++)s.immuneInteractions(1);assert.ok(t.damage>0);const damage=t.damage,peptides=s.immunity.genes(t).peptides.map(p=>p.sequence);
 s.immunity.alter(t,g=>{g.presentation=[0,0];});s.immuneInteractions(1);assert.equal(i.targetID,0);assert.equal(i.recruitment,0);assert.ok(t.damage<=damage);assert.deepEqual(s.immunity.genes(t).peptides.map(p=>p.sequence),peptides);assert.ok(i.recognition.reasons.includes('presentation'));
});
test('immune killing does not alter mutation sampling at identical division opportunities',()=>{
 const a=make({mutation:35,kill:0}),b=make({mutation:35,kill:2}),pa=body(a,2,20,20),pb=body(b,2,20,20),events=[];
 for(const [s,p]of [[a,pa],[b,pb]]){const genes=[];for(let n=0;n<200;n++){const c={...p,resources:{...p.resources}};s.immunity.inherit(c,p.geneClone,p.expression);genes.push(s.immunity.genes(c));}events.push(genes);}
 assert.deepEqual(events[0],events[1]);
});
test('background presentation can license a matching resting clone only after the delay',()=>{
 const s=make({primingRate:3}),t=body(s,2,30,30),i=body(s,3,70,30),r=s.immunity.repertoire[0];
 s.immunity.alter(t,g=>{g.peptides[0].sequence=r.sequence;g.peptides[0].channel=r.channel;g.peptides[0].base=1;});t.expression.peptides[0]=1;
 s.immunity.alter(i,g=>{g.receptor={sequence:r.sequence,channel:r.channel};g.candidate=r.id;});i.primed=false;s.fields.danger.values.fill(10);s.immunity.expose(t);
 for(let n=0;n<10;n++){s.C.time+=16;s.immunity.tick(16);}assert.equal(i.primed,false);
 for(let n=0;n<90;n++){s.C.time+=16;if(n%10===0)s.immunity.expose(t);s.immunity.tick(16);}
 assert.equal(i.primed,true);assert.ok(i.antigenMemory>0);assert.ok(s.immunity.metrics.primed>0);assert.equal(t.damage,0,'priming is not killing at a distance');
});
test('no-op edits do not create a genetic branch; a neutral sequence edit still does',()=>{
 const s=make(),{t}=pair(s),id=t.geneClone;s.immunity.alter(t,g=>{g.peptides[1].present=false;});assert.equal(t.geneClone,id);
 s.immunity.alter(t,g=>{g.peptides[1].sequence=s.immunity.substitute(g.peptides[1].sequence);});assert.notEqual(t.geneClone,id);assert.equal(t.antigen,true);
});
test('archived lineages remain exportable without scanning them for live clone snapshots',()=>{
 const s=make(),{t}=pair(s),ancestor=t.geneClone;s.immunity.alter(t,g=>{g.presentation[0]=.7;});s.immunity.record();assert.ok(!s.immunity.unarchived.has(ancestor));assert.equal(s.immunity.clones.get(ancestor).genes,null);assert.ok(s.immunity.report(true).lineage.find(c=>c.id===ancestor).genes);assert.ok(!s.immunity.report().clones.some(c=>c.id===ancestor));
});

test('selected contact reports use real edges without populating affinity caches or advancing either RNG',()=>{
 const s=make(),{t,i}=pair(s);s.observe(i.id,i.birth);s.immunity.cache.clear();
 const before=JSON.stringify([s.C.mt.mt,s.C.mt.mti,s.immunity.rng]);
 const report=s.immunity.report();assert.equal(report.contacts.length,1);assert.equal(report.contacts[0].target,t.id);assert.equal(report.contacts[0].score,1);assert.equal(s.immunity.cache.size,0);
 assert.equal(JSON.stringify([s.C.mt.mt,s.C.mt.mti,s.immunity.rng]),before);
 s.contacts.get(i.id).clear();assert.equal(s.immunity.report().contacts.length,0);
});
