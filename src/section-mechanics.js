/* A bounded cross-section proxy: biological target is retained while visible
 * target area can reversibly yield. No hidden motion or hidden antigen contact.
 * Optional dynamic protrusive fronts / contact networks: ../MORPHOLOGY.md.
 * These qualitative extensions do not constitute a calibrated U87 model. */
(() => {
  'use strict';
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  class SectionMechanics {
    constructor(sim){this.s=sim;this.disks=new Map();this.junctions=new Map();}
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
      const mode=m.kind===2&&!m.dying?this.s.settings.tumorMorphology:0;
      if(m.morphologyMode!==mode){m.morphologyMode=mode;this.resetProtrusions(m);}
      m.networkDegree=m.networkDegree||0;
      if(mode){
        const scale=this.s.scale,radius=Math.sqrt(Math.max(m.planarTarget,12*scale*scale)/Math.PI);
        m.branchCore=Math.max((m.nucleusRadius||2.3*scale)+1.3*scale,radius*.62);
        m.branchReach=radius*this.s.settings.branchLength;
        m.branchPenalty=5*this.s.settings.branchStrength/(scale*scale);
        m.protrusionForce=5*this.s.settings.branchStrength*Math.max(.1,m.fitness);
        m.maxReach=Math.max(m.maxReach,m.branchReach+2*scale);
      }
    }
    resetProtrusions(m){m.protrusions=[];m.processSerial=0;m.branchCount=0;m.processLength=0;m.shapeSegments=new Float32Array(0);m.processStarted=false;}
    // A soft intracellular polarity scaffold, not extra painted geometry.
    // Every extension must still pass the ordinary adjacent-copy, connected
    // cytoplasm, finite width, nuclear disk, volume and obstacle constraints.
    shapePenalty(m,x,y){
      if(!m?.hasNucleus||(m.dying&&!m.deathIntact))return 0;
      const dx=this.delta(x-m.nucleusX,this.s.width),dy=this.delta(y-m.nucleusY,this.s.height),d2=dx*dx+dy*dy;
      if(!m.morphologyMode)return [0,5,10,18][m.kind]*Math.max(0,Math.sqrt(d2)/m.softReach-1)**2;
      const distance=Math.sqrt(d2);let outside=Math.max(0,distance-m.branchCore),processGap=Infinity;
      const a=m.shapeSegments;
      for(let k=0;k<a.length;k+=6){
        const vx=a[k+2]-a[k],vy=a[k+3]-a[k+1],px=dx-a[k],py=dy-a[k+1],length2=vx*vx+vy*vy;
        const t=length2?clamp((px*vx+py*vy)/length2):0,ex=px-t*vx,ey=py-t*vy,radius=a[k+4]+(a[k+5]-a[k+4])*t;
        const gap=Math.max(0,Math.sqrt(ex*ex+ey*ey)-radius);if(gap<outside)outside=gap;if(gap<processGap)processGap=gap;
      }
      const forward=clamp((distance-m.branchCore)/(5*this.s.scale))*(1-clamp(processGap/(1.5*this.s.scale)));
      return m.branchPenalty*outside*outside-m.protrusionForce*forward;
    }
    pair(a,b){return a<b?(a*65536+b)>>>0:(b*65536+a)>>>0;}
    bond(a,b){return this.junctions.get(this.pair(a,b))?.strength||0;}
    forget(id){
      for(const [key,j] of this.junctions)if(j.a===id||j.b===id){this.junctions.delete(key);}
      this.countJunctions();
    }
    countJunctions(){
      for(const m of this.s.live())m.networkDegree=0;
      for(const j of this.junctions.values())if(j.strength>0){this.s.cells[j.a].networkDegree++;this.s.cells[j.b].networkDegree++;}
    }
    updateJunctions(dt){
      const s=this.s;
      if(s.settings.tumorMorphology!==2||s.settings.networkAdhesion<=0){if(this.junctions.size){this.junctions.clear();this.countJunctions();}return;}
      const seen=new Set();
      for(const m of s.live())if(m.kind===2&&!m.dying)for(const e of s.contacts.get(m.id)?.values()||[]){
        const other=s.cells[e.id];if(e.id<=m.id||other?.kind!==2||other.dying||e.length<2*s.scale)continue;
        const key=this.pair(m.id,e.id);seen.add(key);let j=this.junctions.get(key);
        if(!j||j.birthA!==m.birth||j.birthB!==other.birth){j={a:m.id,b:e.id,birthA:m.birth,birthB:other.birth,dwell:0,strength:0};this.junctions.set(key,j);}
        j.dwell+=Math.max(0,dt);j.strength=8*s.settings.networkAdhesion*clamp((j.dwell-20)/40);
      }
      for(const key of this.junctions.keys())if(!seen.has(key))this.junctions.delete(key);
      this.countJunctions();
    }
    updateBranches(dt){
      const s=this.s;if(!s.settings.tumorMorphology||dt<=0||s.C.time%8)return;
      for(const m of s.live())if(m.morphologyMode&&!m.dying&&m.hasNucleus){
        if(!m.processStarted){
          const angle=Math.atan2(m.py,m.px);this.newProcess(m,angle);
          if(m.morphologyMode===1||s.C.random()<.6)this.newProcess(m,angle+Math.PI+(s.C.random()-.5)*1.1);
          m.processStarted=true;m.processStartedAt=s.C.time;
        }
        const remove=new Set();
        for(const p of m.protrusions){
          p.age+=8;const points=p.points,tip=points.at(-1),previous=points.at(-2),near=this.tipNeighbourhood(m,tip),children=m.protrusions.some(q=>q.parent===p.id);
          if(near.bonded){p.stalled=0;continue;}
          if(p.age>p.lifetime||p.stalled>160||Math.hypot(...tip)>m.branchReach+1.5*s.scale)p.retract=true;
          if(p.retract){
            if(children){for(const q of m.protrusions)if(q.parent===p.id)q.retract=true;continue;}
            const dx=tip[0]-previous[0],dy=tip[1]-previous[1],length=Math.hypot(dx,dy),step=.7*s.scale;
            if(length<=step){points.pop();if(points.length<2)remove.add(p.id);}
            else{tip[0]-=dx/length*step;tip[1]-=dy/length*step;}continue;
          }
          // A growth front may advance only after real cytoplasm reaches it.
          if(!near.support){p.stalled+=8;continue;}
          const length=this.processDistance(p);if(length>=p.limit)continue;
          let best=null,score=-Infinity;const jitter=(s.C.random()-.5)*.5;
          for(const turn of [-.5,0,.5]){
            const angle=p.angle+jitter+turn,ux=Math.cos(angle),uy=Math.sin(angle),step=.85*s.scale*Math.max(.2,m.fitness),next=[tip[0]+ux*step,tip[1]+uy*step];
            if(Math.hypot(...next)>m.branchReach)continue;
            const look=this.tipScore(m,tip,angle,step);if(!Number.isFinite(look))continue;
            const value=look+.8*Math.cos(turn+jitter);if(value>score){score=value;best={next,angle};}
          }
          if(!best){p.stalled+=8;continue;}p.stalled=0;p.angle=best.angle;
          // Freeze a bend every few model lengths. The tip itself advances
          // continuously; this cannot create a distant disconnected branch.
          if(Math.hypot(tip[0]-previous[0],tip[1]-previous[1])>3.5*s.scale&&points.length<10)points.push(best.next);
          else{tip[0]=best.next[0];tip[1]=best.next[1];}
        }
        m.protrusions=m.protrusions.filter(p=>!remove.has(p.id));
        const limit=m.morphologyMode===1?2:5;
        if(s.C.time>m.processStartedAt&&m.protrusions.length<limit&&(m.protrusions.length===0||s.C.random()<.024*(s.settings.branching??1))){
          let parent=null,node=0,angle=s.C.random()*2*Math.PI;
          if(m.morphologyMode===2&&s.C.random()<.55){const eligible=m.protrusions.filter(p=>!p.parent&&!p.retract&&p.points.length>=4);if(eligible.length){parent=eligible[Math.floor(s.C.random()*eligible.length)];node=1+Math.floor(s.C.random()*(parent.points.length-2));const a=parent.points[node-1],b=parent.points[node];angle=Math.atan2(b[1]-a[1],b[0]-a[0])+(s.C.random()<.5?-1:1)*(.65+.65*s.C.random());}}
          if(m.morphologyMode===1){const p=m.protrusions[0];angle=p?p.angle+Math.PI:Math.atan2(m.py,m.px);}
          if(!parent){
            // Compete for local free membrane, rather than equal angular slots.
            const start=angle;let best=-Infinity;for(let k=0;k<8;k++){const candidate=start+k*Math.PI/4,root=[Math.cos(candidate)*m.branchCore,Math.sin(candidate)*m.branchCore];let score=this.tipScore(m,root,candidate,s.scale);for(const p of m.protrusions)if(!p.parent)score-=Math.max(0,Math.cos(candidate-Math.atan2(p.points[1][1],p.points[1][0])))*1.4;if(score>best){best=score;angle=candidate;}}
          }
          const root=parent?parent.points[node]:[0,0];if(!parent||this.tipNeighbourhood(m,root).support)this.newProcess(m,angle,parent,node);
        }
        this.compileProcesses(m);s.updateMechanics(m);
      }
    }
    newProcess(m,angle,parent=null,node=0){
      const s=this.s,root=parent?parent.points[node].slice():[0,0],length=parent?s.scale:m.branchCore+s.scale;
      const tip=[root[0]+Math.cos(angle)*length,root[1]+Math.sin(angle)*length];
      m.protrusions.push({id:++m.processSerial,parent:parent?.id||0,points:[root,tip],angle,age:0,lifetime:240+s.C.random()*760,limit:m.branchReach*(.65+.35*s.C.random())*(parent?.7:1),width:.8+s.C.random()*.4,retract:false,stalled:0});
    }
    processDistance(p){let length=0;for(let i=1;i<p.points.length;i++)length+=Math.hypot(p.points[i][0]-p.points[i-1][0],p.points[i][1]-p.points[i-1][1]);return length;}
    tipNeighbourhood(m,point){
      const s=this.s,x=Math.round(m.nucleusX+point[0]),y=Math.round(m.nucleusY+point[1]);let support=false,bonded=false;
      for(const [dx,dy] of this.disk(1.8*s.scale)){const i=this.at(x+dx,y+dy);if(i<0||s.C.pixti(i)!==m.id)continue;support=true;for(const j of s.faces[i])if(this.bond(m.id,s.C.pixti(j))>0)bonded=true;}
      return {support,bonded};
    }
    tipScore(m,tip,angle,step){
      const s=this.s,ux=Math.cos(angle),uy=Math.sin(angle);let score=0;
      for(const d of [step/2,step,step+2*s.scale]){
        const i=this.at(Math.round(m.nucleusX+tip[0]+ux*d),Math.round(m.nucleusY+tip[1]+uy*d));
        if(i<0||s.C.cellKind(s.C.pixti(i))===4){if(d<=step)return -Infinity;score-=3;continue;}
        const id=s.C.pixti(i),other=s.cells[id];score+=id===m.id?-.25:other?.kind===2&&!other.dying?.45:id?-.35:.12;
      }
      return score;
    }
    compileProcesses(m){
      const s=this.s,segments=[];let outside=0;
      for(const p of m.protrusions){const length=this.processDistance(p);outside+=Math.max(0,length-(p.parent?0:m.branchCore));let covered=0;
        for(let k=1;k<p.points.length;k++){const a=p.points[k-1],b=p.points[k],distance=Math.hypot(b[0]-a[0],b[1]-a[1]),base=(p.parent?1.7:2.7)*s.scale*p.width;
          const r0=Math.max(1.1*s.scale,base*(1-.65*covered/Math.max(1,length)));covered+=distance;
          const r1=Math.max(1.1*s.scale,base*(1-.65*covered/Math.max(1,length)));segments.push(...a,...b,r0,r1);}
      }
      // Float32 transport is shared verbatim with WASM; distance arithmetic
      // remains double in both implementations for identical copy decisions.
      m.shapeSegments=Float32Array.from(segments);m.processLength=outside;m.branchCount=m.protrusions.length;
    }
    rebaseNucleus(m,x,y){
      const s=this.s;
      if(m.morphologyMode&&(x!==m.nucleusX||y!==m.nucleusY)){
        const sx=this.delta(x-m.nucleusX,s.width),sy=this.delta(y-m.nucleusY,s.height);
        // Preserve substrate-attached endpoints when only the nucleus moves.
        for(const p of m.protrusions)for(let i=p.parent?0:1;i<p.points.length;i++){p.points[i][0]-=sx;p.points[i][1]-=sy;}
        m.nucleusX=x;m.nucleusY=y;this.compileProcesses(m);s.updateMechanics(m);
      }else{m.nucleusX=x;m.nucleusY=y;}
    }
    update(dt){
      const s=this.s,live=s.live(),next=[];
      this.updateJunctions(dt);this.updateBranches(dt);
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
        this.rebaseNucleus(m,x,y);
      }
    }
    allowed(src,tgt,a,b){
      const s=this.s,grid=s.C.grid._pixels,source=s.cells[a],target=s.cells[b];
      if(target&&(!target.dying||target.deathIntact)){
        if(s.C.getVolume(b)<=target.minVisibleArea)return false;
        if(target.hasNucleus&&this.distance2(s.xs[tgt],s.ys[tgt],target)<=target.nucleusRadius**2)return false;
      }
      if(source&&(!source.dying||source.deathIntact)){
        if(source.hasNucleus&&this.distance2(s.xs[tgt],s.ys[tgt],source)>source.maxReach**2)return false;
        let attached=false;for(const j of s.faces[tgt])if(grid[j]===a){attached=true;break;}if(!attached)return false;
      }
      // One-pixel tips may nucleate, but must widen before they elongate.
      // A flat front must be able to add its first pixel; prohibiting every
      // local articulation would freeze every rectangular cell.
      const own=(j,id)=>j>=0&&(j===tgt?a:grid[j])===id;
      const thick=(j,id)=>{const r=s.rings[j];for(const [p,q,k] of [[0,1,7],[2,1,3],[4,3,5],[6,5,7]])if(own(r[p],id)&&own(r[q],id)&&own(r[k],id))return true;return false;};
      if(source&&(!source.dying||source.deathIntact)){let anchored=false;for(const j of s.faces[tgt])if(grid[j]===a&&thick(j,a)){anchored=true;break;}if(!anchored)return false;}
      const check=j=>{const id=j===tgt?a:grid[j],m=s.cells[id];if(!m||(m.dying&&!m.deathIntact)||(id!==a&&id!==b))return true;
        let mask=0,faces=0;const ring=s.rings[j];for(let k=0;k<8;k++){const n=ring[k];if(n>=0&&(n===tgt?a:grid[n])===id){mask|=1<<k;if(k&1)faces++;}}
        if(faces<2||s.connected4[mask]===1)return true;
        // Ignore a single leaf tip. The remaining body must still connect
        // around this site; a bridge between two substantial lobes is illegal.
        for(const k of [1,3,5,7])if(mask&(1<<k)){const n=ring[k];let degree=0;for(const f of s.faces[n])if(own(f,id))degree++;if(degree===1)mask&=~(1<<k);}
        return !mask||s.connected4[mask]===1;
      };
      if(source&&(!source.dying||source.deathIntact)&&!check(tgt))return false;
      for(const j of s.faces[tgt])if(!check(j))return false;
      return true;
    }
    energy(src,tgt,a,b){
      const s=this.s,penalty=m=>this.shapePenalty(m,s.xs[tgt],s.ys[tgt]);
      return penalty(s.cells[a])-penalty(s.cells[b]);
    }
  }
  globalThis.CellLabSection=SectionMechanics;
})();
