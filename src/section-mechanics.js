/* A bounded cross-section proxy: biological target is retained while visible
 * target area can reversibly yield. No hidden motion or hidden antigen contact.
 * Optional dynamic protrusive fronts / contact networks: ../MORPHOLOGY.md.
 * These qualitative extensions do not constitute a calibrated U87 model. */
(() => {
  'use strict';
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const nucleusSpokes=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return [Math.cos(a),Math.sin(a),Math.cos(2*a),Math.sin(2*a)];});
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
    updateNucleusShape(m,dt){
      if(!m.hasNucleus||dt<=0||m.dying)return;
      // Local cytoplasmic clearances drive a slowly relaxing shape tensor.
      // The original protected nuclear disk remains a conservative envelope:
      // this bounded contour never grants extra passage through a narrow gap.
      const s=this.s,limit=4*m.nucleusRadius,step=Math.max(1,s.scale);let xx=0,xy=0,total=0;
      for(const [ux,uy,qx,qy]of nucleusSpokes){let reach=m.nucleusRadius;
        for(let d=m.nucleusRadius+step;d<=limit;d+=step){const i=this.at(Math.round(m.nucleusX+ux*d),Math.round(m.nucleusY+uy*d));if(i<0||s.C.grid._pixels[i]!==m.id)break;reach=d;}
        const weight=reach*reach;xx+=weight*qx;xy+=weight*qy;total+=weight;
      }
      const gain=1.35*(1+.35*(m.sectionPressure||0))/Math.max(1,total);let tx=xx*gain,ty=xy*gain,norm=Math.hypot(tx,ty);if(norm>.34){tx*=.34/norm;ty*=.34/norm;}
      const blend=-Math.expm1(-dt/32);m.nucleusStrainX=(m.nucleusStrainX||0)+(tx-(m.nucleusStrainX||0))*blend;m.nucleusStrainY=(m.nucleusStrainY||0)+(ty-(m.nucleusStrainY||0))*blend;
    }
    update(dt){
      const s=this.s,live=s.live(),next=[];
      this.updateJunctions(dt);this.updateBranches(dt);
      for(const m of live){
        if(m.dying)continue;
        let push=0;
        const area=s.C.getVolume(m.id),drive=m.drive/35;
        for(const edge of s.contacts.get(m.id)?.values()||[]){const other=s.cells[edge.id];if(other?.dying)continue;
          const length=Math.hypot(edge.nx,edge.ny)||1,normalX=edge.nx/length,normalY=edge.ny/length;
          // Reaction to this cell's front and a neighbour pushing inward. Use
          // the effective drive, including metabolic, mitotic and synapse gates;
          // ordinary contact (or tangential/outward motion) is not pressure.
          const own=drive*Math.max(0,m.px*normalX+m.py*normalY);
          const incoming=other?other.drive/35*Math.max(0,-other.px*normalX-other.py*normalY):0;
          push+=edge.length*(own+incoming);
        }
        const pressure=clamp(push/Math.max(1,4*Math.sqrt(area))*1.8);
        // Transfer only material displaced by actual compression. Lowering the
        // target before geometry changes stores a tissue-wide contraction that
        // a single death can release into a macroscopic cavity. Yield follows
        // existing area loss rather than anticipating more. All movement still
        // pays the ordinary CPM energy and nuclear/topological constraints.
        const compression=clamp(1-area/Math.max(1,m.target));
        const goal=1-Math.min(s.settings.sectionYield*pressure,compression),rate=goal<m.sectionFraction?.018:.006;
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
        if(s.C.time%4===0)this.updateNucleusShape(m,4*dt);
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
      // Filling a one-site extracellular pore surrounded on all four faces by
      // this cell cannot thin a neck, sever cytoplasm or displace another cell.
      // Staggered diagonal pores otherwise fail the 3x3 thickness test forever:
      // the upper/lower cortex is connected outside that local stencil.
      // Keep ordinary CPM energy/volume acceptance, reach and nuclear rules.
      if(source&&!b&&s.faces[tgt].length===4&&s.faces[tgt].every(j=>grid[j]===a))return true;
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
  function makeSpace(s,reserved,x,y,radius,movingID=0,oldPoints=[],reference=new Map()){
    const reject=reason=>({ok:false,reason});
    const at=(x,y)=>s.section.at(x,y),delta=(v,n)=>s.section.delta(v,n),grid=s.C.grid._pixels.slice(),affected=new Set();
    // The vacated trailing edge is available for elastic neighbour motion.
    // No live pixels are edited until the entire one-site move is valid.
    for(const i of oldPoints)grid[i]=0;
    for(const i of reserved){const id=grid[i];if(id&&!s.cells[id])return reject('wall');if(s.cells[id]?.vesselID)return reject('vascular');if(id)affected.add(id);}
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
    for(const id of changed){const c=cells.get(id);if(!c||c.points.size<c.minimum||!connected(c.points)||!fits(c,c.nx,c.ny)||![...c.points].every(neckSafe))return reject('crowded');if(s.vascular&&[...c.points].some(i=>!s.vascular.allowed(i,i,id,grid[i])))return reject('vascular');}
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
  SectionMechanics.makeSpace=makeSpace;
  globalThis.CellLabSection=SectionMechanics;
})();
