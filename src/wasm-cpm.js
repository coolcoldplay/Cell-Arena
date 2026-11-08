/* WASM executes the exact sequential proposal loop; Artistoo owns the state. */
(() => {
  'use strict';
  const stride=24,MAX_SITES=1048576;
  class WasmCPM {
    static async load(bytes){return WebAssembly.compile(bytes);}
    static async install(s,module){const instance=await WebAssembly.instantiate(module,{math:{exp:Math.exp,pow:Math.pow}});return new WasmCPM(s,instance);}
    constructor(s,instance){
      // Artistoo allocates an unused trailing padded row. At width 1024 that
      // row crosses the static WASM capacity although every real site fits.
      // Never construct views that alias the next C array; copy real storage
      // and harmless in-range padding only.
      if(s.C.grid.p2i([s.width-1,s.height-1])>=MAX_SITES)throw Error('Lattice exceeds WASM storage capacity');
      this.s=s;this.e=instance.exports;const e=this.e,buffer=e.memory.buffer,n=this.length=Math.min(s.C.grid._pixels.length,MAX_SITES);
      const view=(Type,key,length)=>new Type(buffer,e.pointer(key),length);
      this.grid=view(Uint16Array,0,n);this.activity=view(Uint8Array,1,n);this.degree=view(Uint8Array,2,n);this.nc=view(Uint8Array,3,n);this.neighbors=view(Int32Array,4,n*8);this.rings=view(Int32Array,5,n*8);this.pool=view(Int32Array,6,n);this.mt=view(Uint32Array,7,625);this.cells=view(Float64Array,8,65536*stride);this.params=view(Float64Array,9,64);this.connected=view(Uint8Array,10,256);this.log=view(Uint32Array,11,n*2+2);this.previous=[];
      if(!s.section)throw Error('The WASM kernel requires cross-section mechanics');
      this.connected.set(s.connected4);
      this.contactData=view(Int32Array,12,16384*5);this.contactPresent=view(Uint8Array,13,65536);
      for(const i of s.positions){this.nc[i]=s.neighbors[i].length;this.neighbors.set(s.neighbors[i],i*8);this.rings.set(s.rings[i],i*8);}
      e.init(s.width,s.height,s.wrap?1:0,s.C.grid.Y_BITS,n,1);
      this.original=s.C.timeStep.bind(s.C);s.C.timeStep=()=>this.step();s.kernel='wasm';s.wasm=this;
      this.originalContacts=s.scanContacts.bind(s);s.scanContacts=()=>this.contacts();
    }
    sync(){
      const s=this.s,C=s.C,p=C.getConstraint('PerimeterConstraint');
      this.grid.set(C.grid._pixels.subarray(0,this.length));this.activity.set(s.act.cellpixelsact.subarray(0,this.length));this.degree.set(C._neighbours.subarray(0,this.length));this.pool.set(C.borderpixels.elements);this.mt.set(C.mt.mt);this.mt[624]=C.mt.mti;
      for(const id of this.previous)this.cells.fill(0,id*stride,(id+1)*stride);this.previous=[];
      for(const [key,kind] of Object.entries(C.t2k)){const id=Number(key);if(!id)continue;this.previous.push(id);this.cells[id*stride+1]=kind;}
      for(const m of s.live()){
        const values=[1,m.kind,m.dying?1:0,C.getVolume(m.id)||0,p.cellperimeters[m.id]||0,m.planarTarget,m.lambdaV,m.perimeter,m.lambdaP,m.activity,m.drive,m.px,m.py,m.targetID,m.genome?.invasion||1,m.hasNucleus?1:0,m.nucleusX||0,m.nucleusY||0,m.nucleusRadius||0,m.maxReach,m.softReach,m.minVisibleArea];
        this.cells.set(values,m.id*stride);
      }
      this.params.set(C.conf.MAX_ACT);this.params.set(C.conf.J.flat(),5);this.params[30]=C.conf.T;
    }
    step(){
      const C=this.s.C;let n;try{this.sync();n=this.e.run(C.borderpixels.length);}catch(e){this.s.kernel='fast';this.s.kernelNote='WASM 回退：'+String(e);C.timeStep=this.original;this.s.scanContacts=this.originalContacts;this.original();return;}
      C.mt.mt.set?C.mt.mt.set(this.mt.subarray(0,624)):this.mt.subarray(0,624).forEach((v,i)=>C.mt.mt[i]=v);C.mt.mti=this.mt[624];
      for(let k=0;k<n;k++)C.setpixi(this.log[k*2],this.log[k*2+1]);
      C.time++;C.stat_values={};for(const listener of C.post_mcs_listeners)listener();
    }
    contacts(){
      const s=this.s,C=s.C,live=s.live();this.grid.set(C.grid._pixels.subarray(0,this.length));this.pool.set(C.borderpixels.elements);this.contactPresent.fill(0);for(const m of live)this.contactPresent[m.id]=1;
      const count=this.e.contacts(C.borderpixels.length);if(count<0)return this.originalContacts();
      for(const m of live){let map=s.contacts.get(m.id);if(!map){map=new Map();s.contacts.set(m.id,map);}map.clear();}
      for(let n=0;n<count;n++){const i=n*5,d=this.contactData;s.contacts.get(d[i]).set(d[i+1],{id:d[i+1],length:d[i+2],nx:d[i+3],ny:d[i+4]});}
      for(const m of live){let length=0;for(const e of s.contacts.get(m.id).values())length+=e.length;m.confinement=Math.max(0,Math.min(1,length/Math.max(1,4*Math.sqrt(C.getVolume(m.id)))));}
      return s.contacts;
    }
  }
  globalThis.CellLabWasm=WasmCPM;
})();
