/* A bounded cross-section proxy: biological target is retained while visible
 * target area can reversibly yield. No hidden motion or hidden antigen contact. */
(() => {
  'use strict';
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  class SectionMechanics {
    constructor(sim){this.s=sim;this.disks=new Map();}
    delta(x,length){if(this.s.wrap){if(x>length/2)x-=length;else if(x< -length/2)x+=length;}return x;}
    distance2(x,y,m){const dx=this.delta(x-m.nucleusX,this.s.width),dy=this.delta(y-m.nucleusY,this.s.height);return dx*dx+dy*dy;}
    disk(radius){const key=radius.toFixed(3);if(this.disks.has(key))return this.disks.get(key);const d=[];for(let x=-Math.ceil(radius);x<=radius;x++)for(let y=-Math.ceil(radius);y<=radius;y++)if(x*x+y*y<=radius*radius)d.push([x,y]);this.disks.set(key,d);return d;}
    at(x,y){const s=this.s;if(s.wrap){x=(x+s.width)%s.width;y=(y+s.height)%s.height;}if(x<0||y<0||x>=s.width||y>=s.height)return -1;return s.C.grid.p2i([x,y]);}
    fits(m,x,y){for(const [dx,dy] of this.disk(m.nucleusRadius)){const i=this.at(x+dx,y+dy);if(i<0||this.s.C.grid._pixels[i]!==m.id)return false;}return true;}
    findNucleus(m,points){
      const s=this.s,r=[0,2.1,2.3,1.7][m.kind]*s.scale;m.nucleusRadius=r;
      const candidates=points.filter(i=>s.C.pixti(i)===m.id);if(!candidates.length)return null;
      let best=null,score=Infinity;
      for(const i of candidates){const x=s.xs[i],y=s.ys[i],dx=this.delta(x-m.x,s.width),dy=this.delta(y-m.y,s.height),d=dx*dx+dy*dy;
        if(d<score&&this.fits(m,x,y)){best=[x,y];score=d;}}
      return best;
    }
    initialize(m,points){const center=this.findNucleus(m,points);if(center){m.nucleusX=center[0];m.nucleusY=center[1];m.hasNucleus=true;}return !!center;}
    sync(m){
      m.sectionFraction=m.sectionFraction??1;
      m.planarTarget=m.target*m.sectionFraction;
      m.offPlaneTarget=m.target-m.planarTarget;
      m.maxReach=2.05*Math.sqrt(Math.max(m.planarTarget,12*this.s.scale*this.s.scale)/Math.PI);
      m.softReach=1.25*Math.sqrt(Math.max(m.planarTarget,12*this.s.scale*this.s.scale)/Math.PI);
      m.minVisibleArea=Math.min(m.planarTarget*.82,Math.max(8*this.s.scale*this.s.scale,m.target*(1-this.s.settings.sectionYield)*.82));
    }
    update(dt){
      const s=this.s,live=s.live(),next=[];
      for(const m of live){
        if(m.dying)continue;
        let push=0,total=0;
        for(const edge of s.contacts.get(m.id)?.values()||[]){const other=s.cells[edge.id];if(!other||other.dying)continue;
          const length=Math.hypot(edge.nx,edge.ny)||1,normalX=edge.nx/length,normalY=edge.ny/length;
          const active=other.kind===3?s.settings.immuneMotility:other.kind===2?s.settings.tumorMotility*other.genome.invasion:s.settings.normalMotility*.2;
          push+=edge.length*active*(.35+.65*Math.max(0,-other.px*normalX-other.py*normalY));total+=edge.length;
        }
        const pressure=clamp(.3*m.confinement+(total?push/Math.max(1,4*Math.sqrt(s.C.getVolume(m.id)))*1.8:0));
        const goal=1-s.settings.sectionYield*pressure,rate=goal<m.sectionFraction?.018:.006;
        next.push([m,m.sectionFraction+clamp(goal-m.sectionFraction,-rate*dt,rate*dt),pressure]);
      }
      for(const [m,f,pressure] of next){m.sectionFraction=clamp(f,0.5,1);m.sectionPressure=pressure;this.sync(m);s.updateMechanics(m);}
      for(const m of live){
        if(!m.hasNucleus||m.dying)continue;
        const dx=this.delta(m.x-m.nucleusX,s.width),dy=this.delta(m.y-m.nucleusY,s.height);
        let x=m.nucleusX,y=m.nucleusY,score=dx*dx+dy*dy;
        for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nx=(m.nucleusX+ox+s.width)%s.width,ny=(m.nucleusY+oy+s.height)%s.height;
          if(!s.wrap&&(m.nucleusX+ox<0||m.nucleusX+ox>=s.width||m.nucleusY+oy<0||m.nucleusY+oy>=s.height))continue;
          const ex=this.delta(m.x-nx,s.width),ey=this.delta(m.y-ny,s.height),cost=ex*ex+ey*ey;
          if(cost<score&&this.fits(m,nx,ny)){score=cost;x=nx;y=ny;}
        }
        m.nucleusX=x;m.nucleusY=y;
      }
    }
    allowed(src,tgt,a,b){
      const s=this.s,grid=s.C.grid._pixels,source=s.cells[a],target=s.cells[b];
      if(target&&!target.dying){
        if(s.C.getVolume(b)<=target.minVisibleArea)return false;
        if(target.hasNucleus&&this.distance2(s.xs[tgt],s.ys[tgt],target)<=target.nucleusRadius**2)return false;
      }
      if(source&&!source.dying){
        if(source.hasNucleus&&this.distance2(s.xs[tgt],s.ys[tgt],source)>source.maxReach**2)return false;
        let attached=false;for(const j of s.faces[tgt])if(grid[j]===a){attached=true;break;}if(!attached)return false;
      }
      // One-pixel tips may nucleate, but must widen before they elongate.
      // A flat front must be able to add its first pixel; prohibiting every
      // local articulation would freeze every rectangular cell.
      const own=(j,id)=>j>=0&&(j===tgt?a:grid[j])===id;
      const thick=(j,id)=>{const r=s.rings[j];for(const [p,q,k] of [[0,1,7],[2,1,3],[4,3,5],[6,5,7]])if(own(r[p],id)&&own(r[q],id)&&own(r[k],id))return true;return false;};
      if(source&&!source.dying){let anchored=false;for(const j of s.faces[tgt])if(grid[j]===a&&thick(j,a)){anchored=true;break;}if(!anchored)return false;}
      const check=j=>{const id=j===tgt?a:grid[j],m=s.cells[id];if(!m||m.dying||(id!==a&&id!==b))return true;
        let mask=0,faces=0;const ring=s.rings[j];for(let k=0;k<8;k++){const n=ring[k];if(n>=0&&(n===tgt?a:grid[n])===id){mask|=1<<k;if(k&1)faces++;}}
        if(faces<2||s.connected4[mask]===1)return true;
        // Ignore a single leaf tip. The remaining body must still connect
        // around this site; a bridge between two substantial lobes is illegal.
        for(const k of [1,3,5,7])if(mask&(1<<k)){const n=ring[k];let degree=0;for(const f of s.faces[n])if(own(f,id))degree++;if(degree===1)mask&=~(1<<k);}
        return !mask||s.connected4[mask]===1;
      };
      if(source&&!source.dying&&!check(tgt))return false;
      for(const j of s.faces[tgt])if(!check(j))return false;
      return true;
    }
    energy(src,tgt,a,b){
      const s=this.s,penalty=m=>{if(!m?.hasNucleus||m.dying)return 0;const d=Math.sqrt(this.distance2(s.xs[tgt],s.ys[tgt],m))/m.softReach;return [0,5,10,18][m.kind]*Math.max(0,d-1)**2;};
      return penalty(s.cells[a])-penalty(s.cells[b]);
    }
  }
  globalThis.CellLabSection=SectionMechanics;
})();
