import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const make=()=>new CellLab.Simulation({width:80,height:60,scene:'empty',warmup:0,seed:17,settings:{metabolism:0,growth:0,apoptosis:0,immuneGrowth:0,chemotaxis:0,repulsion:0,immuneSeparation:0}});
function fill(s,kind,x,y,w,h){const id=s.C.makeNewCellID(kind),points=[];for(let a=x;a<x+w;a++)for(let b=y;b<y+h;b++){s.C.setpix([a,b],id);points.push(s.C.grid.p2i([a,b]));}s.refreshPositions();assert.ok(s.section.initialize(s.cells[id],points));s.updateMechanics(s.cells[id]);return id;}

test('patrol statistics require sustained real membrane contact and deduplicate by cell birth identity',()=>{
 const s=make(),ctl=fill(s,3,20,20,8,8),normal=fill(s,1,28,20,8,8),far=fill(s,2,55,20,8,8);s.scanContacts();
 assert.equal(typeof s.patrolReport,'function','patrol statistics are exposed');
 s.immuneInteractions(0);assert.equal(s.patrolReport().checkedCells,0);
 s.immuneInteractions(5);assert.equal(s.patrolReport().checkedCells,0,'a brief touch is not a completed scan');
 s.immuneInteractions(1);assert.equal(s.patrolReport().checkedCells,1);assert.equal(s.patrolReport().currentChecked,1);assert.equal(s.patrolReport().currentTargets,2);
 for(let n=0;n<10;n++)s.immuneInteractions(10);assert.equal(s.patrolReport().checkedCells,1,'revisits do not inflate the count');assert.equal(s.counters.recognitions,0,'normal contact is not antigen recognition');assert.equal(s.cells[far].damage,0);
 s.eraseCell(normal);const next=fill(s,1,28,20,8,8);assert.notEqual(s.cells[next].birth,2);s.scanContacts();s.immuneInteractions(6);assert.equal(s.patrolReport().checkedCells,2,'new birth identities count independently of reused lattice IDs');
 assert.equal(s.patrolReport().currentChecked,1);assert.equal(s.snapshot().cells.find(c=>c.id===ctl).patrolChecked,2);
});
test('contact gaps break an unfinished scan; immune peers and walls are not inspected tissue cells',()=>{
 const s=make(),ctl=fill(s,3,20,20,8,8),normal=fill(s,1,28,20,8,8);fill(s,3,20,28,8,8);s.paint(19,24,0);s.scanContacts();
 assert.equal(typeof s.patrolReport,'function');s.immuneInteractions(3);s.contacts.get(ctl).delete(normal);s.immuneInteractions(1);s.scanContacts();s.immuneInteractions(3);assert.equal(s.patrolReport().checkedCells,0);
 s.immuneInteractions(3);assert.equal(s.patrolReport().checkedCells,1);assert.equal(s.counters.recognitions,0);
});
test('coverage observes physical body pixels, excludes walls, and never paints a dragged path or advances while paused',()=>{
 const s=make(),id=s.seed(3,20,20,4);s.paint(60,20,3);
 assert.equal(typeof s.patrolReport,'function');assert.equal(s.patrolReport().visitedPixels,0);
 s.advance(1);const before=s.patrolReport();assert.ok(before.visitedPixels>0);assert.equal(before.freePixels,s.positions.filter(i=>s.C.cellKind(s.C.pixti(i))!==4).length);assert.equal(before.coverage,before.visitedPixels/before.freePixels);
 s.moveCell(id,45,20);assert.equal(s.patrolReport().visitedPixels,before.visitedPixels);s.snapshot();s.updateLocal(0);assert.equal(s.patrolReport().visitedPixels,before.visitedPixels);
 s.advance(1);assert.ok(s.patrolReport().visitedPixels>before.visitedPixels);assert.equal(s.patrol.visited[s.C.grid.p2i([32,20])],0,'manual drag does not count its intervening route');
});
test('a stalled search repolarizes smoothly but preserves real antigen scan and zero-motility gates',()=>{
 const s=make(),id=s.seed(3,30,25,4),m=s.cells[id];m.px=1;m.py=0;s.updatePolarity(4);assert.ok(m.patrolMotion,'short-lived internal motion state');
 let previous=Math.atan2(m.py,m.px),maxTurn=0;
 for(let n=0;n<60;n++){s.updatePolarity(4);const angle=Math.atan2(m.py,m.px),d=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));maxTurn=Math.max(maxTurn,Math.abs(d));previous=angle;}
 assert.ok(m.patrolMotion.reorientations>0,'low-progress windows trigger a new local heading');assert.ok(maxTurn<.65,'turning is spread across updates');
 m.phase='scan';const turns=m.patrolMotion.reorientations;for(let n=0;n<50;n++)s.updatePolarity(4);assert.equal(m.patrolMotion.reorientations,turns,'do not interrupt antigen scanning');
 m.phase='search';s.settings.immuneMotility=0;for(let n=0;n<50;n++)s.updatePolarity(4);assert.equal(m.patrolMotion.reorientations,turns);s.updateMechanics(m);assert.equal(m.drive,0);
});
test('patrol observations cannot steer cells; JS and WASM retain matching physics and statistics',async()=>{
 const a=make(),b=make();for(const s of [a,b]){fill(s,3,20,20,8,8);fill(s,1,28,20,10,10);}await CellLabWasm.install(b,module);
 assert.equal(typeof a.patrolReport,'function');for(let n=0;n<80;n++){a.advance(1);b.advance(1);a.patrolReport();a.snapshot();}
 assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.snapshot().cells,b.snapshot().cells);assert.deepEqual(a.patrolReport(),b.patrolReport());
 a.patrol.visited.fill(1);a.patrol.checked.clear();for(let n=0;n<12;n++){a.advance(1);b.advance(1);}assert.deepEqual(a.C.grid._pixels,b.C.grid._pixels);assert.deepEqual(a.snapshot().cells.map(c=>[c.px,c.py]),b.snapshot().cells.map(c=>[c.px,c.py]));
});
test('division creates two new inspection identities and resets the daughter patrol records',()=>{
 const s=make(),target=fill(s,1,28,16,12,18);fill(s,3,20,20,8,8);s.scanContacts();s.immuneInteractions(8);assert.equal(s.patrolReport().checkedCells,1);
 const child=s.divide(target);assert.ok(child);assert.equal(s.patrolReport().currentChecked,0,'neither daughter inherits an inspection of its mother');
 s.immuneInteractions(8);assert.ok(s.patrolReport().checkedCells>=2);
});
test('dragging an unrelated cell does not reset ongoing inspections elsewhere',()=>{
 const s=make();fill(s,3,5,10,8,8);fill(s,1,13,10,8,8);const remote=fill(s,3,45,40,8,8);s.scanContacts();s.immuneInteractions(3);
 s.moveCell(remote,65,43);s.immuneInteractions(3);assert.equal(s.patrolReport().checkedCells,1);
});
test('the new statistics, definitions and patrol phases have English translations',async()=>{
 vm.runInThisContext(await readFile('src/i18n.js','utf8'));
 for(const text of ['巡逻覆盖率','累计检查的不同细胞','当前存活已检查 12 / 60','本细胞已检查 8 颗不同组织细胞','巡逻转向','巡逻接触扫描','持续巡逻'])assert.doesNotMatch(CellLabI18n.translate(text),/[\p{Script=Han}]/u);
});
