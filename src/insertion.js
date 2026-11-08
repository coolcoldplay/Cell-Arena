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
    const plan=makeSpace(s,reserved,x,y,radius);if(!plan.ok)return reject(plan.reason);
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
    const x=m.nucleusX+sx,y=m.nucleusY+sy,delta=(v,n)=>s.section.delta(v,n);
    const radius=Math.sqrt(Math.max(...moved.map(i=>delta(s.xs[i]-x,s.width)**2+delta(s.ys[i]-y,s.height)**2)));
    // Prefer displacement before repeated squeezing can wrap a neighbour into
    // a crescent around the held body. Confined tissue still uses local yield.
    let plan=pushAside(s,id,sx,sy,oldPoints,moved);
    if(!plan.ok)plan=makeSpace(s,new Set(moved),x,y,radius,id,oldPoints,reference);
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
          const id=queue[q],p=points.get(id);if(!p){valid=false;break;}
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
  function makeSpace(s,reserved,x,y,radius,movingID=0,oldPoints=[],reference=new Map()){
    const reject=reason=>({ok:false,reason});
    const at=(x,y)=>s.section.at(x,y),delta=(v,n)=>s.section.delta(v,n),grid=s.C.grid._pixels.slice(),affected=new Set();
    // The vacated trailing edge is available for elastic neighbour motion.
    // No live pixels are edited until the entire one-site move is valid.
    for(const i of oldPoints)grid[i]=0;
    for(const i of reserved){const id=grid[i];if(id&&!s.cells[id])return reject('wall');if(id)affected.add(id);}
    const cells=new Map();for(const m of s.live())if(m.id!==movingID)cells.set(m.id,{m,points:new Set(),nx:m.nucleusX,ny:m.nucleusY});
    for(const i of s.positions)cells.get(grid[i])?.points.add(i);
    for(const c of cells.values()){
      c.initial=c.points.size;c.fraction=c.m.sectionFraction;
      c.minimum=Math.ceil(Math.max(c.initial*Math.min(1,(1-s.settings.sectionYield)/c.fraction),Math.min(c.initial,c.m.minVisibleArea||0)));
      if(movingID){
        if(!reference.has(c.m.id))reference.set(c.m.id,{area:c.initial,fraction:c.fraction});c.reference=reference.get(c.m.id);
        // Manual squeezing uses the visible area at gesture start. The
        // automatic-growth target can exceed a newly seeded body's area and
        // would otherwise prohibit all yielding before it has grown.
        c.minimum=Math.ceil(Math.max(c.reference.area*(1-s.settings.sectionYield)/c.reference.fraction,Math.min(c.reference.area,s.section.disk(c.m.nucleusRadius).length+4*s.scale*s.scale)));
        c.maximum=Math.max(c.reference.area,c.reference.area/c.reference.fraction);
      }
    }
    const fits=(c,x,y,exclude=false)=>(c.m.dying&&!c.m.deathIntact)||s.section.disk(c.m.nucleusRadius).every(([dx,dy])=>{const i=at(x+dx,y+dy);return i>=0&&grid[i]===c.m.id&&(!exclude||!reserved.has(i));});
    const changed=new Set(),changes=new Map(oldPoints.map(i=>[i,0]));
    const assign=(i,id)=>{const old=grid[i];if(old===id)return;cells.get(old)?.points.delete(i);cells.get(id)?.points.add(i);if(old)changed.add(old);if(id)changed.add(id);grid[i]=id;changes.set(i,id);};
    function connected(points){
      const first=points.values().next().value;if(first===undefined)return false;
      const seen=new Set([first]),queue=[first];for(let n=0;n<queue.length;n++)for(const j of s.faces[queue[n]])if(points.has(j)&&!seen.has(j)){seen.add(j);queue.push(j);}
      return seen.size===points.size;
    }
    // Same local thin-neck rule as the runtime section constraint, on draft pixels.
    function neckSafe(i){
      const id=grid[i];if(!cells.has(id))return true;let mask=0,degree=0;
      for(let k=0;k<8;k++){const j=s.rings[i][k];if(j>=0&&grid[j]===id){mask|=1<<k;if(k&1)degree++;}}
      if(degree<2||s.connected4[mask]===1)return true;
      for(const k of [1,3,5,7])if(mask&(1<<k)){const j=s.rings[i][k];if(s.faces[j].filter(q=>grid[q]===id).length===1)mask&=~(1<<k);}
      return !mask||s.connected4[mask]===1;
    }
    function nucleusOutside(c){
      if(c.m.dying&&!c.m.deathIntact)return [c.nx,c.ny];
      // A path of one-site moves fitting inside the current body. Never jump
      // a nucleus across another cell or through an impassable slit.
      const first=at(c.nx,c.ny);if(first<0||!fits(c,c.nx,c.ny))return null;
      const queue=[first],seen=new Set(queue);
      for(let n=0;n<queue.length;n++){
        const i=queue[n];if(fits(c,s.xs[i],s.ys[i],true))return [s.xs[i],s.ys[i]];
        for(const j of s.faces[i])if(!seen.has(j)){seen.add(j);if(grid[j]===c.m.id&&fits(c,s.xs[j],s.ys[j]))queue.push(j);}
      }
      return null;
    }
    function clear(c){
      const cut=[...c.points].filter(i=>reserved.has(i));if(!cut.length)return true;
      if(c.points.size-cut.length<c.minimum)return false;
      const nucleus=nucleusOutside(c);if(!nucleus)return false;
      for(const i of cut)grid[i]=0;
      const remaining=new Set([...c.points].filter(i=>!reserved.has(i))),trim=[];
      // A moving rounded footprint may leave a concave one-pixel spur that
      // cannot be widened without filling the dragged cell. Retract that spur
      // locally, preserving the whole connected body and the nuclear disk.
      if(movingID)for(let pass=0;pass<4*s.scale;pass++){
        let removed=false;
        for(const i of [...remaining])if(!neckSafe(i)&&delta(s.xs[i]-nucleus[0],s.width)**2+delta(s.ys[i]-nucleus[1],s.height)**2>c.m.nucleusRadius**2){
          remaining.delete(i);grid[i]=0;
          if(connected(remaining)){trim.push(i);removed=true;}else{remaining.add(i);grid[i]=c.m.id;}
        }
        if(!removed)break;
      }
      const joined=connected(remaining),narrow=[...remaining].filter(i=>!neckSafe(i)),valid=remaining.size>=c.minimum&&(!movingID||remaining.size<=c.maximum+4*s.scale*s.scale)&&joined&&!narrow.length;
      if(movingID)c.repair=narrow.length?narrow:!joined?[...remaining].filter(i=>s.faces[i].some(j=>reserved.has(j))):[];
      for(const i of [...cut,...trim])grid[i]=c.m.id;
      if(!valid)return false;
      c.nx=nucleus[0];c.ny=nucleus[1];for(const i of [...cut,...trim])assign(i,0);return true;
    }
    function grow(c){
      if(movingID&&c.points.size>c.maximum+reserved.size+4*s.scale*s.scale)return false;
      // A nucleus can lie on the opposite side of the intruding body from its
      // deformed centroid. Grow beside that nucleus so it has a continuous
      // escape route, rather than inflating a distant lobe indefinitely.
      const id=c.m.id,dirX=delta((movingID?c.nx:c.m.x)-x,s.width),dirY=delta((movingID?c.ny:c.m.y)-y,s.height),norm=Math.hypot(dirX,dirY),ux=norm>.1?dirX/norm:1,uy=norm>.1?dirY/norm:0;
      const distance=radius+c.m.nucleusRadius+s.scale,aimX=x+ux*distance,aimY=y+uy*distance,candidates=new Set();
      for(const i of c.points)for(const j of s.faces[i])if(grid[j]!==id&&!reserved.has(j))candidates.add(j);
      const score=i=>{
        const aim=delta(s.xs[i]-aimX,s.width)**2+delta(s.ys[i]-aimY,s.height)**2;
        return c.repair?.length?100*Math.min(...c.repair.map(j=>delta(s.xs[i]-s.xs[j],s.width)**2+delta(s.ys[i]-s.ys[j],s.height)**2))+.01*aim:aim;
      };
      for(const i of [...candidates].sort((a,b)=>score(a)-score(b))){
        const other=grid[i],donor=cells.get(other);
        if(other&&!donor)continue;
        if(delta(s.xs[i]-x,s.width)**2+delta(s.ys[i]-y,s.height)**2>(radius+18*s.scale)**2)continue;
        if(delta(s.xs[i]-c.nx,s.width)**2+delta(s.ys[i]-c.ny,s.height)**2>c.m.maxReach**2)continue;
        if(donor&&(donor.points.size<=donor.minimum||delta(s.xs[i]-donor.nx,s.width)**2+delta(s.ys[i]-donor.ny,s.height)**2<=donor.m.nucleusRadius**2))continue;
        if(donor){let mask=0;for(let k=0;k<8;k++){const j=s.rings[i][k];if(j>=0&&grid[j]===other)mask|=1<<k;}if(s.connected4[mask]!==1)continue;}
        const thick=j=>{const ring=s.rings[j];return [[0,1,7],[2,1,3],[4,3,5],[6,5,7]].some(indices=>indices.every(k=>ring[k]>=0&&grid[ring[k]]===id));};
        if(!s.faces[i].some(j=>grid[j]===id&&thick(j)))continue;
        grid[i]=id;const valid=neckSafe(i)&&s.faces[i].every(neckSafe);grid[i]=other;
        if(!valid)continue;assign(i,id);return true;
      }
      return false;
    }
    let budget=256*s.scale*s.scale;
    for(const id of affected){const c=cells.get(id);let done=clear(c);
      while(!done&&budget>0){let added=0;for(let n=0;n<Math.ceil(4*s.scale)&&budget>0;n++){budget--;if(!grow(c))break;added++;}if(!added)break;done=clear(c);}
      if(!done)return reject('crowded');
    }
    // Validate the entire draft, including neighbours that donated area.
    for(const id of changed){const c=cells.get(id);if(!c||c.points.size<c.minimum||!connected(c.points)||!fits(c,c.nx,c.ny)||![...c.points].every(neckSafe))return reject('crowded');}
    if([...reserved].some(i=>grid[i]))return reject('crowded');
    if(movingID)for(const i of reserved)changes.set(i,movingID);
    return {ok:true,changed,commit(){
    // Add before removing, preserving each existing cell's ID and metadata.
    for(const [i,id] of changes)if(id){s.C.setpixi(i,id);s.act.setActivity(i,0);}
    for(const [i,id] of changes)if(!id){s.C.setpixi(i,0);s.act.setActivity(i,0);}
    let yielded=0;for(const id of changed){const c=cells.get(id),m=c.m;s.section.rebaseNucleus(m,c.nx,c.ny);m.sectionFraction=movingID?Math.max(1-s.settings.sectionYield,Math.min(1,c.reference.fraction*c.points.size/c.reference.area)):c.fraction*Math.min(1,c.points.size/c.initial);if(m.sectionFraction<c.fraction)yielded++;s.updateMechanics(m);}
    s.C.stat_values={};s.refreshPositions();
    return yielded;
    }};
  }
  globalThis.CellLabInsertion={insert,shift};
})();
