import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for(const file of ['vendor/artistoo.js','src/fast-cpm.js','src/section-mechanics.js','src/wasm-cpm.js','src/immune-genetics.js','src/model.js','src/presentation-frames.js'])
  vm.runInThisContext(await readFile(file,'utf8'),{filename:file});
const module=await CellLabWasm.load(await readFile('build/cpm-kernel.wasm'));
const frames=CellLabPresentation;
for(const kernel of ['reference','fast','wasm'])test('transferred play frames match every full readout across edits and division: '+kernel,async()=>{
  const sim=new CellLab.Simulation({width:92,height:69,scene:'empty',warmup:0,kernel,seed:17});
  if(kernel==='wasm')await CellLabWasm.install(sim,module);
  const parent=sim.seed(2,30,32,10);sim.seed(3,59,32,5);sim.observe(parent,sim.cells[parent].birth);
  let previous=null,frame=0,terrain=-1,fields=-1;
  function check(key=false){
    const expected=structuredClone(sim.snapshot()),baseFrame=key?0:frame;
    const data=sim.snapshot({terrain:!baseFrame||terrain!==sim.terrainRevision,includeFields:!baseFrame||fields!==sim.fieldRevision,packDetails:baseFrame?frames.packDetails:null});
    const sentTerrain=!!data.walls,sentFields=!!data.fields;
    const wire=structuredClone({baseFrame,frame:frame+1,data},{transfer:frames.transfers(data)});
    assert.equal(data.grid.byteLength,0);
    if(baseFrame)assert.equal(frames.receive(wire,previous,frame-1),null);
    const next=frames.receive(wire,previous,frame);
    if(!sentTerrain){assert.equal(next.walls,previous.walls);assert.equal(next.fieldMask,previous.fieldMask);}
    if(!sentFields)assert.equal(next.fields,previous.fields);
    assert.deepEqual(frames.complete(next),expected);
    const i=next.cells.findIndex(c=>c.id===next.observation?.cells[0]?.id);
    assert.deepEqual(frames.cellAt(next,i),expected.cells[i]);
    previous=next;frame++;terrain=sim.terrainRevision;fields=sim.fieldRevision;
    return {sentTerrain,sentFields};
  }
  check(true);
  sim.advance(1);assert.deepEqual(check(),{sentTerrain:false,sentFields:false});
  sim.advance(3);assert.deepEqual(check(),{sentTerrain:false,sentFields:true});
  sim.pulse(15,14,'danger');assert.equal(check().sentFields,true);
  sim.paint(72,52,3);assert.deepEqual(check(),{sentTerrain:true,sentFields:true});
  assert.ok(sim.divide(parent));check();
  assert.equal(previous.observation.cells.length,2);
  sim.addSource(12,12,'hostile');check();sim.clearWalls();check();
  const missed=previous;
  sim.advance(4);check();sim.advance(1);
  const packet={baseFrame:frame,frame:frame+1,data:sim.snapshot({terrain:false,includeFields:false})};
  assert.equal(frames.receive(packet,missed,frame-1),null);
  assert.equal(frames.receive(packet,{...previous,width:previous.width+1},frame),null);
  check(true);sim.advance(1);check();
});
test('column encoding preserves null, undefined, signed zero and individual cell values',()=>{
  const values=[null,undefined,-0,0,NaN,2.123456789012345];
  const cells=values.map((mixed,i)=>({mixed,number:i?i:-0,negative:-0,missing:undefined}));
  const cellDetails=frames.packDetails(cells,Object.keys(cells[0]));
  const data={walls:[],fieldMask:[],fields:{},cells:cells.map(()=>({})),cellDetails};
  const frame=frames.receive({baseFrame:0,data},null,0);
  assert.deepEqual(frames.complete(frame).cells,cells);assert.equal(frames.complete(frame),frames.complete(frame));
});
test('editing the public keyframe or play-frame fields cannot affect a later frame',()=>{
  const data={walls:Uint8Array.of(1),fieldMask:Uint8Array.of(1),fields:{oxygen:{values:Float32Array.of(.5)}},cells:[]};
  let s=frames.receive({baseFrame:0,data},null,0);
  for(let n=1;n<=2;n++){
    const api=frames.complete(s);api.walls[0]=0;api.fieldMask[0]=0;api.fields.oxygen.values[0]=1;
    assert.equal(s.walls[0],1);assert.equal(s.fieldMask[0],1);assert.equal(s.fields.oxygen.values[0],.5);
    s=frames.receive({baseFrame:n,data:{cells:[],cellDetails:frames.packDetails([],[])}},s,n);
  }
});
