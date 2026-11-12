// Direct resident-grid drawing for inspecting the experiment. Drawing a frame
// is not evidence that a browser presented a new simulation frame at that rate.
export async function makeRenderer(gpu,canvas){
  const d=gpu.device,context=canvas.getContext('webgpu'),format=navigator.gpu.getPreferredCanvasFormat();context.configure({device:d,format,alphaMode:'opaque'});
  const source=`
    struct Size { width:u32,height:u32,outputWidth:u32,outputHeight:u32 }
    @group(0) @binding(0) var<storage,read> grid:array<u32>;
    @group(0) @binding(1) var<storage,read> cells:array<f32>;
    @group(0) @binding(2) var<uniform> size:Size;
    @vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{
      let points=array<vec2<f32>,3>(vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));return vec4(points[i],0.0,1.0);
    }
    @fragment fn fragment(@builtin(position) position:vec4<f32>)->@location(0) vec4<f32>{
      let p=min(vec2<u32>(position.xy*vec2<f32>(f32(size.width)/f32(size.outputWidth),f32(size.height)/f32(size.outputHeight))),vec2(size.width-1u,size.height-1u));
      let id=grid[p.y*size.width+p.x];if(id==0u){return vec4(.025,.04,.07,1.0);}let at=id*32u;
      let palette=array<vec3<f32>,5>(vec3(.02,.03,.05),vec3(.27,.57,.74),vec3(.87,.25,.39),vec3(.94,.81,.31),vec3(.4,.43,.5));
      var color=palette[u32(cells[at+1u])]*(.85+.15*f32((id*2654435761u)%255u)/255.0);
      let right=grid[p.y*size.width+(p.x+1u)%size.width];let down=grid[((p.y+1u)%size.height)*size.width+p.x];if(right!=id||down!=id){color*=.45;}
      var delta=vec2<f32>(p)-vec2(cells[at+16u],cells[at+17u]);let dimensions=vec2<f32>(f32(size.width),f32(size.height));delta=select(delta,delta-dimensions,delta>dimensions*.5);delta=select(delta,delta+dimensions,delta< -dimensions*.5);
      if(cells[at+15u]!=0.0&&dot(delta,delta)<cells[at+18u]*cells[at+18u]){color*=.55;}return vec4(color,1.0);
    }`;
  const module=d.createShaderModule({code:source}),pipeline=await d.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vertex'},fragment:{module,entryPoint:'fragment',targets:[{format}]},primitive:{topology:'triangle-list'}}),size=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  d.queue.writeBuffer(size,0,new Uint32Array([gpu.width,gpu.height,canvas.width,canvas.height]));
  const bind=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:gpu.buffers[0]}},{binding:1,resource:{buffer:gpu.buffers[2]}},{binding:2,resource:{buffer:size}}]});
  return ()=>{const e=d.createCommandEncoder(),p=e.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});p.setPipeline(pipeline);p.setBindGroup(0,bind);p.draw(3);p.end();d.queue.submit([e.finish()]);};
}
