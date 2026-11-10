/* Pointer timing only: no model time, physics, or random state is changed here. */
globalThis.CellLabSignalGesture=class {
  constructor({emit,now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),holdMs=400,doubleMs=320,repeatMs=120,slop=14}){
    Object.assign(this,{emit,now,setTimer,clearTimer,holdMs,doubleMs,repeatMs,slop});
    this.pressed=null;this.pending=null;this.holdTimer=null;this.repeatTimer=null;this.tapTimer=null;
  }
  clear(name){if(this[name]!==null)this.clearTimer(this[name]);this[name]=null;}
  down(payload){
    if(this.pressed)return;
    const prior=this.pending,second=prior&&this.now()-prior.time<=this.doubleMs&&prior.payload.type===payload.type&&prior.payload.radius===payload.radius&&Math.hypot(prior.payload.screen[0]-payload.screen[0],prior.payload.screen[1]-payload.screen[1])<=this.slop;
    this.clear('tapTimer');this.pending=null;
    if(prior&&!second)this.emit('pulse',prior.payload);
    this.pressed={payload,origin:payload.screen,firstTap:second?prior.payload:null,holding:false};
    this.holdTimer=this.setTimer(()=>this.hold(),this.holdMs);
  }
  move(point,screen){
    const p=this.pressed;if(!p)return;
    p.payload={...p.payload,point,screen};
    if(!p.holding&&Math.hypot(screen[0]-p.origin[0],screen[1]-p.origin[1])>this.slop)this.hold();
  }
  hold(){
    const p=this.pressed;if(!p||p.holding)return;
    this.clear('holdTimer');p.holding=true;
    if(p.firstTap){this.emit('pulse',p.firstTap);p.firstTap=null;}
    const repeat=()=>{if(this.pressed!==p)return;this.emit('repeat',p.payload);this.repeatTimer=this.setTimer(repeat,this.repeatMs);};
    repeat();
  }
  up(){
    const p=this.pressed;if(!p)return;
    this.clear('holdTimer');this.clear('repeatTimer');this.pressed=null;
    if(p.holding)return;
    if(p.firstTap){this.emit('source',p.payload);return;}
    this.pending={payload:p.payload,time:this.now()};
    this.tapTimer=this.setTimer(()=>{const tap=this.pending;this.pending=null;this.tapTimer=null;if(tap)this.emit('pulse',tap.payload);},this.doubleMs);
  }
  cancel(){for(const key of ['holdTimer','repeatTimer','tapTimer'])this.clear(key);this.pressed=null;this.pending=null;}
};
