// Research backend; not used by the application. Energy/constraints ported
// from src/cpm-kernel.c (see its NOTICE). Checkerboard scheduling follows the
// idea, not the implementation, of Sultan et al., arXiv:2312.09317.
// Distant threads can read stale per-cell energies. Integer bookkeeping is
// atomic, but this is NOT trajectory-equivalent to sequential Artistoo.
struct Config {
  width:u32, height:u32, tile:u32, batch:u32,
  color:u32, tilesX:u32, tilesY:u32, sites:u32,
  logBase:u32, deferredBase:u32, schedule:u32, cellCapacity:u32,
  probeCount:u32, wrap:u32, section:u32, logEnabled:u32,
}
// Active tiles are separated by at least four sites; all concurrent local
// reads have radius <= 3. Lattice/activity accesses cannot overlap another
// thread's writes. Global BFS runs in the following serial dispatch. Only
// per-cell statistics and shared queues require atomics.
@group(0) @binding(0) var<storage,read_write> lattice:array<u32>;
@group(0) @binding(1) var<storage,read_write> acts:array<u32>;
@group(0) @binding(2) var<storage,read> cells:array<f32>;
@group(0) @binding(3) var<storage,read_write> state:array<atomic<i32>>;
@group(0) @binding(4) var<storage,read> data:array<f32>;
@group(0) @binding(5) var<storage,read_write> events:array<atomic<u32>>;
@group(0) @binding(6) var<storage,read_write> scratch:array<u32>;
@group(0) @binding(7) var<storage,read_write> rng:array<u32>;
@group(0) @binding(8) var<uniform> cfg:Config;
const RING_X=array<i32,8>(-1,0,1,1,1,0,-1,-1);
const RING_Y=array<i32,8>(-1,-1,-1,0,1,1,1,0);
const NEIGHBOR_RING=array<u32,8>(0,7,6,1,5,2,3,4);
const CONNECTED:u32=64u;
const VESSELS:u32=320u;
const BOND_KEYS:u32=840u;
const BOND_STRENGTH:u32=131912u;
const SEGMENTS:u32=262984u;
fn m(id:u32,k:u32)->f32 {return cells[id*32u+k];}
fn g(i:i32)->u32 {if(i<0){return 0u;}return lattice[u32(i)];}
fn ring(i:u32,k:u32)->i32 {
  var x=i32(i%cfg.width)+RING_X[k];var y=i32(i/cfg.width)+RING_Y[k];
  if(cfg.wrap!=0u){x=(x+i32(cfg.width))%i32(cfg.width);y=(y+i32(cfg.height))%i32(cfg.height);}
  else if(x<0||y<0||x>=i32(cfg.width)||y>=i32(cfg.height)){return -1;}
  return y*i32(cfg.width)+x;
}
fn connected(mask:u32)->bool {return data[CONNECTED+mask]!=0.0;}
fn delta(i:u32,x:f32,y:f32)->vec2<f32> {
  var d=vec2<f32>(f32(i%cfg.width)-x,f32(i/cfg.width)-y);
  if(cfg.wrap!=0u){let size=vec2<f32>(f32(cfg.width),f32(cfg.height));d=select(d,d-size,d>size*.5);d=select(d,d+size,d< -size*.5);}
  return d;
}
fn distance2(i:u32,id:u32)->f32 {let d=delta(i,m(id,16u),m(id,17u));return dot(d,d);}
fn own(j:i32,id:u32,tgt:u32,a:u32)->bool {if(j<0){return false;}return select(g(j),a,u32(j)==tgt)==id;}
fn thick(j:u32,id:u32,tgt:u32,a:u32)->bool {
  for(var k=0u;k<8u;k+=2u){if(own(ring(j,k),id,tgt,a)&&own(ring(j,(k+1u)%8u),id,tgt,a)&&own(ring(j,(k+7u)%8u),id,tgt,a)){return true;}}
  return false;
}
fn localBody(j:u32,tgt:u32,a:u32,b:u32)->bool {
  let id=select(g(i32(j)),a,j==tgt);if(m(id,0u)==0.0||m(id,2u)!=0.0||(id!=a&&id!=b)){return true;}
  var mask=0u;var faces=0u;
  for(var k=0u;k<8u;k++){if(own(ring(j,k),id,tgt,a)){mask|=1u<<k;if((k&1u)!=0u){faces++;}}}
  if(faces<2u||connected(mask)){return true;}
  for(var k=1u;k<8u;k+=2u){if((mask&(1u<<k))!=0u){let at=ring(j,k);var degree=0u;for(var f=1u;f<8u;f+=2u){if(own(ring(u32(at),f),id,tgt,a)){degree++;}}if(degree==1u){mask&=~(1u<<k);}}}
  return mask==0u||connected(mask);
}
fn sectionAllowed(tgt:u32,a:u32,b:u32)->bool {
  if(cfg.section==0u){return true;}
  if(m(b,0u)!=0.0&&m(b,2u)==0.0){
    if(f32(atomicLoad(&state[b*2u]))<=m(b,21u)){return false;}
    if(m(b,15u)!=0.0&&distance2(tgt,b)<=m(b,18u)*m(b,18u)){return false;}
  }
  if(m(a,0u)!=0.0&&m(a,2u)==0.0){
    if(m(a,15u)!=0.0&&distance2(tgt,a)>m(a,19u)*m(a,19u)){return false;}
    var anchored=false;
    for(var k=1u;k<8u;k+=2u){let j=ring(tgt,k);if(j>=0&&g(j)==a&&thick(u32(j),a,tgt,a)){anchored=true;break;}}
    if(!anchored){return false;}
  }
  if(m(a,0u)!=0.0&&b==0u){var enclosed=true;for(var k=1u;k<8u;k+=2u){let j=ring(tgt,k);if(j<0||g(j)!=a){enclosed=false;break;}}if(enclosed){return true;}}
  if(m(a,0u)!=0.0&&m(a,2u)==0.0&&!localBody(tgt,tgt,a,b)){return false;}
  for(var k=1u;k<8u;k+=2u){let j=ring(tgt,k);if(j>=0&&!localBody(u32(j),tgt,a,b)){return false;}}
  return true;
}
// 1: proven safe locally, 0: cannot remove last pixel, 2: needs exact BFS.
fn topologyLocal(tgt:u32,b:u32)->u32 {
  if(b==0u||m(b,0u)==0.0||m(b,2u)!=0.0){return 1u;}
  var mask=0u;for(var k=0u;k<8u;k++){let j=ring(tgt,k);if(j>=0&&g(j)==b){mask|=1u<<k;}}
  if(connected(mask)){return 1u;}return select(2u,0u,mask==0u);
}
// Only called by the one-thread deferred/probe dispatch. No fixed small-cell
// queue limit: scratch has a visited stamp and queue for EVERY lattice site.
fn topologyFull(tgt:u32,b:u32)->bool {
  let local=topologyLocal(tgt,b);if(local<2u){return local==1u;}
  atomicAdd(&events[3],1u);
  var stamp=atomicAdd(&events[8],1u)+1u;
  if(stamp==0xffffffffu){for(var i=0u;i<cfg.sites;i++){scratch[i]=0u;}stamp=1u;atomicStore(&events[8],1u);}
  var goals:array<u32,8>;var needed=0u;
  for(var k=0u;k<8u;k++){let j=ring(tgt,k);if(j>=0&&g(j)==b){goals[needed]=u32(j);needed++;}}
  let seed=goals[0];scratch[cfg.sites]=seed;scratch[seed]=stamp;var head=0u;var tail=1u;
  let goalCount=needed;
  loop {
    if(head>=tail){break;}let i=scratch[cfg.sites+head];head++;
    for(var k=0u;k<goalCount;k++){if(i==goals[k]){needed--;}}
    if(needed==0u){return true;}
    for(var k=0u;k<8u;k++){
      if(cfg.section!=0u&&(k&1u)==0u){continue;}
      let j=ring(i,k);if(j>=0&&u32(j)!=tgt&&g(j)==b&&scratch[u32(j)]!=stamp){scratch[u32(j)]=stamp;scratch[cfg.sites+tail]=u32(j);tail++;}
    }
  }
  return false;
}
fn vessel(id:u32)->u32 {if(id>0u&&id<=64u&&data[VESSELS+id*8u]!=0.0){return VESSELS+id*8u;}return 0u;}
fn vesselDistance(i:u32,v:u32)->f32 {return length(delta(i,data[v+1u],data[v+2u]));}
fn vascularAllowed(tgt:u32,a:u32)->bool {
  if(data[33]==0.0||m(a,0u)==0.0||m(a,2u)!=0.0||m(a,31u)<0.0){return true;}
  var v=vessel(u32(m(a,29u)));if(v!=0u){let d=vesselDistance(tgt,v);return d>=max(0.0,data[v+3u]-data[v+5u])&&d<=data[v+3u]+data[v+4u]+2.0*data[v+5u];}
  if(m(a,31u)==1.0){v=vessel(u32(m(a,30u)));if(v!=0u){return vesselDistance(tgt,v)<data[v+3u];}}
  let id=lattice[cfg.sites+tgt];v=vessel(id);if(v==0u){return true;}
  return vesselDistance(tgt,v)>=data[v+3u]+select(0.0,data[v+4u]-2.0*data[v+5u],m(a,1u)==2.0)||(u32(m(a,30u))==id&&m(a,31u)>=2.0);
}
fn vascularEnergy(tgt:u32,id:u32)->f32 {
  if(data[33]==0.0||m(id,2u)!=0.0){return 0.0;}let v=vessel(u32(m(id,29u)));if(v==0u){return 0.0;}
  let q=(vesselDistance(tgt,v)-data[v+3u]-data[v+4u]*.5)/data[v+5u];return .65*q*q;
}
fn adhesion(a:u32,b:u32)->f32 {
  if(a!=0u&&b!=0u&&(u32(m(a,13u))==b||u32(m(b,13u))==a)){return 2.0;}
  let ka=u32(m(a,1u));let kb=u32(m(b,1u));
  if(m(a,0u)!=0.0&&m(b,0u)!=0.0&&ka!=kb){if(ka==3u||kb==3u){return 9.0;}if(ka==2u||kb==2u){return max(9.0,19.0-3.0*m(select(b,a,ka==2u),14u));}}
  var j=data[5u+ka*5u+kb];if(data[32]!=0.0&&ka==2u&&kb==2u){j=max(j,30.0);}
  if(data[31]!=0.0&&ka==2u&&kb==2u){let key=(min(a,b)<<16u)|max(a,b);var slot=(key*2654435761u)&131071u;
    loop {let stored=bitcast<u32>(data[BOND_KEYS+slot]);if(stored==0u){break;}if(stored==key){return j-data[BOND_STRENGTH+slot];}slot=(slot+1u)&131071u;}
  }
  return j;
}
fn activityAt(i:u32)->f32 {
  let id=g(i32(i));var product=f32(acts[i]);if(id==0u||product==0.0){return 0.0;}var n=1.0;
  for(var k=0u;k<8u;k++){let j=ring(i,NEIGHBOR_RING[k]);if(j>=0&&g(j)==id){let value=acts[u32(j)];if(value==0u){return 0.0;}product*=f32(value);n+=1.0;}}
  return pow(product,1.0/n);
}
fn shapeEnergy(tgt:u32,id:u32)->f32 {
  if(m(id,15u)==0.0||m(id,2u)!=0.0){return 0.0;}
  if(m(id,22u)!=0.0){
    let d=delta(tgt,m(id,16u),m(id,17u));let distance=length(d);var outside=max(0.0,distance-m(id,23u));var processGap=1e30;
    let begin=u32(m(id,25u));let end=begin+u32(m(id,26u))*6u;
    for(var k=begin;k<end;k+=6u){let at=SEGMENTS+k;let origin=vec2<f32>(data[at],data[at+1u]);let direction=vec2<f32>(data[at+2u],data[at+3u])-origin;let p=d-origin;let length2=dot(direction,direction);var t=0.0;if(length2>0.0){t=clamp(dot(p,direction)/length2,0.0,1.0);}let radius=mix(data[at+4u],data[at+5u],t);let gap=max(0.0,length(p-t*direction)-radius);outside=min(outside,gap);processGap=min(processGap,gap);}
    let forward=clamp((distance-m(id,23u))/(5.0*m(id,28u)),0.0,1.0);let weight=clamp(processGap/(1.5*m(id,28u)),0.0,1.0);
    return m(id,24u)*outside*outside-m(id,27u)*forward*(1.0-weight);
  }
  let d=max(0.0,sqrt(distance2(tgt,id))/m(id,20u)-1.0);return select(select(18.0,10.0,m(id,1u)==2.0),5.0,m(id,1u)==1.0)*d*d;
}
fn perimeterDelta(tgt:u32,a:u32,b:u32)->vec2<i32> {
  var d=vec2<i32>(0);for(var k=0u;k<8u;k++){let j=ring(tgt,NEIGHBOR_RING[k]);if(j<0){continue;}let n=g(j);d.x+=select(1,-1,n==a);d.y+=select(-1,1,n==b);}return d;
}
fn energy(src:u32,tgt:u32,a:u32,b:u32)->f32 {
  var hs=0.0;var ht=0.0;
  for(var k=0u;k<8u;k++){let j=ring(tgt,NEIGHBOR_RING[k]);if(j<0){continue;}let n=g(j);if(n!=a){hs+=adhesion(n,a);}if(n!=b){ht+=adhesion(n,b);}}
  var h=hs-ht;let d=perimeterDelta(tgt,a,b);
  if(m(a,8u)!=0.0){let old=f32(atomicLoad(&state[a*2u+1u]))-m(a,7u);let next=old+f32(d.x);h+=m(a,8u)*(next*next-old*old);}
  if(m(b,8u)!=0.0){let old=f32(atomicLoad(&state[b*2u+1u]))-m(b,7u);let next=old+f32(d.y);h+=m(b,8u)*(next*next-old*old);}
  let id=select(b,a,a!=0u);if(m(id,9u)!=0.0){h+=m(id,9u)*(activityAt(tgt)-activityAt(src))/data[u32(m(id,1u))];}
  if(cfg.section!=0u){h+=shapeEnergy(tgt,a)-shapeEnergy(tgt,b);}
  if(m(a,0u)!=0.0){h+=m(a,6u)*(2.0*(f32(atomicLoad(&state[a*2u]))-m(a,5u))+1.0);}
  if(m(b,0u)!=0.0){h+=m(b,6u)*(-2.0*(f32(atomicLoad(&state[b*2u]))-m(b,5u))+1.0);}
  let step=delta(tgt,f32(src%cfg.width),f32(src/cfg.width));
  if(m(a,0u)!=0.0&&m(a,2u)==0.0){h-=m(a,10u)*dot(step,vec2<f32>(m(a,11u),m(a,12u)));}
  if(m(b,1u)==3.0&&m(b,2u)==0.0){h-=m(b,10u)*dot(step,vec2<f32>(m(b,11u),m(b,12u)));}
  return h+vascularEnergy(tgt,a)-vascularEnergy(tgt,b);
}
fn setPixel(tgt:u32,a:u32,b:u32)->bool {
  // A simultaneous pair of losses must not cross the original minimum area.
  if(b!=0u){
    if(cfg.section!=0u&&m(b,0u)!=0.0&&m(b,2u)==0.0){
      loop {let v=atomicLoad(&state[b*2u]);if(f32(v)<=m(b,21u)){atomicAdd(&events[6],1u);return false;}
        let result=atomicCompareExchangeWeak(&state[b*2u],v,v-1);if(result.exchanged){break;}}
    }else{atomicSub(&state[b*2u],1);}
  }
  let d=perimeterDelta(tgt,a,b);
  if(a!=0u){atomicAdd(&state[a*2u],1);atomicAdd(&state[a*2u+1u],d.x);}
  if(b!=0u){atomicAdd(&state[b*2u+1u],d.y);}
  lattice[tgt]=a;acts[tgt]=u32(data[u32(m(a,1u))]);
  if(cfg.schedule==1u){
    var degree=0u;for(var k=0u;k<8u;k++){let j=ring(tgt,k);if(j<0){continue;}let nt=g(j);if(nt!=a){degree++;}if(nt==b){acts[cfg.sites+u32(j)]++;}if(nt==a){acts[cfg.sites+u32(j)]--;}}
    acts[cfg.sites+tgt]=degree;
  }
  let at=atomicAdd(&events[0],1u);if(cfg.logEnabled!=0u){
    if(at>=cfg.sites){atomicStore(&events[7],1u);}else{atomicStore(&events[cfg.logBase+at*2u],tgt);atomicStore(&events[cfg.logBase+at*2u+1u],a);}
  }
  return true;
}
fn attempt(src:u32,tgt:u32,random:f32,defer:bool) {
  let a=g(i32(src));let b=g(i32(tgt));if(a==b||m(a,1u)==4.0||m(b,1u)==4.0){return;}
  atomicAdd(&events[5],1u);
  if(!sectionAllowed(tgt,a,b)){return;}
  let topo=topologyLocal(tgt,b);if(topo==0u){atomicAdd(&events[4],1u);return;}
  if(topo==2u){
    if(defer){let at=atomicAdd(&events[1],1u);atomicAdd(&events[2],1u);if(at>=cfg.sites/4u){atomicStore(&events[7],1u);return;}let p=cfg.deferredBase+at*4u;atomicStore(&events[p],src);atomicStore(&events[p+1u],tgt);atomicStore(&events[p+2u],bitcast<u32>(random));return;}
    if(!topologyFull(tgt,b)){atomicAdd(&events[4],1u);return;}
  }
  if(!vascularAllowed(tgt,a)){return;}
  let h=energy(src,tgt,a,b);if(h<0.0||random<exp(-h/data[30])){setPixel(tgt,a,b);}
}
fn nextRandom(s:ptr<function,u32>)->u32 {var x=*s;x^=x<<13u;x^=x>>17u;x^=x<<5u;*s=x;return x;}
fn sampleNeighbor(tgt:u32,random:u32)->i32 {
  if(cfg.wrap!=0u){return ring(tgt,NEIGHBOR_RING[random%8u]);}
  var list:array<i32,8>;var count=0u;for(var k=0u;k<8u;k++){let j=ring(tgt,NEIGHBOR_RING[k]);if(j>=0){list[count]=j;count++;}}
  return list[random%count];
}
@compute @workgroup_size(64)
fn parallel(@builtin(global_invocation_id) gid:vec3<u32>) {
  let halfX=cfg.tilesX/2u;let count=halfX*(cfg.tilesY/2u);let q=gid.x;if(q>=count){return;}
  let tx=(q%halfX)*2u+(cfg.color&1u);let ty=(q/halfX)*2u+(cfg.color>>1u);let tileID=ty*cfg.tilesX+tx;var random=rng[tileID];
  for(var n=0u;n<cfg.batch;n++){
    let site=nextRandom(&random)%(cfg.tile*cfg.tile);let tgt=(ty*cfg.tile+site/cfg.tile)*cfg.width+tx*cfg.tile+site%cfg.tile;
    let src=sampleNeighbor(tgt,nextRandom(&random));let u=f32(nextRandom(&random)>>8u)*(1.0/16777216.0);
    if(src>=0){attempt(u32(src),tgt,u,true);}
  }
  rng[tileID]=random;
}
@compute @workgroup_size(256)
fn initBoundary(@builtin(global_invocation_id) gid:vec3<u32>){
  let i=gid.x;if(i>=cfg.sites){return;}let id=lattice[i];var degree=0u;for(var k=0u;k<8u;k++){let j=ring(i,k);if(j>=0&&g(j)!=id){degree++;}}acts[cfg.sites+i]=degree;
}
// Independent exponential hazard clocks retain unit proposal rate per current
// border site. Unspent hazard is carried across phases. A fixed minimum of one
// attempt per tile would oversample small boundaries and is deliberately avoided.
// This is still a parallel approximate schedule, not the sequential trajectory.
@compute @workgroup_size(64)
fn boundary(@builtin(global_invocation_id) gid:vec3<u32>){
  let halfX=cfg.tilesX/2u;let count=halfX*(cfg.tilesY/2u);let q=gid.x;if(q>=count){return;}
  let tx=(q%halfX)*2u+(cfg.color&1u);let ty=(q/halfX)*2u+(cfg.color>>1u);let tileID=ty*cfg.tilesX+tx;let clocks=cfg.tilesX*cfg.tilesY;
  var random=rng[tileID];var hazard=bitcast<f32>(rng[clocks+tileID]);var remaining=f32(cfg.batch)/f32(cfg.tile*cfg.tile);var iterations=0u;
  loop {
    var list:array<u32,64>;var borderCount=0u;
    for(var p=0u;p<cfg.tile*cfg.tile;p++){let i=(ty*cfg.tile+p/cfg.tile)*cfg.width+tx*cfg.tile+p%cfg.tile;if(acts[cfg.sites+i]>0u){list[borderCount]=i;borderCount++;}}
    if(borderCount==0u){break;}
    if(hazard>=f32(borderCount)*remaining){hazard-=f32(borderCount)*remaining;break;}
    remaining-=hazard/f32(borderCount);let tgt=list[nextRandom(&random)%borderCount];let src=sampleNeighbor(tgt,nextRandom(&random));let u=f32(nextRandom(&random)>>8u)*(1.0/16777216.0);
    attempt(u32(src),tgt,u,true);
    hazard=-log((f32(nextRandom(&random)>>8u)+.5)*(1.0/16777216.0));iterations++;
    if(iterations>4096u){atomicStore(&events[7],1u);break;}
  }
  rng[tileID]=random;rng[clocks+tileID]=bitcast<u32>(hazard);if(iterations>0u){atomicAdd(&events[9],iterations);}
}
@compute @workgroup_size(1)
fn deferred() {
  let count=min(atomicLoad(&events[1]),cfg.sites/4u);for(var i=0u;i<count;i++){let p=cfg.deferredBase+i*4u;attempt(atomicLoad(&events[p]),atomicLoad(&events[p+1u]),bitcast<f32>(atomicLoad(&events[p+2u])),false);}
  atomicStore(&events[1],0u);
}
@compute @workgroup_size(256)
fn decay(@builtin(global_invocation_id) gid:vec3<u32>) {let i=gid.x;if(i<cfg.sites){let a=acts[i];if(a>0u){acts[i]=a-1u;}}}
@compute @workgroup_size(1)
fn probe() {
  for(var q=0u;q<cfg.probeCount;q++){
    let src=rng[q*2u];let tgt=rng[q*2u+1u];let a=g(i32(src));let b=g(i32(tgt));let out=cfg.logBase+q*4u;
    atomicStore(&events[out],bitcast<u32>(energy(src,tgt,a,b)));
    atomicStore(&events[out+1u],select(0u,1u,sectionAllowed(tgt,a,b)));
    atomicStore(&events[out+2u],select(0u,1u,topologyFull(tgt,b)));
    atomicStore(&events[out+3u],select(0u,1u,vascularAllowed(tgt,a)));
  }
}
