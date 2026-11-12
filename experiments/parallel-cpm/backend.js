// Standalone WebGPU experiment. Production selects no code in this directory.
const STRIDE=32, BONDS=131072, SEGMENTS=262144*6;
export const OFFSETS={connected:64,vessels:320,bondKeys:840,bondStrength:131912,segments:262984};
export const stats=values=>{const a=[...values].sort((a,b)=>a-b),q=p=>a[Math.max(0,Math.ceil(a.length*p)-1)];return {n:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:a.at(-1)};};
export function exportSimulation(s,reuse){
  const w=s.wasm;w.sync();const n=s.width*s.height,cap=reuse?.cellCapacity||Math.min(65536,Math.max(1024,2**Math.ceil(Math.log2(s.C.last_cell_id+257))));
  if(s.C.last_cell_id>=cap)throw Error('Prototype cell parameter capacity exhausted; stop without dropping cells');
  let segments=4;for(const m of s.live())if(m.morphologyMode)segments=Math.max(segments,w.cells[m.id*32+25]+w.cells[m.id*32+26]*6);
  const grid=reuse?.grid||new Uint32Array(n*2),activity=reuse?.activity||new Uint32Array(n),cells=reuse?.cells||new Float32Array(cap*32),state=reuse?.state||new Int32Array(cap*2),data=reuse?.data||new Float32Array(OFFSETS.segments+Math.max(segments,65536));
  if(OFFSETS.segments+segments>data.length)throw Error('Prototype segment capacity exhausted; stop without simplifying morphology');
  cells.set(w.cells.subarray(0,cap*32));
  for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const p=y*s.width+x,i=(x<<s.C.grid.Y_BITS)+y;grid[p]=w.grid[i];grid[n+p]=w.vascularRegion?.[i]||0;activity[p]=w.activity[i];}
  const perimeters=s.C.getConstraint('PerimeterConstraint').cellperimeters;
  for(let id=0;id<cap;id++){state[id*2]=s.C.getVolume(id)||0;state[id*2+1]=perimeters[id]||0;}
  data.set(w.params);data.set(w.connected,OFFSETS.connected);data.set(w.vascularGeometry,OFFSETS.vessels);
  new Uint32Array(data.buffer).set(w.bondKeys,OFFSETS.bondKeys);data.set(w.bondStrength,OFFSETS.bondStrength);data.set(w.segments.subarray(0,segments),OFFSETS.segments);
  return {width:s.width,height:s.height,wrap:s.wrap,section:!!s.section,cellCapacity:cap,grid,activity,cells,state,data};
}
export class ParallelCPM {
  static async create(fixture,{tile=4,batch=4,seed=17,log=true,scheduler='dense'}={}){
    if(!navigator.gpu)throw Error('WebGPU unavailable');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No WebGPU adapter');
    const timestamp=adapter.features.has('timestamp-query');
    const device=await adapter.requestDevice({requiredFeatures:timestamp?['timestamp-query']:[],requiredLimits:{maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,512*1024*1024),maxBufferSize:Math.min(adapter.limits.maxBufferSize,512*1024*1024)}});
    const info=adapter.info;const backend=new ParallelCPM(device,fixture,{tile,batch,seed,log,timestamp,scheduler});
    backend.adapterInfo={vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description,isFallbackAdapter:info.isFallbackAdapter};
    device.addEventListener('uncapturederror',e=>backend.errors.push(e.error.message));device.lost.then(x=>{backend.lost=x;});
    await backend.init();return backend;
  }
  constructor(device,f,{tile,batch,seed,log,timestamp,scheduler}){
    if(![4,8].includes(tile)||f.width%(tile*2)||f.height%(tile*2))throw Error('Prototype requires tile 4 or 8 and dimensions divisible by 2 * tile; no padding or physics resizing is performed');
    if(!['dense','boundary'].includes(scheduler))throw Error('Unknown scheduler');
    if((tile*tile)%batch)throw Error('Batch must divide tile area');
    this.device=device;this.fixture=f;this.width=f.width;this.height=f.height;this.n=f.width*f.height;this.tile=tile;this.batch=batch;this.seed=seed;this.log=log;this.timestamp=timestamp;this.errors=[];this.stepNumber=0;this.scheduler=scheduler;
    this.tilesX=f.width/tile;this.tilesY=f.height/tile;this.phaseCount=4*tile*tile/batch;
    this.config=new Uint32Array([f.width,f.height,tile,batch,0,this.tilesX,this.tilesY,this.n,16,16+2*this.n,scheduler==='boundary'?1:0,f.cellCapacity,0,f.wrap?1:0,f.section?1:0,log?1:0]);
  }
  makeBuffer(label,size,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC){return this.device.createBuffer({label,size:Math.max(4,Math.ceil(size/4)*4),usage});}
  async init(){
    const d=this.device,f=this.fixture,n=this.n;
    this.buffers=[this.makeBuffer('lattice and vessel regions',n*8),this.makeBuffer('activity and boundary degree',n*(this.scheduler==='boundary'?8:4)),this.makeBuffer('cell parameters',f.cells.byteLength),this.makeBuffer('atomic volume and perimeter',f.state.byteLength),this.makeBuffer('constraint data',f.data.byteLength),this.makeBuffer('accepted and deferred copies',(16+3*n)*4),this.makeBuffer('global topology visited and BFS queue',n*8),this.makeBuffer('tile RNG, hazard clocks or probe inputs',Math.max(this.tilesX*this.tilesY*2,32768)*4)];
    this.uniform=this.makeBuffer('dispatch configs',Math.max(256,this.phaseCount*256),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
    this.allocatedBytes=this.buffers.reduce((n,b)=>n+b.size,0)+this.uniform.size;
    this.upload(f);this.resetRng();
    const source=await(await fetch('./kernel.wgsl')).text();const module=d.createShaderModule({label:'parallel CPM constraints',code:source});
    const compilation=await module.getCompilationInfo();const errors=compilation.messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    const entries=this.buffers.map((b,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:[2,4].includes(binding)?'read-only-storage':'storage'}}));entries.push({binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform',hasDynamicOffset:true,minBindingSize:64}});
    this.layout=d.createBindGroupLayout({entries});const pipelineLayout=d.createPipelineLayout({bindGroupLayouts:[this.layout]});
    this.pipelines={};for(const name of ['parallel','boundary','initBoundary','deferred','decay','probe'])this.pipelines[name]=await d.createComputePipelineAsync({label:name,layout:pipelineLayout,compute:{module,entryPoint:name}});
    this.bind=d.createBindGroup({layout:this.layout,entries:[...this.buffers.map((buffer,binding)=>({binding,resource:{buffer}})),{binding:8,resource:{buffer:this.uniform,offset:0,size:64}}]});
    if(this.timestamp){this.query=d.createQuerySet({type:'timestamp',count:2});this.queryResult=this.makeBuffer('timestamp resolve',256,GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC);this.queryRead=this.makeBuffer('timestamp read',16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);}
    this.headerRead=this.makeBuffer('copy counts',64,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
    await d.queue.onSubmittedWorkDone();this.check();
  }
  upload(f){for(const [i,a]of [[0,f.grid],[1,f.activity],[2,f.cells],[3,f.state],[4,f.data]])this.device.queue.writeBuffer(this.buffers[i],0,a);this.needsBoundaryInit=true;}
  resetRng(){let x=this.seed>>>0||1;const count=this.tilesX*this.tilesY,values=new Uint32Array(count*2),floats=new Float32Array(values.buffer);for(let i=0;i<count;i++){x^=x<<13;x^=x>>>17;x^=x<<5;values[i]=x>>>0||1;floats[count+i]=-Math.log(((x>>>0)+.5)/4294967296);}this.device.queue.writeBuffer(this.buffers[7],0,values);}
  check(){if(this.lost)throw Error('GPU device lost: '+JSON.stringify(this.lost));if(this.errors.length)throw Error(this.errors.join('\n'));}
  controls(probeCount=0){
    const bytes=new Uint32Array(this.phaseCount*64),permutations=[[0,1,2,3],[3,2,1,0],[1,3,0,2],[2,0,3,1],[0,2,1,3],[3,1,2,0],[1,0,3,2],[2,3,0,1]];
    for(let p=0;p<this.phaseCount;p++){const c=this.config.slice();c[4]=permutations[(this.seed+this.stepNumber+Math.floor(p/4))%permutations.length][p%4];c[12]=probeCount;bytes.set(c,p*64);}this.device.queue.writeBuffer(this.uniform,0,bytes);
  }
  async step({readLog=this.log}={}){
    const start=performance.now();this.controls();const d=this.device,e=d.createCommandEncoder();e.clearBuffer(this.buffers[5],0,32);e.clearBuffer(this.buffers[5],36,28);
    for(let phase=0;phase<this.phaseCount;phase++){
      const descriptor={};if(this.timestamp&&phase===0)descriptor.timestampWrites={querySet:this.query,beginningOfPassWriteIndex:0};
      const pass=e.beginComputePass(descriptor);pass.setBindGroup(0,this.bind,[phase*256]);
      if(phase===0&&this.scheduler==='boundary'&&this.needsBoundaryInit){pass.setPipeline(this.pipelines.initBoundary);pass.dispatchWorkgroups(Math.ceil(this.n/256));}
      pass.setPipeline(this.pipelines[this.scheduler==='boundary'?'boundary':'parallel']);pass.dispatchWorkgroups(Math.ceil((this.tilesX*this.tilesY/4)/64));pass.setPipeline(this.pipelines.deferred);pass.dispatchWorkgroups(1);pass.end();
    }
    const pass=e.beginComputePass(this.timestamp?{timestampWrites:{querySet:this.query,endOfPassWriteIndex:1}}:{});pass.setBindGroup(0,this.bind,[0]);pass.setPipeline(this.pipelines.decay);pass.dispatchWorkgroups(Math.ceil(this.n/256));pass.end();
    e.copyBufferToBuffer(this.buffers[5],0,this.headerRead,0,64);
    if(this.timestamp){e.resolveQuerySet(this.query,0,2,this.queryResult,0);e.copyBufferToBuffer(this.queryResult,0,this.queryRead,0,16);}
    d.queue.submit([e.finish()]);await Promise.all([this.headerRead.mapAsync(GPUMapMode.READ),...(this.timestamp?[this.queryRead.mapAsync(GPUMapMode.READ)]:[])]);
    const header=new Uint32Array(this.headerRead.getMappedRange()).slice();this.headerRead.unmap();let gpuMs=null;
    if(this.timestamp){const t=new BigUint64Array(this.queryRead.getMappedRange());gpuMs=Number(t[1]-t[0])/1e6;this.queryRead.unmap();}
    if(header[7])throw Error('Prototype event capacity or iteration limit exceeded; result must not be committed');let copies=null;if(readLog&&header[0])copies=new Uint32Array(await this.readBuffer(5,64,header[0]*8));
    this.needsBoundaryInit=false;this.stepNumber++;this.check();return {wallMs:performance.now()-start,gpuMs,accepted:header[0],deferred:header[2],bfs:header[3],topologyRejected:header[4],different:header[5],minimumAreaRaces:header[6],proposals:this.scheduler==='dense'?this.n:header[9],copies};
  }
  async readBuffer(i,offset=0,size=this.buffers[i].size){const d=this.device,b=this.makeBuffer('readback',size,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),e=d.createCommandEncoder();e.copyBufferToBuffer(this.buffers[i],offset,b,0,size);d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const result=b.getMappedRange().slice(0);b.unmap();b.destroy();return result;}
  async snapshot(){const [g,a,s]=await Promise.all([this.readBuffer(0,0,this.n*4),this.readBuffer(1,0,this.n*4),this.readBuffer(3)]);return {grid:new Uint32Array(g),activity:new Uint32Array(a),state:new Int32Array(s)};}
  async probe(pairs){
    if(pairs.length>32768)throw Error('Too many probe coordinates');this.controls(pairs.length/2);this.device.queue.writeBuffer(this.buffers[7],0,new Uint32Array(pairs));
    const e=this.device.createCommandEncoder(),p=e.beginComputePass();p.setBindGroup(0,this.bind,[0]);p.setPipeline(this.pipelines.probe);p.dispatchWorkgroups(1);p.end();this.device.queue.submit([e.finish()]);const result=await this.readBuffer(5,64,pairs.length/2*16);this.resetRng();this.check();return {u32:new Uint32Array(result),f32:new Float32Array(result)};
  }
  async profileStep(){
    if(!this.timestamp)throw Error('Timestamp queries unavailable');
    this.controls();const d=this.device,count=this.phaseCount*4+2,q=d.createQuerySet({type:'timestamp',count}),resolve=this.makeBuffer('stage profiling resolve',Math.ceil(count*8/256)*256,GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC),read=this.makeBuffer('stage profiling read',count*8,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST),e=d.createCommandEncoder();
    e.clearBuffer(this.buffers[5],0,32);e.clearBuffer(this.buffers[5],36,28);
    for(let phase=0;phase<this.phaseCount;phase++)for(let stage=0;stage<2;stage++){
      const at=phase*4+stage*2,p=e.beginComputePass({timestampWrites:{querySet:q,beginningOfPassWriteIndex:at,endOfPassWriteIndex:at+1}});p.setBindGroup(0,this.bind,[phase*256]);
      if(stage===0){if(phase===0&&this.scheduler==='boundary'&&this.needsBoundaryInit){p.setPipeline(this.pipelines.initBoundary);p.dispatchWorkgroups(Math.ceil(this.n/256));}p.setPipeline(this.pipelines[this.scheduler==='boundary'?'boundary':'parallel']);p.dispatchWorkgroups(Math.ceil((this.tilesX*this.tilesY/4)/64));}
      else{p.setPipeline(this.pipelines.deferred);p.dispatchWorkgroups(1);}p.end();
    }
    const p=e.beginComputePass({timestampWrites:{querySet:q,beginningOfPassWriteIndex:count-2,endOfPassWriteIndex:count-1}});p.setBindGroup(0,this.bind,[0]);p.setPipeline(this.pipelines.decay);p.dispatchWorkgroups(Math.ceil(this.n/256));p.end();e.resolveQuerySet(q,0,count,resolve,0);e.copyBufferToBuffer(resolve,0,read,0,count*8);d.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(read.getMappedRange()),ms=(i)=>Number(t[i+1]-t[i])/1e6;let parallelMs=0,deferredMs=0;for(let phase=0;phase<this.phaseCount;phase++){parallelMs+=ms(phase*4);deferredMs+=ms(phase*4+2);}const decayMs=ms(count-2);read.unmap();q.destroy();resolve.destroy();read.destroy();this.stepNumber++;this.needsBoundaryInit=false;this.check();return {parallelMs,deferredMs,decayMs,note:'Diagnostic only: additional pass boundaries and timestamp queries; not used as throughput benchmark'};
  }
  destroy(){this.device.destroy();}
}
