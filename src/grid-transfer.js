/* Transactional lattice coarsening. Build and validate a replacement before the
 * Worker commits it. No biological step, reseeding, cell deletion or RNG draw on
 * the source simulation. Geometry is necessarily an approximation. */
(() => {
  'use strict';
  const clone=structuredClone,scaleKeys=(o,keys,q)=>{for(const k of keys)if(Number.isFinite(o[k]))o[k]*=q;};
  function areaMap(sw,sh,dw,dh,read){
    const out=new Array(dw*dh),sx=sw/dw,sy=sh/dh;
    for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
      const values=new Map(),x0=x*sx,x1=(x+1)*sx,y0=y*sy,y1=(y+1)*sy;
      for(let yy=Math.floor(y0);yy<Math.ceil(y1)&&yy<sh;yy++)for(let xx=Math.floor(x0);xx<Math.ceil(x1)&&xx<sw;xx++){
        const weight=(Math.min(x1,xx+1)-Math.max(x0,xx))*(Math.min(y1,yy+1)-Math.max(y0,yy));if(weight<=1e-10)continue;
        const value=read(xx,yy);values.set(value,(values.get(value)||0)+weight);
      }
      out[y*dw+x]=values;
    }
    return out;
  }
  function field(source,dest){
    if(source.width===dest.width&&source.height===dest.height){dest.values.set(source.values);return;}
    const areas=areaMap(source.width,source.height,dest.width,dest.height,(x,y)=>source.values[y*source.width+x]);
    dest.values.set(areas.map(a=>{let value=0,total=0;for(const [v,w]of a){value+=v*w;total+=w;}return value/total;}));
  }
  class Heap {
    constructor(){this.a=[];this.serial=0;}
    less(a,b){return a.cost<b.cost||a.cost===b.cost&&a.order<b.order;}
    push(item){item.order=++this.serial;const a=this.a;let i=a.length;a.push(item);while(i){const p=(i-1)>>1;if(!this.less(item,a[p]))break;a[i]=a[p];i=p;}a[i]=item;}
    pop(){const a=this.a,result=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&this.less(a[c+1],a[c]))c++;if(!this.less(a[c],last))break;a[i]=a[c];i=c;}a[i]=last;}return result;}
  }
  function coarsen(source,refinement){
    if(!CellLab.isRefinement(refinement)||refinement>=source.scale)throw Error('请选择比当前更低的精细度');
    if(source.maze&&refinement<.5)throw Error('迷宫通道需要至少 0.5× 精细度');
    const width=Math.round(source.worldWidth*refinement),height=Math.round(source.worldHeight*refinement);
    if(width<32||height<24||Math.abs(width/refinement-source.worldWidth)>1e-8||Math.abs(height/refinement-source.worldHeight)>1e-8)throw Error('当前区域不能无损保持尺寸，请选择其他精细度');
    const q=refinement/source.scale,qq=q*q;
    const next=new CellLab.Simulation({scene:'empty',seed:source.seedValue,worldWidth:source.worldWidth,worldHeight:source.worldHeight,refinement,boundary:source.boundary,settings:source.settings,vessels:[],warmup:0,kernel:'reference',sectionModel:!!source.section,pixelIndex:!!source.pixelIndex});
    // Keep the exact culture identity across fractional slider steps; e.g.
    // 92 / (23/60) is 239.99999999999997 in floating-point arithmetic.
    next.worldWidth=source.worldWidth;next.worldHeight=source.worldHeight;
    for(const key of ['scene','initialWarmup','initialCells','histories','events','history','wallID','normalSupplyReference','counters','birthSerial','lineage','deathHistory','recentClearances','manualDeathRemovals','deathEffects','sources','sourceSerial','trackPatrol','ecology','scenarioState','observation','initialRefinement','refinementTransitions'])if(source[key]!==undefined)next[key]=clone(source[key]);
    next.version=source.version+1;next.C.time=source.C.time;
    // Cloning the graph together retains aliases such as a dying cell's record
    // in deathHistory. The immutable genome catalog is cloned separately below.
    const data=clone({cells:source.cells,deathHistory:source.deathHistory,recentClearances:source.recentClearances});Object.assign(next,data);
    for(const m of next.live()){
      scaleKeys(m,['base','target','planarTarget','offPlaneTarget','minVisibleArea','deathArea','deathFinalArea'],qq);
      scaleKeys(m,['x','y','nucleusX','nucleusY','nucleusRadius','maxReach','softReach','branchCore','branchReach','processLength'],q);
      for(const p of m.protrusions||[]){p.points=p.points.map(a=>a.map(v=>v*q));p.limit*=q;}
      if(m.shapeSegments)m.shapeSegments=Float32Array.from(m.shapeSegments,v=>v*q);
      if(m.patrolMotion)scaleKeys(m.patrolMotion,['x','y'],q); // dx/dy already use model units.
      Object.assign(m,{sx:0,sy:0,sinX:0,cosX:0,sinY:0,cosY:0,fieldBins:new Map()});
      if(next.section)next.section.sync(m);
    }
    for(const key of Object.keys(source.immunity))if(key!=='s'&&key!=='rng')next.immunity[key]=clone(source.immunity[key]);
    const freeze=o=>{if(!o||typeof o!=='object')return;for(const v of Object.values(o))freeze(v);Object.freeze(o);};for(const c of next.immunity.clones.values())freeze(c.genes);
    Object.assign(next.immunity.rng,clone({...source.immunity.rng}));Object.assign(next.C.mt,clone({...source.C.mt}));
    next.C.t2k=clone(source.C.t2k);next.C.cellvolume={};next.C.nr_cells=source.C.nr_cells;next.C.last_cell_id=source.C.last_cell_id;next.C.n_cell_kinds=source.C.n_cell_kinds;
    for(const id of Object.keys(next.C.t2k))if(+id)next.C.cellvolume[id]=0;
    for(const k of ['vessels','serial','version','initial','hostHealth','nextInitiation'])next.vascular[k]=clone(source.vascular[k]);
    for(const v of next.vascular.vessels){scaleKeys(v,['x','y','initialRadius','radius','wall','regionRadius'],q);scaleKeys(v,['initialMass','mass','area','repairMass','repairDeficit'],qq);}
    for(const p of [...next.sources,...next.deathEffects])scaleKeys(p,['x','y','radius'],q);
    if(source.maze){
      next.maze=clone(source.maze);scaleKeys(next.maze,['cx','cy','radius','goalRadius','wallWidth'],q);
      for(const a of next.maze.curves)if(a[0]===0)a[1]*=q;else for(let k=1;k<a.length;k++)a[k]*=q;
      next.maze.cutouts=next.maze.cutouts.map(a=>a.map(v=>v*q));
      // Maze diffusion uses a different grid spacing; allocate its native fields.
      next.fieldScale=Math.max(1,Math.round(refinement*1.25));
      const fw=Math.ceil(width/next.fieldScale),fh=Math.ceil(height/next.fieldScale),bins=fw*fh;
      for(const k of Object.keys(next.fields))next.fields[k]=new CellLab.SignalField(fw,fh,next.wrap);
      next.occupancy=[null,...[1,2,3].map(()=>new Float32Array(bins))];next.densities=[null,...[1,2,3].map(()=>new Float32Array(bins))];
      for(const key of ['densityFields','massFields'])next[key]=[null,...[1,2,3].map(()=>new CellLab.SignalField(fw,fh,next.wrap))];
      next.metabolicFields=[0,1,2].map(()=>new CellLab.SignalField(fw,fh,next.wrap));
      for(const f of [...next.metabolicFields,...next.densityFields.slice(1),...next.massFields.slice(1)])f.blocked=next.fields.oxygen.blocked;
      next.binAreas=new Float32Array(bins);for(let y=0;y<height;y++)for(let x=0;x<width;x++)next.binAreas[next.fieldIndex(x,y)]++;
      next.supplyMap=new Float32Array(bins);next.vascular.exchange=new Float32Array(bins);next.vascular.induction=new Float32Array(bins);
    }
    for(const key of Object.keys(next.fields))field(source.fields[key],next.fields[key]);
    const remapArray=(a,b)=>field({...source.fields.oxygen,values:a},{...next.fields.oxygen,values:b});remapArray(source.supplyMap,next.supplyMap);remapArray(source.vascular.induction,next.vascular.induction);
    const votes=areaMap(source.width,source.height,width,height,(x,y)=>source.C.pixt([x,y])),labels=new Int32Array(width*height).fill(-1),counts=new Map(),cores=new Map(),heap=new Heap(),visited=new Uint8Array(labels.length);
    const around=i=>{const x=i%width,y=Math.floor(i/width),a=[];for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){let xx=x+dx,yy=y+dy;if(next.wrap){xx=(xx+width)%width;yy=(yy+height)%height;}if(xx>=0&&yy>=0&&xx<width&&yy<height)a.push(yy*width+xx);}return a;};
    const fail=id=>{throw Error('粗网格无法完整容纳细胞 #'+id+'，已保留原进度；请先选择较接近当前的精细度');};
    // Preserve every wall touched by the coarse site, so downsampling cannot
    // silently open a new route through a thin physical barrier.
    for(let i=0;i<labels.length;i++)for(const [id]of votes[i])if(source.C.cellKind(id)===CellLab.WALL){labels[i]=id;break;}
    for(const m of next.live().sort((a,b)=>b.nucleusRadius-a.nucleusRadius||a.id-b.id)){
      const x=m.dying&&!m.deathIntact?m.x:m.nucleusX??m.x,y=m.dying&&!m.deathIntact?m.y:m.nucleusY??m.y,candidates=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let xx=Math.round(x)+dx,yy=Math.round(y)+dy;if(next.wrap){xx=(xx+width)%width;yy=(yy+height)%height;}if(xx<0||xx>=width||yy<0||yy>=height)continue;const i=yy*width+xx;if(votes[i].has(m.id))candidates.push({i,d:next.section?next.section.delta(xx-x,width)**2+next.section.delta(yy-y,height)**2:(xx-x)**2+(yy-y)**2});}
      candidates.sort((a,b)=>a.d-b.d||a.i-b.i);let core=null;
      for(const c of candidates){const pixels=[];for(const [dx,dy]of (!m.dying||m.deathIntact)&&m.hasNucleus&&next.section?next.section.disk(m.nucleusRadius):[[0,0]]){let xx=c.i%width+dx,yy=Math.floor(c.i/width)+dy;if(next.wrap){xx=(xx+width)%width;yy=(yy+height)%height;}const i=yy*width+xx;if(xx<0||xx>=width||yy<0||yy>=height||labels[i]!==-1||!votes[i].has(m.id)){pixels.length=0;break;}pixels.push(i);}if(pixels.length){core=pixels;m.nucleusX=c.i%width;m.nucleusY=Math.floor(c.i/width);break;}}
      if(!core)fail(m.id);cores.set(m.id,core);counts.set(m.id,core.length);for(const i of core)labels[i]=m.id;
    }
    const minimum=m=>m.dying&&!m.deathIntact?1:Math.ceil(m.minVisibleArea??1);
    const enqueue=(i,id,cost)=>{for(const j of around(i))if(labels[j]===-1&&votes[j].has(id))heap.push({i:j,id,cost:cost+1-(votes[j].get(id)||0)*qq+.001});};
    // First give each connected nucleus the minimum legal visible body. A
    // second flood assigns remaining overlap sites without creating islands.
    for(const [id,core]of cores)for(const i of core)enqueue(i,id,0);
    const deferred=[];
    while(heap.a.length){const e=heap.pop();if(labels[e.i]!==-1)continue;if(counts.get(e.id)>=minimum(next.cells[e.id])){deferred.push(e);continue;}labels[e.i]=e.id;counts.set(e.id,counts.get(e.id)+1);enqueue(e.i,e.id,e.cost);}
    for(const m of next.live())if(counts.get(m.id)<minimum(m))fail(m.id);
    for(const e of deferred)heap.push(e);
    // Medium seeds retain clear lumen/extracellular interiors.
    for(let i=0;i<labels.length;i++)if(labels[i]===-1&&votes[i].has(0)&&votes[i].get(0)>=Math.max(...votes[i].values()))labels[i]=0;
    while(heap.a.length){const e=heap.pop();if(labels[e.i]!==-1)continue;labels[e.i]=e.id;counts.set(e.id,counts.get(e.id)+1);enqueue(e.i,e.id,e.cost);}
    // Unreachable sub-pixel protrusions become medium; every cell and its
    // nucleus remain represented. Target biomass was preserved above.
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=y*width+x,id=Math.max(0,labels[p]),i=next.C.grid.p2i([x,y]);if(id)next.C.setpixi(i,id);
      let activity=0,weight=0,seen=false;const sx=source.width/width,sy=source.height/height;
      for(let yy=Math.floor(y*sy);yy<Math.ceil((y+1)*sy)&&yy<source.height;yy++)for(let xx=Math.floor(x*sx);xx<Math.ceil((x+1)*sx)&&xx<source.width;xx++){const old=source.C.grid.p2i([xx,yy]);seen||=!!source.patrol.visited[old];if(id&&source.C.pixti(old)===id){activity+=source.act.pxact(old);weight++;}}
      next.act.setActivity(i,weight?Math.round(activity/weight):0);visited[p]=seen?1:0;next.patrol.visited[i]=visited[p];
    }
    next.patrol.checked=clone(source.patrol.checked);next.patrol.contacts=clone(source.patrol.contacts);next.patrol.needsSeed=source.patrol.needsSeed;
    if(next.section)next.section.junctions=clone(source.section.junctions);
    next.C.stat_values={};next.refreshPositions();next.scanContacts();next.rebuildMask();next.vascular.rebuildRegion();next.prepareEnvironment();
    // Retain measured concentrations exactly where no wall changed their mask.
    for(const m of next.live()){next.updateMechanics(m);if((!m.dying||m.deathIntact)&&(next.components(m.id).length!==1||next.section&&!next.section.fits(m,m.nucleusX,m.nucleusY)))fail(m.id);}
    if(next.live().length!==source.live().length)throw Error('格点转换未通过细胞完整性检查，原进度保留');
    next.initialRefinement=source.initialRefinement??source.scale;next.refinementTransitions=[...(source.refinementTransitions||[]),{time:source.C.time,from:source.scale,to:refinement}];
    if(source.kernel!=='reference'&&globalThis.CellLabFast)CellLabFast.install(next);
    return next;
  }
  globalThis.CellLabGridTransfer={coarsen};
})();
