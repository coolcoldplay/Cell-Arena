import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/immune-genetics.js','src/model.js','src/experiment.js','src/round-history.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const fixture=JSON.parse(await readFile('experiments/immune-genetics/03-heritable-escape.json','utf8'));
test('new genotype recipes replay the same mechanics and both seeded random streams',()=>{
 const a=new CellLab.Simulation(CellLabExperiment.parse(fixture).config),b=new CellLab.Simulation(CellLabExperiment.parse(JSON.parse(JSON.stringify(fixture))).config);
 for(const s of [a,b])s.advance(64);
 assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.C.mt.mt,b.C.mt.mt);assert.equal(a.C.mt.mti,b.C.mt.mti);assert.deepEqual(a.immunity.rng.mt,b.immunity.rng.mt);assert.equal(a.immunity.rng.mti,b.immunity.rng.mti);assert.deepEqual(a.immunity.report(true),b.immunity.report(true));
 const tumors=a.live().filter(m=>m.kind===2);assert.equal(a.immunity.genes(tumors[0]),a.immunity.genes(tumors[1]));assert.notEqual(tumors[0].geneClone,tumors[3].geneClone);assert.equal(a.immunity.clones.get(tumors[3].geneClone).parent,tumors[0].geneClone);
});
test('malformed sequences, inconsistent named clones and invalid ancestry reject before import',()=>{
 for(const edit of [d=>d.initialCells[0].genes.peptides[0].sequence='ZZZZZZ',d=>d.initialCells[1].genes.peptides[0].base=.2,d=>d.initialCells[0].parentKey='missing',d=>d.initialCells[0].genes.presentation=[1],d=>d.initialCells[4].genes.receptor=null,d=>d.settings.antigenLength=5]){const d=structuredClone(fixture);edit(d);assert.throws(()=>CellLabExperiment.parse(d));}
});
test('history replay preserves initial genes and locks; old files explicitly migrate',()=>{
 const s=new CellLab.Simulation(CellLabExperiment.parse(fixture).config),snapshot=s.snapshot();Object.assign(snapshot,{revision:1,playing:false,speed:3});const j=new CellLabRounds.Journal();j.begin(snapshot,0,'2026-11-12T01:00:00.000Z',{primingRate:true},{parameterLocks:{primingRate:true}});j.observe(snapshot,1);const record=j.finish('manual-restart',2),replay=CellLabRounds.replayExperiment(record),parsed=CellLabExperiment.parse(replay);
 assert.equal(parsed.migration,false);assert.equal(parsed.config.seed,s.seedValue);assert.deepEqual(parsed.config.initialCells,s.initialCells);assert.ok(parsed.display.parameterLocks.primingRate);assert.ok(CellLabRounds.csv([record]).includes('immune_genetics'));
 const legacy=CellLabExperiment.parse({...fixture,schemaVersion:1,modelRevision:'2026-10-old'});assert.ok(legacy.migration&&legacy.warnings.length);assert.equal(legacy.config.seed,s.seedValue);assert.equal(legacy.config.settings.contactEscape,fixture.settings.contactEscape);assert.ok(CellLabExperiment.parse({...fixture,modelRevision:'older-v2'}).migration);
});
