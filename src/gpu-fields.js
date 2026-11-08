/* Optional WebGPU diffusion/reaction, with synchronous-in-model-time readback.
 * Automatic mode measures the complete transfer+compute+readback path. */
(() => {
  'use strict';
  const code=`
  struct Params {width:u32,height:u32,wrap:u32,pad:u32,supply:f32,metabolism:f32,pad2:f32,pad3:f32};
  @group(0) @binding(0) var<storage,read> input:array<vec4f>;
  @group(0) @binding(1) var<storage,read_write> output:array<vec4f>;
  @group(0) @binding(2) var<storage,read> density:array<vec4f>;
  @group(0) @binding(3) var<storage,read> blocked:array<u32>;
  @group(0) @binding(4) var<uniform> p:Params;
  fn sample(x0:i32,y0:i32,center:vec3f)->vec3f{
    var x=x0;var y=y0;
    if(p.wrap==1u){x=(x+i32(p.width))%i32(p.width);y=(y+i32(p.height))%i32(p.height);}
    if(x<0||y<0||x>=i32(p.width)||y>=i32(p.height)){return center;}
    let i=u32(y)*p.width+u32(x);if(blocked[i]>0u){return center;}return input[i].xyz;
  }
  @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) gid:vec3u){
    let i=gid.x;if(i>=p.width*p.height){return;}if(blocked[i]>0u){output[i]=vec4f(0.);return;}
    let x=i32(i%p.width);let y=i32(i/p.width);let c=input[i].xyz;
    let lap=sample(x-1,y,c)+sample(x+1,y,c)+sample(x,y-1,c)+sample(x,y+1,c)-4.*c;
    let d=max(vec3f(0.),c+vec3f(.10,.065,.045)*lap);let o=d.x;let g=d.y;let a=d.z;
    let r=density[i].xyz;let lo=.55*r.x+r.y+.7*r.z;let lg=.4*r.x+1.35*r.y+.8*r.z;
    let supply=p.supply*(.65+.35*density[i].w);let clearance=p.supply*density[i].w;
    let no=o+.012*supply*(1.-o)-.024*p.metabolism*lo*o/(.2+o);
    let ng=g+.010*supply*(1.-g)-.023*p.metabolism*lg*g/(.15+g);
    let na=a+.014*p.metabolism*(.3*r.x+1.2*r.y+.45*r.z)*g/(.15+g)*(1.+.8*(1.-o))-.009*clearance*a;
    output[i]=vec4f(clamp(vec3f(no,ng,na),vec3f(0.),vec3f(1.)),0.);
  }`;
  class GPUFields {
    static async create(s){
      if(!globalThis.navigator?.gpu)throw Error('浏览器没有开放 WebGPU');
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('没有可用的 WebGPU 适配器');
      const device=await adapter.requestDevice(),instance=new GPUFields(device,s);instance.adapter={vendor:adapter.info?.vendor||'',fallback:adapter.info?.isFallbackAdapter||false};
      const module=device.createShaderModule({code}),info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length){device.destroy();throw Error(errors.map(m=>m.message).join('; '));}
      instance.pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
      instance.groups=[0,1].map(k=>device.createBindGroup({layout:instance.pipeline.getBindGroupLayout(0),entries:[instance.buffers[k],instance.buffers[1-k],instance.loads,instance.blocked,instance.params].map((buffer,binding)=>({binding,resource:{buffer}}))}));return instance;
    }
    constructor(device,s){
      this.device=device;this.n=s.fields.oxygen.values.length;this.width=s.fields.oxygen.width;this.height=s.fields.oxygen.height;this.dead=false;
      device.lost.then(info=>{this.dead=true;this.loss=info.message;});device.addEventListener('uncapturederror',event=>{this.dead=true;this.loss=event.error.message;});
      const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC,buffer=(size,usage)=>device.createBuffer({size,usage});
      this.buffers=[buffer(this.n*16,storage),buffer(this.n*16,storage)];this.loads=buffer(this.n*16,storage);this.blocked=buffer(this.n*4,storage);this.params=buffer(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);this.readback=buffer(this.n*16,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
      this.state=new Float32Array(this.n*4);this.mass=new Float32Array(this.n*4);this.mask=new Uint32Array(this.n);this.uniform=new ArrayBuffer(32);
    }
    async step(s,dt){
      if(this.dead)throw Error(this.loss||'WebGPU device lost');
      if(!Number.isInteger(dt)||dt<1)throw Error('GPU field step requires positive integral MCS');
      const {oxygen,glucose,acid}=s.fields,n=this.n,d=this.device;
      for(let i=0;i<n;i++){this.state[i*4]=oxygen.values[i];this.state[i*4+1]=glucose.values[i];this.state[i*4+2]=acid.values[i];this.mass[i*4]=s.loads[1][i];this.mass[i*4+1]=s.loads[2][i];this.mass[i*4+2]=s.loads[3][i];this.mass[i*4+3]=s.supplyMap[i];this.mask[i]=oxygen.blocked[i];}
      const u=new Uint32Array(this.uniform),f=new Float32Array(this.uniform);u[0]=this.width;u[1]=this.height;u[2]=s.wrap?1:0;f[4]=s.settings.supply;f[5]=s.settings.metabolism;
      d.queue.writeBuffer(this.buffers[0],0,this.state);d.queue.writeBuffer(this.loads,0,this.mass);d.queue.writeBuffer(this.blocked,0,this.mask);d.queue.writeBuffer(this.params,0,this.uniform);
      const e=d.createCommandEncoder();for(let j=0;j<dt;j++){const pass=e.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.groups[j%2]);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();}
      e.copyBufferToBuffer(this.buffers[dt%2],0,this.readback,0,n*16);d.queue.submit([e.finish()]);
      await this.readback.mapAsync(GPUMapMode.READ);
      try{if(this.dead)throw Error(this.loss||'GPU error');const out=new Float32Array(this.readback.getMappedRange());
        // Validate the full result before committing any field. Failure leaves
        // the original CPU state intact for an exact CPU recomputation.
        for(let i=0;i<n;i++)for(let k=0;k<3;k++)if(!Number.isFinite(out[i*4+k]))throw Error('Invalid GPU field value');
        for(let i=0;i<n;i++){oxygen.values[i]=out[i*4];glucose.values[i]=out[i*4+1];acid.values[i]=out[i*4+2];}
      }finally{this.readback.unmap();}
    }
    destroy(){this.device.destroy();}
  }
  class ComputeBackend {
    constructor(){this.mode='auto';this.active='cpu';this.gpu=null;this.reason='CPU 微环境';this.cpuMs=null;this.gpuMs=null;}
    info(){return {mode:this.mode,active:this.active,reason:this.reason,cpuMs:this.cpuMs,gpuMs:this.gpuMs,adapter:this.gpu?.adapter};}
    async configure(s,mode='auto'){
      this.mode=mode;this.active='cpu';if(mode==='cpu'){this.reason='已选择 CPU 微环境；GPU 绘图独立运行。';return;}
      if(this.gpu&&(this.gpu.width!==s.fields.oxygen.width||this.gpu.height!==s.fields.oxygen.height||this.gpu.dead)){this.gpu.destroy();this.gpu=null;}
      try{
        this.gpu=this.gpu||await GPUFields.create(s);
        if(mode==='gpu'){this.active='gpu';this.reason='WebGPU 扩散与反应；每次读回完成后才推进接触和生物行为。';return;}
        s.prepareEnvironment();const names=['oxygen','glucose','acid'],saved=names.map(k=>s.fields[k].values.slice()),restore=()=>names.forEach((k,i)=>s.fields[k].values.set(saved[i]));
        let cpu=0,gpu=0,error=0;
        try{for(let j=0;j<6;j++){
          restore();let t=performance.now();s.integrateEnvironment(4);const ct=performance.now()-t;const expected=names.map(k=>s.fields[k].values.slice());restore();t=performance.now();await this.gpu.step(s,4);const gt=performance.now()-t;
          for(let k=0;k<3;k++)for(let i=0;i<saved[k].length;i++)error=Math.max(error,Math.abs(expected[k][i]-s.fields[names[k]].values[i]));
          if(j>1){cpu+=ct;gpu+=gt;}
        }}finally{restore();}
        if(error>2e-5)throw Error('CPU / GPU 数值校验未通过：'+error);
        this.cpuMs=cpu/4;this.gpuMs=gpu/4;this.active=gpu<cpu*.9?'gpu':'cpu';
        this.reason=`相同 4 MCS 微环境实测：CPU ${this.cpuMs.toFixed(2)} ms，GPU（含传输）${this.gpuMs.toFixed(2)} ms；自动选择 ${this.active==='gpu'?'WebGPU':'CPU'}。`;
      }catch(e){this.active='cpu';this.reason='WebGPU 不可用，已使用 CPU：'+String(e.message||e);if(this.gpu){this.gpu.destroy();this.gpu=null;}}
    }
    async step(s,dt){if(this.active==='gpu')try{await this.gpu.step(s,dt);return;}catch(e){this.active='cpu';this.reason='WebGPU 中断，当前步已改用 CPU 重算：'+String(e.message||e);}s.integrateEnvironment(dt);}
  }
  globalThis.CellLabGPU={GPUFields,ComputeBackend};
})();
