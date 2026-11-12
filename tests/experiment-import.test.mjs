import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/experiment.js','utf8'));
const legacy=()=>({version:'4.0.0',scene:'hot',seed:73,boundary:'wrap',worldWidth:320,worldHeight:240,refinement:2,settings:{growth:1.7,kill:.8,inflammation:2.4},time:4321,cells:[{id:1,kind:2,x:30,y:30}],display:{cellColors:{tumor:{body:'#123456',nucleus:'#fedcba'},proliferationShading:false}}});
test('legacy exports restore settings, seed, geometry and colors as a new run, not a fabricated checkpoint',()=>{
 const data=legacy(),copy=JSON.stringify(data),p=CellLabExperiment.parse(data);assert.equal(p.config.scene,'hot');assert.equal(p.config.seed,73);assert.equal(p.config.boundary,'wrap');assert.equal(p.config.worldWidth,320);assert.equal(p.config.refinement,2);assert.equal(p.config.settings.growth,1.7);assert.equal(p.sourceTime,4321);assert.equal(p.display.cellColors.tumor.body,'#123456');assert.equal(p.mode,'parameters');assert.equal(p.config.time,undefined);assert.equal(p.config.cells,undefined);assert.equal(JSON.stringify(data),copy);
});
test('new exports round-trip all supported display choices and playback speed',()=>{
 const data={...legacy(),format:'cell-arena-experiment',schemaVersion:1,speed:3.5,display:{...legacy().display,fieldView:'glucose',signalLayers:['danger','trail'],opacity:{glucose:.75,trail:.6},flags:{nuclei:false,arrows:true},zoom:'150',fit:'contain',renderResolution:'1920'}};
 const p=CellLabExperiment.parse(JSON.parse(JSON.stringify(data)));assert.equal(p.speed,3.5);assert.deepEqual(p.display,data.display);assert.equal(p.config.worldHeight,240);
});
test('invalid files reject before state replacement; unsupported or unsafe values cannot reach the model',()=>{
 for(const data of [null,[],{}, {...legacy(),schemaVersion:99},{...legacy(),scene:'oops'},{...legacy(),seed:-1},{...legacy(),worldWidth:99999},{...legacy(),worldHeight:1200},{...legacy(),refinement:4},{...legacy(),settings:{kill:'2'}},{...legacy(),settings:{growth:Infinity}},{...legacy(),settings:{temperature:-1}},{...legacy(),display:{cellColors:{tumor:{body:'javascript:alert(1)'}}}},{...legacy(),display:{opacity:{trail:5}}}])assert.throws(()=>CellLabExperiment.parse(data));
 const p=CellLabExperiment.parse(JSON.parse(JSON.stringify({...legacy(),settings:{growth:1,capacity:240,unknown:99}})));assert.deepEqual(p.config.settings,{growth:1});assert.ok(p.ignored.includes('capacity'));assert.equal({}.polluted,undefined);
});
