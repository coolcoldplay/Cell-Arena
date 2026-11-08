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
    const at=(x,y)=>s.section.at(x,y),delta=(v,n)=>s.section.delta(v,n),original=s.C.grid._pixels,grid=original.slice(),reserved=new Set(),affected=new Set();
    for(const [dx,dy] of s.section.disk(radius)){
      const i=at(x+dx,y+dy);if(i<0)return reject('edge');const id=grid[i];
      if(id&&!s.cells[id])return reject('wall');reserved.add(i);if(id)affected.add(id);
    }
    const cells=new Map();for(const m of s.live())cells.set(m.id,{m,points:new Set(),nx:m.nucleusX,ny:m.nucleusY});
    for(const i of s.positions)cells.get(grid[i])?.points.add(i);
    for(const c of cells.values()){
      c.initial=c.points.size;c.fraction=c.m.sectionFraction;
      c.minimum=Math.ceil(Math.max(c.initial*Math.min(1,(1-s.settings.sectionYield)/c.fraction),Math.min(c.initial,c.m.minVisibleArea||0)));
    }
    const fits=(c,x,y,exclude=false)=>s.section.disk(c.m.nucleusRadius).every(([dx,dy])=>{const i=at(x+dx,y+dy);return i>=0&&grid[i]===c.m.id&&(!exclude||!reserved.has(i));});
    const changed=new Set(),changes=new Map();
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
      const remaining=new Set([...c.points].filter(i=>!reserved.has(i))),valid=connected(remaining)&&[...remaining].every(neckSafe);
      for(const i of cut)grid[i]=c.m.id;
      if(!valid)return false;
      c.nx=nucleus[0];c.ny=nucleus[1];for(const i of cut)assign(i,0);return true;
    }
    function grow(c){
      const id=c.m.id,dirX=delta(c.m.x-x,s.width),dirY=delta(c.m.y-y,s.height),norm=Math.hypot(dirX,dirY),ux=norm>.1?dirX/norm:1,uy=norm>.1?dirY/norm:0;
      const distance=radius+c.m.nucleusRadius+s.scale,aimX=x+ux*distance,aimY=y+uy*distance,candidates=new Set();
      for(const i of c.points)for(const j of s.faces[i])if(grid[j]!==id&&!reserved.has(j))candidates.add(j);
      const score=i=>delta(s.xs[i]-aimX,s.width)**2+delta(s.ys[i]-aimY,s.height)**2;
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
    // Add before removing, preserving each existing cell's ID and metadata.
    for(const [i,id] of changes)if(id){s.C.setpixi(i,id);s.act.setActivity(i,0);}
    for(const [i,id] of changes)if(!id){s.C.setpixi(i,0);s.act.setActivity(i,0);}
    let yielded=0;for(const id of changed){const c=cells.get(id),m=c.m;m.nucleusX=c.nx;m.nucleusY=c.ny;m.sectionFraction=c.fraction*Math.min(1,c.points.size/c.initial);if(m.sectionFraction<c.fraction)yielded++;s.updateMechanics(m);}
    s.C.stat_values={};s.refreshPositions();
    const id=s.seed(kind,x,y,radius,{manual:true});
    if(!id)throw Error('Insertion draft failed its final geometry invariant');
    for(const [key,h] of s.histories)if(changed.has(h.ctl)||changed.has(h.target))s.histories.delete(key);
    s.scanContacts();s.immuneInteractions(0);s.prepareEnvironment();
    s.lastSeedResult={...s.lastSeedResult,inserted:true,displaced:changed.size,yielded};s.log('manual-insert',id,0,{displaced:changed.size,yielded});return id;
  }
  globalThis.CellLabInsertion={insert};
})();
