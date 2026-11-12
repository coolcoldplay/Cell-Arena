import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
for(const f of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js'])vm.runInThisContext(await readFile(f,'utf8'),{filename:f});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
function fixture(boundary='solid'){
 const s=new CellLab.Simulation({width:64,height:48,scene:'empty',warmup:0,boundary,seed:23,settings:{growth:0,apoptosis:0,metabolism:0,tumorMotility:0,noise:0}}),C=s.C,id=C.makeNewCellID(2),at=(x,y)=>C.grid.p2i([x,y]);
 for(let x=16;x<48;x++)for(let y=12;y<37;y++)C.setpix([x,y],id);
 const holes=[];for(let x=23;x<42;x++){const y=x%2?25:24;C.setpix([x,y],0);holes.push(at(x,y));}
 s.refreshPositions();const m=s.cells[id];m.target=m.base=C.getVolume(id);assert.ok(s.section.initialize(m,s.positions.filter(i=>C.pixti(i)===id)));s.updateMechanics(m);return {s,id,holes,at};
}
test('a staggered one-pixel extracellular zipper can close without creating a thin neck',()=>{
 const {s,id,holes,at}=fixture();for(const tgt of holes){const src=s.faces[tgt].find(i=>s.C.pixti(i)===id);assert.ok(s.section.allowed(src,tgt,id,0),'four-sided single-cell pore must be allowed to fill');}
 // Protected nuclear deletion and thin filament rules still apply.
 const m=s.cells[id];assert.equal(s.section.allowed(at(15,12),at(m.nucleusX,m.nucleusY),0,id),false);
 assert.equal(s.section.allowed(at(16,20),at(15,20),id,0),true);s.C.setpix([15,20],id);assert.equal(s.section.allowed(at(15,20),at(14,20),id,0),false);
});
for(const boundary of ['solid','wrap'])test('zipper repair remains stochastic, contiguous and exactly equal in JS/WASM: '+boundary,async()=>{
 const a=fixture(boundary),b=fixture(boundary);await CellLabWasm.install(b.s,module);let minimum=a.holes.length;
 for(let t=0;t<80;t++){a.s.advance(1);b.s.advance(1);assert.deepEqual(a.s.C.grid._pixels,b.s.C.grid._pixels);assert.deepEqual(Uint32Array.from(a.s.C.mt.mt),Uint32Array.from(b.s.C.mt.mt));minimum=Math.min(minimum,a.holes.filter(i=>a.s.C.pixti(i)===0).length);}
 assert.ok(minimum<a.holes.length/2,'formerly pinned pockets can relax');assert.equal(a.s.components(a.id).length,1);assert.ok(a.s.section.fits(a.s.cells[a.id],a.s.cells[a.id].nucleusX,a.s.cells[a.id].nucleusY));
});
