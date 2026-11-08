/* Fixed MCS physics in a dedicated Worker. Playback changes wall-clock pacing,
 * never the biological time step or probabilistic hazard per model step. */
let sim=null,playing=true,visible=true,speed=1,clock=new CellLab.StepClock(30),pendingSteps=0;
let previous=performance.now(),lastSnapshot=0,lastMeasure=previous,measuredSteps=0,rate=0,limited=false,revision=0;
let dragSession=null;
const backend=new CellLabGPU.ComputeBackend(),commands=[];let busy=false,wasmModule=null,kernelNote='';
const turnQueue=new MessageChannel();turnQueue.port1.onmessage=()=>tick();
try{wasmModule=CellLabWasm.load(Uint8Array.from(atob(globalThis.CELL_LAB_WASM),c=>c.charCodeAt(0))).catch(e=>{kernelNote=String(e);return null;});}catch(e){kernelNote=String(e);}
function sendSnapshot(){
  if(!sim)return;
  const data=sim.snapshot();data.playing=playing;data.speed=speed;data.rate=rate;data.targetRate=30*speed;data.limited=limited;data.revision=revision;
  data.compute=backend.info();data.kernelNote=sim.kernelNote||kernelNote;
  const transfers=[data.grid.buffer,data.activity.buffer,data.walls.buffer,data.fieldMask.buffer,...Object.values(data.fields).map(f=>f.values.buffer)];
  postMessage({type:'snapshot',data},transfers);lastSnapshot=performance.now();
}
function resetClock(){clock.reset();pendingSteps=0;previous=performance.now();lastMeasure=previous;measuredSteps=0;rate=0;limited=false;}
function respond(id,value){if(id)postMessage({type:'response',id,value});}
async function handle(event){
  const {id,command,payload={}}=event.data;
  try{
    let value=true;
    if(command==='start'){
      if(dragSession){playing=dragSession.resume;dragSession=null;}
      sim=new CellLab.Simulation(payload);const module=await wasmModule;if(module&&payload.kernel!=='reference'&&payload.kernel!=='fast')try{await CellLabWasm.install(sim,module);}catch(e){kernelNote=String(e);}
      await backend.configure(sim,backend.mode);revision++;resetClock();
    }else if(!sim)throw Error('The model has not started');
    else if(command==='playing'){if(dragSession){dragSession.resume=!!payload.value;playing=false;}else playing=!!payload.value;resetClock();}
    else if(command==='beginDrag'){
      const m=sim.cells[payload.id];value=!!m&&!m.dying;
      if(value){dragSession={token:payload.token,id:m.id,resume:dragSession?.resume??playing,reference:new Map()};playing=false;resetClock();}
    }else if(command==='endDrag'){
      if(dragSession?.token===payload.token){playing=dragSession.resume;dragSession=null;resetClock();}
    }
    else if(command==='visible'){visible=!!payload.value;resetClock();}
    else if(command==='speed'){speed=Math.max(.25,Math.min(8,Number(payload.value)||1));clock.rate=30*speed;resetClock();}
    else if(command==='set')sim.set(payload.name,Number(payload.value));
    else if(command==='backend'){await backend.configure(sim,['auto','cpu','gpu'].includes(payload.mode)?payload.mode:'auto');resetClock();}
    else if(command==='advance'){if(dragSession)value=false;else{playing=false;resetClock();const steps=Math.min(10000,Math.max(1,payload.steps||1));if(backend.active==='gpu')await sim.advanceAsync(steps,backend);else sim.advance(steps);}}
    else if(command==='seed'){const radius=(payload.kind===3?3:4)*sim.scale;value=payload.manual&&payload.push?sim.insert(payload.kind,payload.x,payload.y,radius):sim.seed(payload.kind,payload.x,payload.y,radius);if(payload.manual)value={...sim.lastSeedResult};}
    else if(command==='sprinkle'){
      value=0;let reason='space';for(let i=0;i<600&&value<5;i++){const cell=sim.seed(payload.kind,sim.C.ran(5,sim.width-6),sim.C.ran(5,sim.height-6),(payload.kind===3?3:4)*sim.scale);if(cell)value++;else if(sim.lastSeedResult.reason==='invalid'){reason='invalid';break;}}
      if(payload.manual)value={added:value,requested:5,reason:value===5?'':reason,population:sim.live().length};
    }else if(command==='stroke'){
      value=0;for(const p of payload.points||[])value+=sim.paint(p[0],p[1],(payload.erase?5:2)*sim.scale,!!payload.erase,false);sim.rebuildMask();
    }else if(command==='eraseCells')value=sim.eraseCells(payload.points,(Number(payload.radius)||12)*sim.scale);
    else if(command==='move')value=payload.token&&dragSession?.token!==payload.token?{steps:0,blocked:true,stale:true}:sim.moveCell(payload.id,payload.x,payload.y,{elastic:!!payload.elastic,reference:dragSession?.reference});
    else if(command==='pulse')sim.pulse(payload.x,payload.y,payload.channel);
    else if(command==='clearWalls')sim.clearWalls();
    else if(command==='divide'){
      const target=payload.id||sim.live().filter(c=>!c.dying).sort((a,b)=>sim.C.getVolume(b.id)-sim.C.getVolume(a.id))[0]?.id;value=sim.divide(target);
    }else if(command==='export')value={version:'4.0.0',kernel:sim.kernel,compute:backend.info(),scene:sim.scene,scenario:sim.scenarioReport(),supplyMap:Array.from(sim.supplyMap),boundary:sim.boundary,seed:sim.seedValue,worldWidth:sim.worldWidth,worldHeight:sim.worldHeight,refinement:sim.scale,settings:sim.settings,time:sim.C.time,history:sim.populationHistory(),events:sim.events,counters:sim.counters,manualDeathRemovals:sim.manualDeathRemovals,deaths:sim.deathSummary(),deathHistory:sim.deathHistory,lineage:sim.lineage,cells:sim.snapshot().cells};
    else if(command==='snapshot')value={time:sim.C.time,cells:sim.live().length};
    else throw Error('Unknown command: '+command);
    if(['seed','sprinkle','divide'].includes(command))sim.record();
    sendSnapshot();respond(id,value);
  }catch(error){postMessage({type:'error',id,message:String(error),stack:error?.stack});}
}
async function drain(){if(busy)return;busy=true;try{while(commands.length)await handle(commands.shift());}finally{busy=false;}}
onmessage=event=>{commands.push(event);drain();};
async function tick(){
  if(busy){setTimeout(tick,4);return;}busy=true;
  try{
    const now=performance.now(),elapsed=Math.min(100,now-previous);previous=now;
    if(sim&&playing&&visible){
      pendingSteps+=clock.add(elapsed);
      const begin=performance.now();let performed=0;
      while(pendingSteps>0&&performance.now()-begin<18){if(backend.active==='gpu')await sim.advanceAsync(1,backend);else sim.advance(1);pendingSteps--;performed++;}
      measuredSteps+=performed;
      // Bound backlog instead of silently speeding up biology after a long stall.
      limited=pendingSteps>clock.rate*.4;
      pendingSteps=Math.min(pendingSteps,Math.ceil(clock.rate*2));
      const end=performance.now();
      if(end-lastMeasure>=700){rate=measuredSteps*1000/(end-lastMeasure);lastMeasure=end;measuredSteps=0;}
      if(end-lastSnapshot>=40)sendSnapshot();
    }
  }catch(error){playing=false;postMessage({type:'error',message:String(error),stack:error?.stack});}
  finally{busy=false;drain();}
  // A queued macrotask yields to commands without the nested setTimeout 4 ms
  // tax on every saturated chunk. Model time and attempt count are unchanged.
  if(sim&&playing&&visible&&pendingSteps>0&&!busy)turnQueue.port2.postMessage(0);
  else setTimeout(tick,playing&&visible?4:40);
}
tick();
