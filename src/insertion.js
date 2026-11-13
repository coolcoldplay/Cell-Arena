/* A manual tissue-edit operation, not a spontaneous migration mechanism.
 * Plan on a private lattice; preserve nuclei, connected bodies, walls and the
 * remaining section-yield budget. No time, RNG or live geometry changes on failure. */
(() => {
  'use strict';
  function insert(s,kind,x,y,radius){
    const direct=s.seed(kind,x,y,radius,{manual:true});
    if(direct||s.lastSeedResult.reason!=='occupied'||!s.section)return direct;
    const reject=reason=>{s.lastSeedResult.reason=reason;return 0;};
    x=Math.round(x);y=Math.round(y);radius=Math.round(radius);
    if(radius<[0,2.1,2.3,1.7][kind]*s.scale)return reject('nucleus');
    const reserved=new Set();
    for(const [dx,dy] of s.section.disk(radius)){
      const i=s.section.at(x+dx,y+dy);if(i<0)return reject('edge');reserved.add(i);
    }
    const plan=CellLabSection.makeSpace(s,reserved,x,y,radius);if(!plan.ok)return reject(plan.reason);
    const yielded=plan.commit(),id=s.seed(kind,x,y,radius,{manual:true});
    if(!id)throw Error('Insertion draft failed its final geometry invariant');
    finish(s,plan.changed);
    s.lastSeedResult={...s.lastSeedResult,inserted:true,displaced:plan.changed.size,yielded};s.log('manual-insert',id,0,{displaced:plan.changed.size,yielded});return id;
  }
  function finish(s,changed){
    for(const [key,h] of s.histories)if(changed.has(h.ctl)||changed.has(h.target))s.histories.delete(key);
    s.scanContacts();s.section.updateJunctions(0);s.immuneInteractions(0);s.prepareEnvironment();
  }
  function shift(s,id,sx,sy,oldPoints,reference){
    const m=s.cells[id],moved=oldPoints.map(i=>s.section.at(s.xs[i]+sx,s.ys[i]+sy));
    if(moved.some(i=>i<0))return {ok:false,reason:'edge'};
    if(moved.some(i=>s.vascular&&!s.vascular.allowed(i,i,id,s.C.pixti(i))))return {ok:false,reason:'vascular'};
    const x=m.nucleusX+sx,y=m.nucleusY+sy,delta=(v,n)=>s.section.delta(v,n);
    const radius=Math.sqrt(Math.max(...moved.map(i=>delta(s.xs[i]-x,s.width)**2+delta(s.ys[i]-y,s.height)**2)));
    // Prefer displacement before repeated squeezing can wrap a neighbour into
    // a crescent around the held body. Confined tissue still uses local yield.
    let plan=pushAside(s,id,sx,sy,oldPoints,moved);
    if(!plan.ok)plan=CellLabSection.makeSpace(s,new Set(moved),x,y,radius,id,oldPoints,reference);
    if(!plan.ok)return plan;
    const activity=oldPoints.map(i=>s.act.pxact(i));plan.commit();for(let k=0;k<moved.length;k++)s.act.setActivity(moved[k],activity[k]);
    return {ok:true,moved,changed:plan.changed};
  }
  // Repeated carving can wrap a neighbour around the dragged body. When no
  // safe local deformation remains, move whole neighbouring bodies sideways
  // in one-site steps. Contacting neighbours move together; nuclei and area
  // move with them. This is an external manipulation, never autonomous motion.
  function pushAside(s,movingID,sx,sy,oldPoints,moved){
    const reserved=new Set(moved),held=new Set(oldPoints.filter(i=>reserved.has(i))),at=(x,y)=>s.section.at(x,y);
    const origin=s.C.grid._pixels,body=new Map();
    for(const m of s.live())if(m.id!==movingID)body.set(m.id,[]);
    for(const i of s.positions)body.get(origin[i])?.push(i);
    for(const sign of [1,-1]){
      const dx=-sy*sign,dy=sx*sign,grid=origin.slice(),points=new Map([...body].map(([id,p])=>[id,p.slice()])),offsets=new Map(),changed=new Set();
      for(const i of oldPoints)grid[i]=0;
      let valid=true;
      for(let step=0;step<Math.ceil(24*s.scale);step++){
        const touching=new Set([...reserved].map(i=>grid[i]).filter(Boolean));if(!touching.size)break;
        const group=new Set(touching),queue=[...touching],targets=new Map();
        for(let q=0;q<queue.length&&valid;q++){
          const id=queue[q],p=points.get(id);if(!p||s.cells[id]?.vesselID){valid=false;break;}
          const next=p.map(i=>at(s.xs[i]+dx,s.ys[i]+dy));targets.set(id,next);
          for(const i of next){
            if(i<0||held.has(i)){valid=false;break;}
            const other=grid[i];if(other&&other!==id&&!group.has(other)){group.add(other);queue.push(other);}
          }
        }
        if(!valid)break;
        for(const id of group)for(const i of points.get(id))grid[i]=0;
        for(const id of group){const next=targets.get(id);points.set(id,next);for(const i of next)grid[i]=id;changed.add(id);offsets.set(id,(offsets.get(id)||0)+1);}
      }
      if(!valid||[...reserved].some(i=>grid[i]))continue;
      for(const i of reserved)grid[i]=movingID;
      return {ok:true,changed,commit(){
        // Add final footprints before clearing vacated pixels to keep IDs live.
        for(const i of s.positions)if(grid[i]&&grid[i]!==origin[i]){s.C.setpixi(i,grid[i]);s.act.setActivity(i,0);}
        for(const i of s.positions)if(!grid[i]&&origin[i]){s.C.setpixi(i,0);s.act.setActivity(i,0);}
        for(const id of changed){const m=s.cells[id],n=offsets.get(id);s.section.rebaseNucleus(m,m.nucleusX+dx*n,m.nucleusY+dy*n);s.updateMechanics(m);}
        s.C.stat_values={};s.refreshPositions();
      }};
    }
    return {ok:false,reason:'crowded'};
  }
  globalThis.CellLabInsertion={insert,shift};
})();
