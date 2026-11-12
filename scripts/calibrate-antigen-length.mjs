import vm from 'node:vm';import {readFile,writeFile,mkdir} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
await mkdir('reports/immune-genetics',{recursive:true});
const rows=[];
for(const length of [4,6,8]){
 const a={length,seeds:32,targets:0,covered:0,pairs:0,crossRecognized:0,substitutions:0,neutralRecognition:0,escape:0,regain:0,secondMutations:0,mutationOpportunities:0,mutatedDaughters:0,ms:0,bytes:0};
 const start=performance.now();
 for(let seed=1;seed<=32;seed++){
  const s=new CellLab.Simulation({width:32,height:24,scene:'empty',warmup:0,sectionModel:false,seed,settings:{antigenLength:length,antigen:100,mutation:10,checkpointStrength:0}}),im=s.immunity;
  for(let n=0;n<64;n++){const seq=im.sequence();a.targets++;const scores=im.repertoire.map(r=>r.channel===n%2?CellLabImmunity.affinity(r.sequence,seq):0);a.covered+=Number(scores.some(x=>x>=CellLabImmunity.threshold));a.pairs+=scores.length;a.crossRecognized+=scores.filter(x=>x>=CellLabImmunity.threshold).length;}
  for(const r of im.repertoire.slice(0,12))for(let n=0;n<length*3;n++){
   const next=im.substitute(r.sequence,Math.floor(n/3)),retained=CellLabImmunity.affinity(r.sequence,next)>=CellLabImmunity.threshold;a.substitutions++;a.neutralRecognition+=Number(retained);a.escape+=Number(!retained);
   if(!retained){for(let k=0;k<8;k++){a.secondMutations++;a.regain+=Number(CellLabImmunity.affinity(r.sequence,im.substitute(next))>=CellLabImmunity.threshold);}}
  }
  const id=s.C.makeNewCellID(2),parent=s.cells[id];
  for(let n=0;n<100;n++){const d={...parent,resources:{...parent.resources}};im.inherit(d,parent.geneClone,parent.expression);a.mutationOpportunities++;a.mutatedDaughters+=Number(d.geneClone!==parent.geneClone);}
  a.bytes+=JSON.stringify(im.genes(parent)).length;
 }
 a.ms=performance.now()-start;Object.assign(a,{initialRandomAntigenCoverage:a.covered/a.targets,pairCrossRecognition:a.crossRecognized/a.pairs,retainedRecognition:a.neutralRecognition/a.substitutions,escapeFraction:a.escape/a.substitutions,regainFraction:a.regain/Math.max(1,a.secondMutations),mutationFraction:a.mutatedDaughters/a.mutationOpportunities,meanGeneJSONBytes:a.bytes/a.seeds});rows.push(a);
}
await writeFile('reports/immune-genetics/length-calibration.json',JSON.stringify({protocol:'Random peptide/channel coverage of the finite pre-generated self-tolerant repertoire; one-position substitutions from exact matches; second mutations of escape variants. One shared 10% division opportunity, not per-base mutation. This is code-space calibration, not tissue simulation.',rows},null,2));console.log(JSON.stringify(rows,null,2));
