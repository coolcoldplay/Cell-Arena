// The checked-in, unmodified sequential WASM kernel with resident arrays.
// No CPU/GPU transfer or biology in either resident microbenchmark.
export class ResidentReference {
  static async create(f,seed=17){
    const module=await WebAssembly.compile(await(await fetch('/build/cpm-kernel.wasm')).arrayBuffer());
    const instance=await WebAssembly.instantiate(module,{math:{exp:Math.exp,pow:Math.pow}});
    return new ResidentReference(f,seed,instance);
  }
  constructor(f,seed,instance){
    const {width:w,height:h,wrap}=f;const C=new CPM.CPM([w,h],{seed,torus:[wrap,wrap],T:12}),e=this.e=instance.exports,b=e.memory.buffer;
    const bits=this.bits=C.grid.Y_BITS,step=1<<bits,n=this.n=w*step;
    if(n>1048576)throw Error('Unmodified reference WASM capacity is 1,048,576 raw sites');
    this.width=w;this.height=h;this.fixture=f;const view=(T,k,len)=>new T(b,e.pointer(k),len);
    this.grid=view(Uint16Array,0,n);this.activity=view(Uint8Array,1,n);this.degree=view(Uint8Array,2,n);const nc=view(Uint8Array,3,n),neighbors=view(Int32Array,4,n*8),rings=view(Int32Array,5,n*8);
    this.pool=view(Int32Array,6,n);view(Uint32Array,7,625).set([...C.mt.mt,C.mt.mti]);this.cells=view(Float64Array,8,65536*32);this.cells.set(f.cells);for(let id=1;id<f.cellCapacity;id++){this.cells[id*32+3]=f.state[id*2];this.cells[id*32+4]=f.state[id*2+1];}view(Float64Array,9,64).set(f.data.subarray(0,64));view(Uint8Array,10,256).set(f.data.subarray(64,320));
    view(Uint32Array,14,131072).set(new Uint32Array(f.data.buffer,f.data.byteOffset+840*4,131072));view(Float64Array,15,131072).set(f.data.subarray(131912,262984));view(Float32Array,16,262144*6).set(f.data.subarray(262984));
    const region=new Uint16Array(b,e.vascular_region(),n);new Float64Array(b,e.vascular_geometry(),65*8).set(f.data.subarray(320,840));
    const offsets=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]],order=[0,7,6,1,5,2,3,4],at=(x,y)=>wrap?(((x+w)%w)<<bits)+(y+h)%h:(x<0||y<0||x>=w||y>=h?-1:(x<<bits)+y);
    nc.fill(8);this.count=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(x<<bits)+y,q=y*w+x;this.grid[i]=f.grid[q];this.activity[i]=f.activity[q];region[i]=f.grid[w*h+q];}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=(x<<bits)+y,ns=offsets.map(([dx,dy])=>at(x+dx,y+dy));let degree=0;for(const j of ns)if(j>=0&&this.grid[j]!==this.grid[i])degree++;this.degree[i]=degree;if(degree)this.pool[this.count++]=i;
      if(x===0||y===0||x===w-1||y===h-1){rings.set(ns,i*8);const all=order.map(k=>ns[k]).filter(j=>j>=0);nc[i]=all.length;neighbors.set(all,i*8);}
    }
    e.init(w,h,wrap?1:0,bits,n,f.section?1:0);
  }
  step(){
    const start=performance.now(),accepted=this.e.run(this.count),computed=performance.now();this.count=this.e.border_count();
    for(let x=0;x<this.width;x++){const base=x<<this.bits;for(let y=0;y<this.height;y++){const i=base+y;if(this.activity[i])this.activity[i]--;}}
    return {wallMs:performance.now()-start,kernelMs:computed-start,accepted};
  }
  snapshot(){
    const n=this.width*this.height,grid=new Uint32Array(n),activity=new Uint32Array(n),state=new Int32Array(this.fixture.cellCapacity*2);
    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){const i=(x<<this.bits)+y,q=y*this.width+x;grid[q]=this.grid[i];activity[q]=this.activity[i];}
    for(let id=1;id<this.fixture.cellCapacity;id++){state[id*2]=this.cells[id*32+3];state[id*2+1]=this.cells[id*32+4];}
    return {grid,activity,state};
  }
}
