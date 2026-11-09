/* Artistoo extensions. Biology, signal transport, and pacing are independent of rendering. */
(() => {
  'use strict';
  const NORMAL=1, TUMOR=2, IMMUNE=3, WALL=4, FIELD_SCALE=4;
  const DEATH_COUNTERS={spontaneous:['apoptosisStarted','apoptosis'],kill:['killStarted','kills'],environment:['environmentStarted','environment']};
  const DEFAULTS={normalMotility:.08,tumorMotility:.7,immuneMotility:1,chemotaxis:1.6,alignment:.8,cohesion:1,repulsion:.7,immuneSeparation:1,noise:.6,halfLife:140,growth:.8,apoptosis:8,antigen:65,kill:1,temperature:12,supply:1.8,metabolism:1,escape:2,recruitment:1,immuneGrowth:.35,immuneDivisions:3,mutation:6,mutationSize:.16,sectionYield:.35,stressMutation:1,inflammation:0,progression:1,tumorMorphology:0,branchLength:2.8,branchStrength:5,networkAdhesion:1,branching:1};
  const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
  // Exploratory defaults, deliberately narrower than the manual slider limits.
  // A separate seeded generator makes configuration reproducible without
  // consuming the CPM stream. These are model ranges, not biological calibration.
  const RANDOM_RANGES={normalMotility:[.05,.25,.05],tumorMotility:[.35,1.2,.05],immuneMotility:[.75,1.4,.05],chemotaxis:[.7,2.2,.1],alignment:[.1,1,.1],cohesion:[.6,1.6,.1],repulsion:[.4,1.2,.1],immuneSeparation:[.7,1.7,.1],noise:[.35,1,.05],halfLife:[80,220,10],growth:[.5,1.4,.05],apoptosis:[0,8,1],antigen:[30,95,5],kill:[.6,1.8,.1],temperature:[8,18,1],supply:[1.6,2.8,.05],metabolism:[.6,1.1,.05],escape:[1.5,3.5,.1],recruitment:[.6,2,.1],immuneGrowth:[.15,.65,.05],immuneDivisions:[2,4,1],mutation:[2,15,1],mutationSize:[.05,.2,.01],sectionYield:[.25,.4,.01],stressMutation:[.2,2,.1],inflammation:[0,1.5,.1],progression:[.5,3,.1],tumorMorphology:[0,2,1],branchLength:[2,3.2,.1],branchStrength:[3,7,.5],networkAdhesion:[.4,1.4,.1],branching:[.5,1.5,.1]};
  function randomSettings(seed){
    let state=seed>>>0;
    const random=()=>{state=(state+0x6d2b79f5)>>>0;let n=Math.imul(state^(state>>>15),1|state);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};
    return Object.fromEntries(Object.entries(RANDOM_RANGES).map(([key,[lo,hi,step]])=>[key,Number((lo+Math.floor(random()*(Math.round((hi-lo)/step)+1))*step).toFixed(2))]));
  }
  const POPULATIONS=['normal','abnormal','tumor','immune'];
  const sameHistoryRow=(a,b)=>!!a&&Object.keys(b).every(key=>a[key]===b[key]);
  // Only the display is reduced. Keep each population's minimum and maximum
  // in each time bin, plus both endpoints, in their original temporal order.
  function sampleHistory(rows,bins=256){
    if(rows.length<=bins*8+2)return rows.slice();
    const first=rows[0].time,span=Math.max(1,rows.at(-1).time-first),extrema=new Int32Array(bins*8).fill(-1);
    for(let i=0;i<rows.length;i++){
      const offset=Math.min(bins-1,Math.floor((rows[i].time-first)/span*bins))*8;
      for(let k=0;k<4;k++){const key=POPULATIONS[k],lo=offset+2*k,hi=lo+1;
        if(extrema[lo]<0||rows[i][key]<rows[extrema[lo]][key])extrema[lo]=i;
        if(extrema[hi]<0||rows[i][key]>rows[extrema[hi]][key])extrema[hi]=i;
      }
    }
    const indices=new Set([0,rows.length-1]);for(const i of extrema)if(i>=0)indices.add(i);
    return [...indices].sort((a,b)=>a-b).map(i=>rows[i]);
  }
  const SIGNALS=['cohesion','danger','trail'];
  const PRESETS={
    oncogenesis:{label:'肿瘤发生发展',environmentProfile:'poor-core',founderTolerance:2.4,description:'正常细胞铺满培养皿，4 颗免疫细胞分散在单层内部。中心酸清除弱、氧糖补给略低；局部代谢压力经异常中间态推动随机癌变，免疫细胞进行接触监视。',settings:{supply:2.8,metabolism:1.2,inflammation:1,stressMutation:8,progression:8,growth:1.2,apoptosis:2,tumorMotility:1.5,normalMotility:.05,cohesion:1.3,escape:4,immuneGrowth:.15,immuneDivisions:2,kill:1.2}},
    cold:{label:'免疫冷肿瘤扩散转移',description:'中心 19 颗低抗原肿瘤，外围仅 3 颗免疫细胞，肿瘤保留快速生长与迁移。观察原灶外播散及远端增殖；这是二维扩散代理，不含血管运输或跨器官转移。',settings:{supply:2.4,metabolism:.8,stressMutation:0,progression:1,growth:1.4,apoptosis:2,tumorMotility:1.15,immuneMotility:.8,antigen:15,kill:1,chemotaxis:.6,recruitment:.35,immuneGrowth:.15,immuneDivisions:2,alignment:.2,noise:.85,mutation:8}},
    hot:{label:'免疫热肿瘤治愈',description:'中心 37 颗肿瘤形成局部密集病灶，周边 18 颗免疫细胞，抗原暴露充分。依靠真实接触识别、局部招募及有限克隆扩增，尝试清除当前区域肿瘤。',settings:{supply:2.8,metabolism:.65,stressMutation:0,progression:1,growth:.75,apoptosis:0,tumorMotility:.35,immuneMotility:1.2,antigen:100,kill:2,chemotaxis:2.5,recruitment:2.4,immuneGrowth:.65,immuneDivisions:3,noise:.45,halfLife:180,mutation:2,mutationSize:.05}},
    ecosystem:{label:'免疫共培养',settings:{}},
    network:{label:'胶质瘤样分枝成网',settings:{tumorMorphology:2,tumorMotility:.12,branchLength:2.8,branchStrength:5,networkAdhesion:1,growth:.18,apoptosis:0,metabolism:.65,supply:2.6,stressMutation:0,alignment:.15,noise:.35}},
    collective:{label:'群体迁移',settings:{normalMotility:.85,alignment:2,cohesion:1.2,repulsion:.4,noise:.35,growth:0,apoptosis:0}},
    invasion:{label:'肿瘤扩张',settings:{growth:.7,tumorMotility:1,apoptosis:10}},
    maze:{label:'免疫细胞迷宫',description:'圆心持续释放最强招募信号，入口清除信号；开局已建立沿通道扩散的浓度场。6 颗免疫细胞从等距入口出发，仅凭局部梯度与随机探索前进，胞核进入中心终点区计时。',settings:{chemotaxis:3,halfLife:400,immuneMotility:1.4,noise:.5,immuneSeparation:.8,growth:0,immuneGrowth:0,apoptosis:0,metabolism:.3,supply:3,stressMutation:0,inflammation:0,escape:1}},
    stress:{label:'密度与逃逸',settings:{supply:.8,metabolism:1.15,growth:.6,tumorMotility:.9,apoptosis:0,escape:3}},
    surveillance:{label:'异常监视',settings:{supply:.8,metabolism:1.2,stressMutation:3,progression:.7,kill:2,apoptosis:0}}
  };
  const TYPE_NAMES=['培养液','正常细胞','肿瘤细胞','免疫细胞','实体障碍'];
  const BODY_COLORS=[[239,242,237],[174,184,181],[48,56,65],[190,65,78],[93,108,111]];
  const ringOffsets=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];
  // Fast local connectivity proof. Ambiguous masks receive an exact, early-exit
  // flood fill: a ring can open if its two arms are still connected elsewhere.
  const connected=new Uint8Array(256);
  const connected4=new Uint8Array(256);
  for(let mask=1;mask<256;mask++){
    let reached=0,front=mask&-mask;
    while(front){reached|=front;let next=0;for(let a=0;a<8;a++)if(front&(1<<a))for(let b=0;b<8;b++)if(mask&(1<<b)){
      if(Math.abs(ringOffsets[a][0]-ringOffsets[b][0])<=1&&Math.abs(ringOffsets[a][1]-ringOffsets[b][1])<=1)next|=1<<b;
    }front=next&~reached;}
    connected[mask]=reached===mask?1:0;
    reached=0;front=mask&-mask;while(front){reached|=front;let next=0;for(let a=0;a<8;a++)if(front&(1<<a))for(let b=0;b<8;b++)if(mask&(1<<b))if(Math.abs(ringOffsets[a][0]-ringOffsets[b][0])+Math.abs(ringOffsets[a][1]-ringOffsets[b][1])===1)next|=1<<b;front=next&~reached;}connected4[mask]=reached===mask?1:0;
  }
  class SignalField {
    constructor(width,height,wrap=false){this.width=width;this.height=height;this.wrap=wrap;this.values=new Float32Array(width*height);this.next=new Float32Array(width*height);this.blocked=new Uint8Array(width*height);}
    index(x,y){if(this.wrap){x=(x+this.width)%this.width;y=(y+this.height)%this.height;}else if(x<0||y<0||x>=this.width||y>=this.height)return -1;return y*this.width+x;}
    step(diffusion,decay){
      if(diffusion<0||diffusion>.25)throw Error('Explicit diffusion requires 0 <= D*dt <= 0.25');
      const a=this.values,b=this.next,w=this.width,h=this.height,keep=Math.exp(-decay);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x;if(this.blocked[i]){b[i]=0;continue;}
        const c=a[i];let sum=0;
        const left=x?i-1:(this.wrap?i+w-1:-1),right=x<w-1?i+1:(this.wrap?i-w+1:-1),up=y?i-w:(this.wrap?i+(h-1)*w:-1),down=y<h-1?i+w:(this.wrap?x:-1);
        if(left>=0&&!this.blocked[left])sum+=a[left]-c;if(right>=0&&!this.blocked[right])sum+=a[right]-c;
        if(up>=0&&!this.blocked[up])sum+=a[up]-c;if(down>=0&&!this.blocked[down])sum+=a[down]-c;
        b[i]=Math.max(0,(c+diffusion*sum)*keep);
      }
      this.values=b;this.next=a;
    }
    deposit(x,y,amount){const i=this.index(Math.floor(x),Math.floor(y));if(i>=0&&!this.blocked[i])this.values[i]=Math.min(30,this.values[i]+amount);}
    gradient(x,y){
      x=Math.floor(x);y=Math.floor(y);const i=this.index(x,y);if(i<0||this.blocked[i])return [0,0];
      const sample=(xx,yy)=>{const j=this.index(xx,yy);return j<0||this.blocked[j]?this.values[i]:this.values[j];};
      return [(sample(x+1,y)-sample(x-1,y))*.5,(sample(x,y+1)-sample(x,y-1))*.5];
    }
  }
  class StepClock {
    constructor(rate){this.rate=rate;this.debt=0;}
    add(milliseconds){this.debt+=Math.max(0,milliseconds)*this.rate/1000;const n=Math.floor(this.debt+1e-9);this.debt-=n;return n;}
    reset(){this.debt=0;}
  }
  class LocalTopology extends CPM.HardConstraint {
    constructor(sim){super({});this.sim=sim;this.stamp=0;this.visited=new Uint32Array(sim.C.grid._pixels.length);this.queue=new Uint32Array(this.visited.length);this.goals=new Uint32Array(this.visited.length);}
    fulfilled(src,tgt,source,target){
      const cell=this.sim.cells[target];if(!target||!cell||(cell.dying&&!cell.deathIntact))return true;
      const neighbors=this.sim.rings[tgt],grid=this.C.grid._pixels;let mask=0;
      for(let k=0;k<8;k++)if(neighbors[k]>=0&&grid[neighbors[k]]===target)mask|=1<<k;
      if((this.sim.section?connected4:connected)[mask])return true;
      if(!mask)return false;
      if(++this.stamp===4294967295){this.visited.fill(0);this.goals.fill(0);this.stamp=1;}
      const stamp=this.stamp,visited=this.visited,queue=this.queue;
      let head=0,tail=0,needed=0;
      for(let k=0;k<8;k++)if(mask&(1<<k)){needed++;this.goals[neighbors[k]]=stamp;}
      const seed=neighbors[Math.log2(mask&-mask)];queue[tail++]=seed;visited[seed]=stamp;
      while(head<tail){const i=queue[head++];
        if(this.goals[i]===stamp)needed--;
        if(!needed)return true;
        for(const n of (this.sim.section?this.sim.faces[i]:this.sim.neighbors[i]))if(n!==tgt&&grid[n]===target&&visited[n]!==stamp){visited[n]=stamp;queue[tail++]=n;}
      }
      return false;
    }
  }
  class CellVolume extends CPM.SoftConstraint {
    constructor(sim){super({});this.sim=sim;}
    deltaH(src,tgt,a,b){
      let energy=0;const ca=this.sim.cells[a],cb=this.sim.cells[b];
      if(ca)energy+=ca.lambdaV*(2*(this.C.getVolume(a)-(ca.planarTarget??ca.target))+1);
      if(cb)energy+=cb.lambdaV*(-2*(this.C.getVolume(b)-(cb.planarTarget??cb.target))+1);
      return energy;
    }
  }
  class LocalDirection extends CPM.SoftConstraint {
    constructor(sim){super({});this.sim=sim;}
    deltaH(src,tgt,id,oldID){
      const m=this.sim.cells[id],rear=this.sim.cells[oldID];
      let dx=this.sim.xs[tgt]-this.sim.xs[src],dy=this.sim.ys[tgt]-this.sim.ys[src];
      if(this.sim.wrap){if(dx>1)dx-=this.sim.width;else if(dx< -1)dx+=this.sim.width;if(dy>1)dy-=this.sim.height;else if(dy< -1)dy+=this.sim.height;}
      let energy=m&&!m.dying?-m.drive*(dx*m.px+dy*m.py):0;
      // The same local polarity that extends an immune front contracts its rear.
      // Without this term a passive epithelial neighbour cannot refill the tail,
      // pinning a healthy patrol in confluent tissue. Hard geometry still decides
      // whether the copy is possible; drive already includes fitness/synapse gates.
      if(rear?.kind===IMMUNE&&!rear.dying)energy-=rear.drive*(dx*rear.px+dy*rear.py);
      return energy;
    }
  }
  class Simulation {
    constructor({width,height,worldWidth=240,worldHeight=180,refinement,scene='ecosystem',seed=17,boundary='solid',settings={},sources,mazeSignalThroughWalls=false,warmup=35,kernel='fast',sectionModel=true}={}){
      this.scale=refinement??(width===undefined?1.5:1);
      if(![1,1.5,2,3,4].includes(this.scale))throw Error('Unsupported lattice refinement');
      width=width??Math.round(worldWidth*this.scale);height=height??Math.round(worldHeight*this.scale);
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<24||width>1024||height>768)throw Error('计算格点需在 32×24 至 1024×768 内，请降低区域或精细度');
      this.worldWidth=width/this.scale;this.worldHeight=height/this.scale;this.fieldScale=scene==='maze'?Math.max(1,Math.round(this.scale*1.25)):FIELD_SCALE*this.scale;
      this.width=width;this.height=height;this.scene=scene;this.seedValue=seed;this.wrap=boundary==='wrap';this.boundary=boundary;
      this.settings={...DEFAULTS,...(scene==='random'?randomSettings(seed):PRESETS[scene]?.settings||{}),...settings};
      // Legacy saved configurations may contain a population budget. It has
      // no biological meaning and must not influence this run or its report.
      delete this.settings.capacity;
      this.cells=[];this.contacts=new Map();this.histories=new Map();this.events=[];this.history=[];this.wallID=0;this.version=0;
      this.counters={manualRemoved:0,divisions:0,immuneDivisions:0,kills:0,apoptosis:0,environment:0,apoptosisStarted:0,killStarted:0,environmentStarted:0,recognitions:0,mutations:0,abnormalInitiations:0,malignantTransitions:0,abnormalKills:0,normalEnvironmentDeaths:0,abnormalEnvironmentDeaths:0};this.birthSerial=0;this.lineage=[];this.deathHistory=[];this.recentClearances=[];this.manualDeathRemovals={spontaneous:0,kill:0,environment:0};
      this.deathEffects=[];this.sources=[];this.sourceSerial=0;
      const s=this.settings;
      this.C=new CPM.CPM([width,height],{
        seed,torus:[this.wrap,this.wrap],T:s.temperature,
        // Neutral immune/immune interface: J_II = 2 J_I,medium. Chemotaxis,
        // rather than constitutive homotypic adhesion, can gather patrol cells.
        J:[[0,22,19,17,0],[22,7,18,12,28],[19,18,9,10,26],[17,12,10,34,26],[0,28,26,26,0]],
        LAMBDA_P:[0,.25,.32,.18,0],P:[0,155,205,135,0],
        LAMBDA_ACT:[0,50,180,240,0],MAX_ACT:[0,12,25,35,0],ACT_MEAN:'geometric',
        IS_BARRIER:[false,false,false,false,true]
      });
      this.C.conf.J[1][1]=Math.max(2,12-s.cohesion*5);
      const C=this.C,size=C.grid._pixels.length;
      this.xs=new Int16Array(size);this.ys=new Int16Array(size);this.rings=new Array(size);this.neighbors=new Array(size);this.faces=new Array(size);this.connected4=connected4;
      const neighbors=C.grid.neighi.bind(C.grid);
      this.positions=new Uint32Array(width*height);
      this.sinX=Float64Array.from({length:width},(_,x)=>Math.sin(x/width*2*Math.PI));this.cosX=Float64Array.from({length:width},(_,x)=>Math.cos(x/width*2*Math.PI));
      this.sinY=Float64Array.from({length:height},(_,y)=>Math.sin(y/height*2*Math.PI));this.cosY=Float64Array.from({length:height},(_,y)=>Math.cos(y/height*2*Math.PI));
      for(let x=0;x<width;x++)for(let y=0;y<height;y++){
        const i=C.grid.p2i([x,y]);this.xs[i]=x;this.ys[i]=y;this.positions[y*width+x]=i;this.neighbors[i]=neighbors(i);
        this.rings[i]=Int32Array.from(ringOffsets,([dx,dy])=>{let xx=x+dx,yy=y+dy;if(this.wrap){xx=(xx+width)%width;yy=(yy+height)%height;}return xx<0||yy<0||xx>=width||yy>=height?-1:C.grid.p2i([xx,yy]);});
        this.faces[i]=[1,3,5,7].map(k=>this.rings[i][k]).filter(j=>j>=0);
      }
      // All enabled Artistoo constraints read, never mutate, neighbour arrays.
      C.grid.neighi=i=>this.neighbors[i];
      this.section=sectionModel&&globalThis.CellLabSection?new globalThis.CellLabSection(this):null;
      if(this.section){const hard=new CPM.HardConstraint({});hard.fulfilled=(...args)=>this.section.allowed(...args);C.add(hard);const shape=new CPM.SoftConstraint({});shape.deltaH=(...args)=>this.section.energy(...args);C.add(shape);}
      this.topology=new LocalTopology(this);C.add(new CellVolume(this));C.add(this.topology);C.add(new LocalDirection(this));
      const make=C.makeNewCellID.bind(C);C.makeNewCellID=kind=>{const id=make(kind);if(kind!==WALL)this.register(id,kind);return id;};
      C.post_setpix_listeners.push((i,old,id)=>{if(this.cells[old])this.moment(this.cells[old],i,-1);if(this.cells[id])this.moment(this.cells[id],i,1);});
      this.act=C.getConstraint('ActivityConstraint');
      this.act.cellParameter=(parameter,id)=>parameter==='LAMBDA_ACT'?(this.cells[id]?.activity||0):C.conf[parameter][C.cellKind(id)];
      const p=C.getConstraint('PerimeterConstraint');p.cellParameter=(parameter,id)=>parameter==='P'?(this.cells[id]?.perimeter||0):parameter==='LAMBDA_P'?(this.cells[id]?.lambdaP||0):C.conf[parameter][C.cellKind(id)];
      const adhesion=C.getConstraint('Adhesion');adhesion.J=(a,b)=>{
        const ca=this.cells[a],cb=this.cells[b];if(a&&b&&(ca?.targetID===b||cb?.targetID===a))return 2;
        if(ca&&cb&&ca.kind!==cb.kind){if(ca.kind===IMMUNE||cb.kind===IMMUNE)return 9;
          const tumor=ca.kind===TUMOR?ca:cb.kind===TUMOR?cb:null;if(tumor)return Math.max(9,19-3*tumor.genome.invasion);}
        const j=C.conf.J[C.cellKind(a)][C.cellKind(b)];
        // Weak basal sticking keeps a process network from collapsing into a
        // compact aggregate. Extra adhesion belongs to actual mature contacts.
        return this.settings.tumorMorphology===2&&ca?.kind===2&&cb?.kind===2?Math.max(j,30)-(this.section?.bond(a,b)||0):j;
      };
      this.kernel='reference';
      this.act.setActivity=(i,a)=>{if(a)this.act.cellpixelsact[i]=a;else delete this.act.cellpixelsact[i];};
      if(kernel!=='reference'&&globalThis.CellLabFast)globalThis.CellLabFast.install(this);
      this.gm=new CPM.GridManipulator(C);
      this.fields={};for(const key of [...SIGNALS,'oxygen','glucose','acid','density'])this.fields[key]=new SignalField(Math.ceil(width/this.fieldScale),Math.ceil(height/this.fieldScale),this.wrap);
      this.fields.oxygen.values.fill(1);this.fields.glucose.values.fill(1);
      const bins=this.fields.oxygen.values.length;
      // Fixed reservoir geometry, independent of time, cell identity and goals.
      // Core acid clearance is limited more strongly than nutrient supply, so
      // chronic injury can coexist with a viable, better supplied frontier.
      this.supplyMap=new Float32Array(bins).fill(1);
      if(PRESETS[scene]?.environmentProfile==='poor-core')for(let i=0;i<bins;i++){
        const x=(i%this.fields.oxygen.width+.5)*this.fieldScale/this.scale,y=(Math.floor(i/this.fields.oxygen.width)+.5)*this.fieldScale/this.scale;
        const radius=Math.hypot((x-this.worldWidth/2)/(this.worldWidth*.22),(y-this.worldHeight/2)/(this.worldHeight*.25));
        this.supplyMap[i]=.05+.95*clamp((radius-.55)/.65);
      }
      this.occupancy=[null,new Float32Array(bins),new Float32Array(bins),new Float32Array(bins)];
      this.densities=[null,new Float32Array(bins),new Float32Array(bins),new Float32Array(bins)];
      this.densityFields=[null,...[1,2,3].map(()=>new SignalField(this.fields.oxygen.width,this.fields.oxygen.height,this.wrap))];
      this.massFields=[null,...[1,2,3].map(()=>new SignalField(this.fields.oxygen.width,this.fields.oxygen.height,this.wrap))];
      for(const f of this.densityFields.slice(1))f.blocked=this.fields.oxygen.blocked;
      for(const f of this.massFields.slice(1))f.blocked=this.fields.oxygen.blocked;
      this.binAreas=new Float32Array(bins);for(let y=0;y<height;y++)for(let x=0;x<width;x++)this.binAreas[this.fieldIndex(x,y)]++;
      if(scene!=='empty')this.populate();
      if(sources){this.sources=[];for(const source of sources)this.addSource(source.x*this.scale,source.y*this.scale,source.type,source.radius*this.scale);}
      if(this.maze){this.maze.signalThroughWalls=!!mazeSignalThroughWalls;if(mazeSignalThroughWalls)this.fields.trail.blocked.fill(0);this.equilibrateMaze();}
      this.record(); // The initial population belongs at model time zero.
      this.refreshPositions();for(let i=0;i<(this.maze?0:warmup);i++){if(C.borderpixels.length)C.timeStep();if(this.section){this.refreshPositions();this.scanContacts();this.section.update(1);}}
      this.cleanup();this.refreshPositions();this.updateEnvironment(0);this.updateMetabolism(0);this.updateLocal(0);this.initializeScenario();this.record();
    }
    live(){return this.cells.filter(Boolean);}
    register(id,kind){
      const theta=this.C.random()*2*Math.PI,roll=this.C.random();
      const base=[0,240,330,72][kind]*this.scale*this.scale;
      const genome=kind===TUMOR?{tolerance:(.85+.3*this.C.random())*(PRESETS[this.scene]?.founderTolerance||1),proliferation:.85+.3*this.C.random(),invasion:.85+.3*this.C.random(),antigen:roll<this.settings.antigen/100?.45+.55*this.C.random():.04+.07*this.C.random()}:null;
      const m={id,kind,name:TYPE_NAMES[kind],base,target:kind===TUMOR?base*.55:base,lambdaV:0,lambdaP:0,perimeter:0,activity:0,drive:0,px:Math.cos(theta),py:Math.sin(theta),x:0,y:0,sx:0,sy:0,sinX:0,cosX:0,sinY:0,cosY:0,age:0,antigenRoll:roll,antigen:false,antigenLevel:0,damage:0,dying:false,deathCause:'',targetID:0,phase:'search',genome,clone:id,generation:0,birth:++this.birthSerial,parentBirth:0,divisionsLeft:kind===IMMUNE?this.settings.immuneDivisions:null,activation:0,recruitment:0,stress:0,adversity:0,fitness:1,oxygen:1,glucose:1,acid:0,confinement:0};
      m.state=kind===NORMAL?'normal':kind===TUMOR?'tumor':'immune';m.origin=m.state;m.abnormalAge=0;m.abnormalSince=null;m.transformedAt=null;m.immuneCue=0;m.inflammatorySignal=0;m.inflammatoryExposure=0;
      m.nucleusStrainX=0;m.nucleusStrainY=0;m.fieldBins=new Map();m.sectionFraction=1;m.sectionPressure=0;m.hasNucleus=false;if(genome)this.applyGenome(m);
      this.cells[id]=m;this.contacts.set(id,new Map());this.updateMechanics(m);return m;
    }
    applyGenome(m){m.antigenLevel=m.genome.antigen;m.antigen=m.antigenLevel>=.18;}
    immuneTarget(m){return !!m&&!m.dying&&(m.kind===TUMOR||(m.kind===NORMAL&&m.state==='abnormal'))&&m.antigen;}
    beginAbnormal(id){
      const m=this.cells[id];if(!m||m.dying||m.kind!==NORMAL||m.state!=='normal')return false;
      // A first stochastic alteration exposes a weak antigen, but retains normal
      // mechanics and metabolism. It does not grant a proliferative phenotype.
      m.state='abnormal';m.name='异常中间态';m.abnormalSince=this.C.time;m.abnormalAge=0;
      m.antigenLevel=.2+.35*this.C.random();m.antigen=m.antigenLevel>=.18;
      this.counters.abnormalInitiations++;this.log('abnormal',id,0,{antigen:m.antigenLevel,stress:m.stress,adversity:m.adversity,inflammatoryExposure:m.inflammatoryExposure,inflammation:this.settings.inflammation});return true;
    }
    becomeTumor(id){
      const m=this.cells[id];if(!m||m.dying||m.kind!==NORMAL||m.state!=='abnormal')return false;
      // Relabel the same occupied body. Preserve target mass, damage, contacts,
      // lineage and the already occupied nuclear disk; never reseed or teleport.
      for(const [bin,pixels] of m.fieldBins){this.occupancy[NORMAL][bin]-=pixels;this.occupancy[TUMOR][bin]+=pixels;}
      this.C.setCellKind(id,TUMOR);m.kind=TUMOR;m.state='tumor';m.name=TYPE_NAMES[TUMOR];m.base=330*this.scale*this.scale;m.age=0;m.transformedAt=this.C.time;
      m.genome={tolerance:(.85+.3*this.C.random())*(PRESETS[this.scene]?.founderTolerance||1),proliferation:.85+.3*this.C.random(),invasion:.85+.3*this.C.random(),antigen:m.antigenLevel};
      this.applyGenome(m);this.updateMechanics(m);this.C.stat_values={};
      this.counters.malignantTransitions++;this.log('malignant',id,0,{clone:m.clone,genome:{...m.genome}});return true;
    }
    transformation(m,dt){
      if(m.kind!==NORMAL||m.dying||dt<=0)return;
      // Existing damage/recruitment fields are an explicit inflammatory proxy,
      // not molecular IL-6. Sample only this body's occupied, unblocked bins.
      let signal=0,area=0;
      for(const [i,pixels] of m.fieldBins)if(!this.fields.danger.blocked[i]){signal+=pixels*(this.fields.danger.values[i]+this.fields.trail.values[i])*.5;area+=pixels;}
      const concentration=area?signal/area:0;m.inflammatorySignal=concentration/(.35+concentration);
      m.inflammatoryExposure=clamp(m.inflammatorySignal+(m.inflammatoryExposure-m.inflammatorySignal)*Math.exp(-dt/240));
      if(m.state==='normal'){
        // Two independent, switchable initiation routes. Neither a short pulse
        // nor inflammation skips the existing antigen-positive intermediate.
        const environmental=.002*this.settings.stressMutation*m.adversity**2*clamp((m.stress-.06)/.24);
        const inflammatory=.0004*this.settings.inflammation*clamp((m.inflammatoryExposure-.2)/.8)**2;
        const hazard=environmental+inflammatory;
        if(hazard>0&&this.C.random()<-Math.expm1(-hazard*dt))this.beginAbnormal(m.id);
      }else{
        const eligible=Math.max(0,m.abnormalAge+dt-160)-Math.max(0,m.abnormalAge-160);m.abnormalAge+=dt;
        const hazard=.0006*this.settings.progression*(.2+.8*m.adversity);
        if(eligible>0&&hazard>0&&this.C.random()<-Math.expm1(-hazard*eligible))this.becomeTumor(m.id);
      }
    }
    updateMechanics(m){
      if(this.section)this.section.sync(m);
      const invasion=m.genome?.invasion||1;
      const speed=this.settings[['','normalMotility','tumorMotility','immuneMotility'][m.kind]]*(m.kind===TUMOR?invasion:1)*(m.kind===IMMUNE?Math.max(.04,m.fitness):Math.max(.12,m.fitness));
      m.activity=m.dying?0:[0,50,180,240][m.kind]*speed*(m.targetID?.08:1);
      m.drive=m.dying?0:[0,7,17,25][m.kind]*speed*(m.targetID?.08:1);
      m.lambdaV=(m.kind===IMMUNE?1.3/(1+m.confinement):m.kind===TUMOR?2.5/(.7+.3*invasion):2.7)/(this.scale*this.scale);
      m.lambdaP=m.dying?0:[0,.25,.32,.18][m.kind]/(this.scale*(m.kind===TUMOR?Math.sqrt(invasion):m.kind===IMMUNE?1+m.confinement*.8:1));
      m.perimeter=[0,155,205,135][m.kind]*this.scale*Math.sqrt(Math.max(1,m.target)/m.base);
      if(this.section){
        m.lambdaV=[0,4,4,4.5][m.kind]/(this.scale*this.scale);
        m.lambdaP=m.dying?0:[0,.35,.42,.65][m.kind]/this.scale;
        m.perimeter=[0,155,195,90][m.kind]*this.scale*Math.sqrt(Math.max(1,m.planarTarget)/m.base);
        if(m.morphologyMode){m.lambdaP=.18/this.scale;m.perimeter+=2.8*(m.processLength||0);const hold=1/(1+.45*m.networkDegree);m.activity*=.25*hold;m.drive*=.4*hold;}
        if(m.kind===IMMUNE){
          m.activity*=125/240;m.drive*=35/25;
          // Relax only the soft cortical perimeter cost under mechanical contact.
          // Nuclear exclusion, finite neck width, reach and connectivity remain
          // hard constraints; sparse cells retain the original surface tension.
          m.lambdaP/=1+2*m.confinement;
        }
      }
      if(m.deathIntact){
        // Surface tension rounds the real lattice body. Swelling still pays
        // volume/adhesion energy and cannot take a live neighbour's nucleus.
        m.lambdaP=.45/this.scale;m.perimeter=10.8*Math.sqrt(Math.max(1,m.planarTarget??m.target));
        m.softReach=.55*Math.sqrt(Math.max(1,m.planarTarget??m.target)/Math.PI);
      }
    }
    moment(m,i,sign){
      const x=this.xs[i],y=this.ys[i];m.sx+=sign*x;m.sy+=sign*y;
      if(this.wrap){m.sinX+=sign*this.sinX[x];m.cosX+=sign*this.cosX[x];m.sinY+=sign*this.sinY[y];m.cosY+=sign*this.cosY[y];}
      if(this.occupancy){const bin=this.fieldIndex(x,y);this.occupancy[m.kind][bin]+=sign;const n=(m.fieldBins.get(bin)||0)+sign;if(n)m.fieldBins.set(bin,n);else m.fieldBins.delete(bin);}
    }
    refreshPositions(){for(const m of this.live()){
      const v=this.C.getVolume(m.id);if(!v)continue;
      m.x=this.wrap?((Math.atan2(m.sinX,m.cosX)/(2*Math.PI)+1)%1)*this.width:m.sx/v;
      m.y=this.wrap?((Math.atan2(m.sinY,m.cosY)/(2*Math.PI)+1)%1)*this.height:m.sy/v;
    }}
    seed(kind,x,y,radius=4){
      const population=this.live().length;
      this.lastSeedResult={id:0,reason:'',population};
      const reject=reason=>{this.lastSeedResult.reason=reason;return 0;};
      if(![1,2,3].includes(kind)||![x,y,radius].every(Number.isFinite)||radius<=0)return reject('invalid');
      x=Math.round(x);y=Math.round(y);radius=Math.round(radius);const points=[];
      for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++)if(dx*dx+dy*dy<=radius*radius){
        let xx=x+dx,yy=y+dy;if(this.wrap){xx=(xx+this.width)%this.width;yy=(yy+this.height)%this.height;}
        if(xx<0||yy<0||xx>=this.width||yy>=this.height)return reject('edge');
        const occupied=this.C.pixt([xx,yy]);if(occupied)return reject(this.C.cellKind(occupied)===WALL?'wall':'occupied');points.push([xx,yy]);
      }
      const id=this.C.makeNewCellID(kind);for(const p of points)this.C.setpix(p,id);this.C.stat_values={};this.refreshPositions();
      if(this.section&&!this.section.initialize(this.cells[id],points.map(p=>this.C.grid.p2i(p)))){this.eraseCell(id);return reject('nucleus');}
      this.lastSeedResult={id,reason:'',population:population+1};
      this.version++;return id;
    }
    insert(kind,x,y,radius=4){return globalThis.CellLabInsertion.insert(this,kind,x,y,radius);}
    populateMonolayer(){
      // Power-Voronoi initialization only; subsequent shapes obey ordinary CPM.
      // Tissue reaches all four boundaries. Small interstitial immune territories
      // cut convex epithelial polygons, without deleting a nucleus or leaving holes.
      const W=this.worldWidth,H=this.worldHeight,s=this.scale,rows=[],sites=[],step=16.6,dy=step*Math.sqrt(3)/2;
      const ny=Math.max(2,Math.round(H/dy)),nx=Math.max(2,Math.round(W/step));
      for(let row=0;row<ny;row++){const list=[];for(let col=0;col<nx;col++){
        const x=clamp((col+.5+(row%2? .22:-.22))*W/nx+(this.C.random()-.5)*2,3,W-3),y=(row+.5)*H/ny+(this.C.random()-.5)*2;
        const site={x,y,id:this.C.makeNewCellID(NORMAL),points:[]};sites.push(site);list.push(site);
      }rows.push(list);}
      const nearest=(x,y)=>{let best=null,d=Infinity;const row=Math.floor(y/H*ny),col=Math.floor(x/W*nx);
        for(let yy=Math.max(0,row-2);yy<=Math.min(ny-1,row+2);yy++)for(let xx=Math.max(0,col-2);xx<=Math.min(nx-1,col+2);xx++){const site=rows[yy][xx],q=(site.x-x)**2+(site.y-y)**2;if(q<d){d=q;best=site;}}return [best,d];};
      const patrols=[];
      for(const [fx,fy]of [[.24,.27],[.73,.25],[.32,.73],[.77,.69]]){
        let spot=null,score=-Infinity;for(let y=H*fy-7;y<=H*fy+7;y++)for(let x=W*fx-7;x<=W*fx+7;x++){const d=nearest(x,y)[1];if(d>score){score=d;spot=[x,y];}}
        const [x,y]=spot,site={x,y,id:this.C.makeNewCellID(IMMUNE),points:[],weight:0};let lo=-100,hi=100;
        for(let n=0;n<15;n++){const mid=(lo+hi)/2;let area=0;for(let yy=Math.max(0,Math.floor(y-12));yy<Math.min(H,y+12);yy++)for(let xx=Math.max(0,Math.floor(x-12));xx<Math.min(W,x+12);xx++)if((xx-x)**2+(yy-y)**2+mid<nearest(xx,yy)[1])area++;if(area>72)lo=mid;else hi=mid;}site.weight=(lo+hi)/2;patrols.push(site);
      }
      for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
        const xx=(x+.5)/s,yy=(y+.5)/s;let [site,d]=nearest(xx,yy);
        for(const ctl of patrols){const q=(ctl.x-xx)**2+(ctl.y-yy)**2+ctl.weight;if(q<d){d=q;site=ctl;}}
        const i=this.C.grid.p2i([x,y]);this.C.setpixi(i,site.id);site.points.push(i);
      }
      this.refreshPositions();for(const site of [...sites,...patrols]){const m=this.cells[site.id];m.base=m.target=this.C.getVolume(m.id);if(this.section&&!this.section.initialize(m,site.points))throw Error('Monolayer nucleus does not fit');this.updateMechanics(m);}this.C.stat_values={};
    }
    populateMaze(){
      const tau=2*Math.PI,W=this.worldWidth,H=this.worldHeight,r=this.scale,cx=W/2,cy=H/2,R=Math.min(W,H)/2-6,hub=10,rings=Math.max(3,Math.round((R-hub)/10)),pitch=(R-hub)/rings,halfWall=2,door=4;
      if(Math.min(W,H)<144)throw Error('免疫迷宫需要至少 144 的区域短边');
      const counts=[],offsets=[],nodes=[{ring:-1,j:0,x:0,y:0}],edges=[];
      let sectors=6;for(let k=0;k<rings;k++){const inner=hub+k*pitch;if(tau*inner/sectors>18)sectors*=2;counts.push(sectors);offsets.push(nodes.length);for(let j=0;j<sectors;j++){const a=(j+.5)*tau/sectors,d=inner+pitch/2;nodes.push({ring:k,j,x:d*Math.cos(a),y:d*Math.sin(a)});}}
      const key=(a,b)=>a<b?a+':'+b:b+':'+a;
      for(let k=0;k<rings;k++)for(let j=0;j<counts[k];j++){const a=offsets[k]+j;edges.push([a,offsets[k]+(j+1)%counts[k],0]);edges.push([a,k?offsets[k-1]+Math.floor(j*counts[k-1]/counts[k]):0,1]);}
      const entrances=Array.from({length:6},(_,j)=>offsets.at(-1)+j*counts.at(-1)/6),angles=entrances.map(i=>(nodes[i].j+.5)*tau/counts.at(-1));
      // Geometry construction only: reject trivial short routes from any start.
      // This graph is discarded. Cell polarity reads only its local field samples.
      let open,best=-Infinity;
      for(let attempt=0;attempt<48;attempt++){
        const shuffled=edges.map(e=>({e,cost:this.C.random()+e[2]*.12})).sort((a,b)=>a.cost-b.cost),parent=nodes.map((_,i)=>i),root=a=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;},doors=new Set(),adj=nodes.map(()=>[]);
        for(const {e:[a,b]}of shuffled){const ra=root(a),rb=root(b);if(ra!==rb){parent[ra]=rb;doors.add(key(a,b));adj[a].push(b);adj[b].push(a);}}
        const distances=new Float64Array(nodes.length).fill(-1),queue=[0];distances[0]=0;
        for(let h=0;h<queue.length;h++){const a=queue[h];for(const b of adj[a])if(distances[b]<0){distances[b]=distances[a]+Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y);queue.push(b);}}
        const paths=entrances.map(i=>distances[i]),min=Math.min(...paths),max=Math.max(...paths),score=min-Math.max(0,max-R*8);
        if(score>best){best=score;open=doors;}if(min>R*2.8&&max<R*8)break;
      }
      // Analytic arcs and radial segments define BOTH the wall raster and
      // the smooth drawing. Field resolution no longer sets the visible steps.
      const curves=[],circle=(radius,gates,sectorAngle=null)=>{
        const gaps=[];for(const angle of gates){const half=sectorAngle===null?door/radius:sectorAngle/2;for(const shift of [-tau,0,tau]){const lo=Math.max(0,angle-half+shift),hi=Math.min(tau,angle+half+shift);if(hi>lo)gaps.push([lo,hi]);}}
        gaps.sort((a,b)=>a[0]-b[0]);let end=0;for(const [lo,hi]of gaps){if(lo>end+1e-8)curves.push([0,radius*r,end,lo]);end=Math.max(end,hi);}if(end<tau-1e-8)curves.push([0,radius*r,end,tau]);
      };
      circle(R,angles);
      for(let k=0;k<rings;k++){
        const inner=hub+k*pitch,n=counts[k],gates=[];
        for(let j=0;j<n;j++){
          const a=offsets[k]+j,b=k?offsets[k-1]+Math.floor(j*counts[k-1]/n):0;
          if(open.has(key(a,b)))gates.push((j+.5)*tau/n);
          if(!open.has(key(a,offsets[k]+(j+n-1)%n))){const angle=j*tau/n,ux=Math.cos(angle)*r,uy=Math.sin(angle)*r;curves.push([1,inner*ux,inner*uy,(inner+pitch)*ux,(inner+pitch)*uy]);}
        }
        circle(inner,gates,tau/n);
      }
      // Radial walls meet an arc at its centerline. At an open boundary they
      // stop at the edge of their own corridor instead of poking into the next.
      const joins=(radius,angle)=>curves.some(c=>c[0]===0&&Math.abs(c[1]-radius)<1e-6&&[angle,angle+tau].some(a=>a>=c[2]-1e-8&&a<=c[3]+1e-8));
      for(const c of curves)if(c[0]===1){let inner=Math.hypot(c[1],c[2]),outer=Math.hypot(c[3],c[4]);const ux=c[3]/outer,uy=c[4]/outer,angle=(Math.atan2(uy,ux)+tau)%tau;if(!joins(inner,angle))inner+=halfWall*r;if(!joins(outer,angle))outer-=halfWall*r;c[1]=inner*ux;c[2]=inner*uy;c[3]=outer*ux;c[4]=outer*uy;}
      this.wallID=this.C.makeNewCellID(WALL);const half=halfWall*r,centerX=cx*r,centerY=cy*r;
      for(const curve of curves){
        let points,distance;
        if(curve[0]===0){const [,radius,start,end]=curve,ax=radius*Math.cos(start),ay=radius*Math.sin(start),bx=radius*Math.cos(end),by=radius*Math.sin(end);points=[[ax,ay],[bx,by]];for(let angle=0;angle<=tau;angle+=Math.PI/2)if(angle>=start&&angle<=end)points.push([radius*Math.cos(angle),radius*Math.sin(angle)]);
          distance=(x,y)=>{const angle=(Math.atan2(y,x)+tau)%tau;return angle>=start&&angle<=end?(Math.hypot(x,y)-radius)**2:Infinity;};
        }else{const [,ax,ay,bx,by]=curve,vx=bx-ax,vy=by-ay,len=vx*vx+vy*vy;points=[[ax,ay],[bx,by]];distance=(x,y)=>{const t=((x-ax)*vx+(y-ay)*vy)/len;if(t<0||t>1)return Infinity;return (x-ax-t*vx)**2+(y-ay-t*vy)**2;};}
        const x0=Math.max(0,Math.floor(centerX+Math.min(...points.map(p=>p[0]))-half)),x1=Math.min(this.width-1,Math.ceil(centerX+Math.max(...points.map(p=>p[0]))+half)),y0=Math.max(0,Math.floor(centerY+Math.min(...points.map(p=>p[1]))-half)),y1=Math.min(this.height-1,Math.ceil(centerY+Math.max(...points.map(p=>p[1]))+half));
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(distance(x+.5-centerX,y+.5-centerY)<=half*half)this.C.setpix([x,y],this.wallID);
      }
      this.rebuildMask();this.maze={cx:centerX,cy:centerY,radius:R*r,goalRadius:hub*.55*r,rings,corridor:pitch-2*halfWall,curves,wallWidth:2*half,wallID:this.wallID,cutouts:[],signalThroughWalls:false,racers:[],arrivals:[],startedAt:0};
      for(let j=0;j<6;j++){
        const a=angles[j],distance=R-pitch/2,x=Math.round((cx+distance*Math.cos(a))*r),y=Math.round((cy+distance*Math.sin(a))*r),start=this.C.grid.p2i([x,y]);
        // A resting round cell is wider than the corridor. Seed a connected,
        // full-area body along the available passage, rather than a tiny dot.
        const queue=[start],seen=new Set([start]),points=[];
        for(let h=0;h<queue.length&&points.length<Math.round(72*r*r);h++){const i=queue[h];if(this.C.pixti(i))continue;points.push(i);for(const n of this.faces[i])if(!seen.has(n)&&Math.hypot(this.xs[n]-x,this.ys[n]-y)<10*r){seen.add(n);queue.push(n);}}
        if(points.length<40*r*r)throw Error('Maze entrance cannot fit an immune cell');
        const id=this.C.makeNewCellID(IMMUNE);for(const i of points)this.C.setpixi(i,id);this.refreshPositions();const m=this.cells[id];
        if(!this.section.initialize(m,points))throw Error('Maze entrance cannot fit an immune nucleus');
        m.px=-Math.cos(a);m.py=-Math.sin(a);this.maze.racers.push({id,birth:m.birth,number:j+1,x:m.x,y:m.y,arrivedAt:null});this.updateMechanics(m);
      }
      this.addSource(cx*r,cy*r,'trail',4*r);
    }
    addSource(x,y,type,radius=10*this.scale){
      if(![...SIGNALS,'nutrient','hostile'].includes(type)||![x,y,radius].every(Number.isFinite)||radius<=0)return 0;
      x=clamp(x,0,this.width-1);y=clamp(y,0,this.height-1);radius=clamp(radius,2*this.scale,40*this.scale);
      const existing=this.sources.find(s=>s.type===type&&Math.hypot(s.x-x,s.y-y)<Math.max(2*this.scale,radius*.5));if(existing)return existing.id;
      const source={id:++this.sourceSerial,x,y,type,radius};this.sources.push(source);this.applySources();this.version++;return source.id;
    }
    removeSources(x,y,radius=10*this.scale){const n=this.sources.length;this.sources=this.sources.filter(s=>Math.hypot(s.x-x,s.y-y)>radius+s.radius);this.version++;return n-this.sources.length;}
    sourceBins(source){const f=this.fields.oxygen,result=[],step=this.fieldScale;for(let y=Math.max(0,Math.floor((source.y-source.radius)/step));y<Math.min(f.height,(source.y+source.radius)/step+1);y++)for(let x=Math.max(0,Math.floor((source.x-source.radius)/step));x<Math.min(f.width,(source.x+source.radius)/step+1);x++){const i=y*f.width+x;if(!f.blocked[i]&&Math.hypot((x+.5)*step-source.x,(y+.5)*step-source.y)<=source.radius)result.push(i);}return result;}
    applySources(channel=null){
      for(const source of this.sources){if(channel&&source.type!==channel)continue;for(const i of this.sourceBins(source)){
        if(SIGNALS.includes(source.type))this.fields[source.type].values[i]=30;
        else if(source.type==='nutrient'){this.fields.oxygen.values[i]=1;this.fields.glucose.values[i]=1;}
        else{this.fields.oxygen.values[i]=.06;this.fields.acid.values[i]=.95;}
      }}
      if(this.maze&&(!channel||channel==='trail')){const f=this.fields.trail,m=this.maze;for(let i=0;i<f.values.length;i++)if(Math.hypot((i%f.width+.5)*this.fieldScale-m.cx,(Math.floor(i/f.width)+.5)*this.fieldScale-m.cy)>m.radius+2*this.scale)f.values[i]=0;}
    }
    equilibrateMaze(){
      // Preconditioned conjugate gradients solve the same local no-flux
      // diffusion equilibrium. No route or distance-to-goal enters cell motion.
      const f=this.fields.trail,n=f.values.length,fixed=new Uint8Array(n),neighbours=Array.from({length:n},()=>[]),active=[];
      this.applySources('trail');for(let i=0;i<n;i++){const x=i%f.width,y=Math.floor(i/f.width);if(f.blocked[i]||f.values[i]===30||Math.hypot((x+.5)*this.fieldScale-this.maze.cx,(y+.5)*this.fieldScale-this.maze.cy)>this.maze.radius+2*this.scale)fixed[i]=1;else active.push(i);
        for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(xx>=0&&xx<f.width&&yy>=0&&yy<f.height&&!f.blocked[yy*f.width+xx])neighbours[i].push(yy*f.width+xx);}
      const x=new Float64Array(n),residual=new Float64Array(n),p=new Float64Array(n),ap=new Float64Array(n);let rz=0;
      for(const i of active){for(const j of neighbours[i])if(fixed[j])residual[i]+=f.values[j]/30;p[i]=residual[i]/(neighbours[i].length||1);rz+=residual[i]*p[i];}
      const tolerance=Math.max(1e-18,rz*1e-16);
      for(let step=0;step<6000&&rz>tolerance;step++){
        let pap=0;for(const i of active){let v=neighbours[i].length*p[i];for(const j of neighbours[i])if(!fixed[j])v-=p[j];ap[i]=v;pap+=p[i]*v;}
        if(pap<=0)break;const alpha=rz/pap;let next=0;
        for(const i of active){x[i]+=alpha*p[i];residual[i]-=alpha*ap[i];next+=residual[i]*residual[i]/(neighbours[i].length||1);}
        const beta=next/rz;for(const i of active)p[i]=residual[i]/(neighbours[i].length||1)+beta*p[i];rz=next;
      }
      for(const i of active)f.values[i]=30*clamp(x[i]);
    }
    setMazeSignalMode(throughWalls){
      if(!this.maze)return false;
      this.maze.signalThroughWalls=!!throughWalls;const f=this.fields.trail;
      if(throughWalls)f.blocked.fill(0);else f.blocked.set(this.fields.oxygen.blocked);
      f.values.fill(0);this.equilibrateMaze();this.version++;return true;
    }
    populate(){
      const W=this.worldWidth,H=this.worldHeight,C=this.C,r=this.scale;
      const seed=(kind,x,y,radius)=>this.seed(kind,x*r,y*r,radius*r);
      const background=points=>{for(const [x,y] of points)seed(NORMAL,x,y,8);};
      if(this.scene==='random'){
        const centers=Array.from({length:C.ran(1,3)},()=>[W*(.25+.5*C.random()),H*(.25+.5*C.random())]),density=.55+.3*C.random();
        // Jittered, non-overlapping founders; local patches bias the mixture.
        // Only initialization has access to these centers; sensing stays local.
        for(let y=13;y<H-9;y+=22)for(let x=13;x<W-9;x+=22){
          if(C.random()>density)continue;
          const near=centers.some(([cx,cy])=>Math.hypot(x-cx,y-cy)<Math.min(W,H)*.22);
          const roll=C.random(),kind=roll<(near?.6:.08)?TUMOR:roll>.88?IMMUNE:NORMAL;
          seed(kind,x+C.ran(-3,3),y+C.ran(-3,3),kind===IMMUNE?3:kind===TUMOR?7:8);
        }
        return;
      }
      if(this.scene==='network'){
        let row=0;for(let y=H*.2;y<H*.85;y+=25,row++)for(let x=W*.18+(row%2)*12.5;x<W*.86;x+=25)seed(TUMOR,x+C.ran(-2,2),y+C.ran(-2,2),7);
        return;
      }
      if(this.scene==='oncogenesis'){
        // Every epithelial body begins normal: no seeded tumor, abnormal state,
        // preloaded stress or time-triggered transformation.
        this.populateMonolayer();
        return;
      }
      if(this.scene==='cold'||this.scene==='hot'){
        // Compact hexagonal lesions: 19 cold / 37 hot tumor founders. The hot
        // scene starts with substantial local burden, not scattered targets.
        // These are initial positions only; subsequent sensing stays local.
        const hot=this.scene==='hot',rings=hot?3:2;
        const patrols=[[W*.08,H*.28],[W*.92,H*.5],[W*.08,H*.76]];
        const points=[];for(let y=14;y<H-9;y+=23)for(let x=15;x<W-9;x+=23)if(Math.hypot(x-W/2,y-H/2)>(hot?78:52)&&(hot||patrols.every(([px,py])=>Math.hypot(x-px,y-py)>13)))points.push([x,y]);background(points);
        for(let q=-rings;q<=rings;q++)for(let t=-rings;t<=rings;t++)if(Math.abs(q+t)<=rings)seed(TUMOR,W/2+17.5*(q+t/2),H/2+17.5*Math.sqrt(3)/2*t,7);
        if(hot){
          for(let i=0;i<18;i++){const a=i*Math.PI/9;seed(IMMUNE,W/2+64*Math.cos(a),H/2+64*Math.sin(a),3);}
        }else{
          for(const [x,y] of patrols)seed(IMMUNE,x,y,3);
        }
        return;
      }
      if(this.scene==='collective'){
        for(let y=22;y<H-15;y+=29)for(let x=22;x<W-15;x+=26)seed(NORMAL,x+C.ran(-2,2),y+C.ran(-2,2),7);
        return;
      }
      if(this.scene==='maze'){
        this.populateMaze();
        return;
      }
      if(this.scene==='stress'){
        for(let y=H*.2;y<H*.8;y+=17)for(let x=W*.25;x<W*.75;x+=17)seed(C.random()<.7?TUMOR:NORMAL,x,y,7);
        for(let i=0;i<8;i++)seed(IMMUNE,W*.15+(i%2)*W*.7,20+Math.floor(i/2)*(H-40)/4,4);
        return;
      }
      if(this.scene==='surveillance'){
        // All epithelial cells start normal; no pre-existing tumor is planted.
        for(let y=H*.18;y<H*.84;y+=18)for(let x=W*.18;x<W*.84;x+=18)seed(NORMAL,x,y,8);
        for(let i=0;i<10;i++)seed(IMMUNE,W*.1+(i%2)*W*.8,15+Math.floor(i/2)*(H-30)/5,4);
        return;
      }
      for(let y=14;y<H-9;y+=23)for(let x=15;x<W-9;x+=23){
        if(Math.hypot(x-W/2,y-H/2)<31)continue;seed(NORMAL,x,y,8);
      }
      for(const [dx,dy] of [[-11,-10],[10,-10],[-11,11],[10,11]])seed(TUMOR,W/2+dx,H/2+dy,7);
      if(this.scene==='ecosystem'){
        for(let x=26;x<W-10;x+=46){seed(IMMUNE,x,26,4);seed(IMMUNE,x,H-26,4);}
      }
    }
    paint(x,y,radius=2,erase=false,rebuild=true){
      const C=this.C;let changed=0;radius=Math.round(radius);
      if(this.maze&&erase)this.maze.cutouts.push([Math.round(x)+.5,Math.round(y)+.5,radius]);
      if(this.maze&&!erase&&this.wallID===this.maze.wallID)this.wallID=0;
      for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++){
        if(dx*dx+dy*dy>radius*radius)continue;const xx=Math.round(x+dx),yy=Math.round(y+dy);if(xx<0||yy<0||xx>=this.width||yy>=this.height)continue;
        const old=C.pixt([xx,yy]);
        if(erase){if(old&&C.cellKind(old)===WALL){C.setpix([xx,yy],0);changed++;}}
        else if(!old){if(!this.wallID||!C.getVolume(this.wallID))this.wallID=C.makeNewCellID(WALL);C.setpix([xx,yy],this.wallID);changed++;}
      }
      C.stat_values={};if(rebuild)this.rebuildMask();this.version++;return changed;
    }
    rebuildMask(){
      for(const f of Object.values(this.fields))f.blocked.fill(0);
      for(const [p,id] of this.C.pixels())if(this.C.cellKind(id)===WALL){const x=Math.floor(p[0]/this.fieldScale),y=Math.floor(p[1]/this.fieldScale);for(const f of Object.values(this.fields)){const i=y*f.width+x;f.blocked[i]=1;f.values[i]=0;}}
      if(this.maze?.signalThroughWalls)this.fields.trail.blocked.fill(0);
    }
    clearWalls(){const points=[...this.C.pixels()].filter(([,id])=>this.C.cellKind(id)===WALL).map(([p])=>p);for(const p of points)this.C.setpix(p,0);if(this.maze){this.maze.curves=[];this.maze.cutouts=[];this.maze.wallID=0;}this.wallID=0;this.C.stat_values={};this.rebuildMask();}
    scanContacts(){
      const contacts=this.contacts,grid=this.C.grid._pixels;
      for(const m of this.live()){let map=contacts.get(m.id);if(!map){map=new Map();contacts.set(m.id,map);}map.clear();}
      const add=(a,b,dx,dy)=>{if(!this.cells[a])return;const map=contacts.get(a);let edge=map.get(b);if(!edge){edge={id:b,length:0,nx:0,ny:0};map.set(b,edge);}edge.length++;edge.nx+=dx;edge.ny+=dy;};
      const present=id=>!!this.cells[id]||this.C.cellKind(id)===WALL;
      for(const i of this.C.borderpixels.elements){
        const a=grid[i];if(!present(a))continue;const ring=this.rings[i];
        const right=ring[3],b=right<0?0:grid[right];if(a!==b&&present(b)){add(a,b,1,0);add(b,a,-1,0);}
        const down=ring[5],c=down<0?0:grid[down];if(a!==c&&present(c)){add(a,c,0,1);add(c,a,0,-1);}
      }
      for(const m of this.live()){let length=0;for(const e of contacts.get(m.id).values())length+=e.length;m.confinement=clamp(length/Math.max(1,4*Math.sqrt(this.C.getVolume(m.id))));}
      return this.contacts;
    }
    fieldIndex(x,y){return Math.floor(y/this.fieldScale)*this.fields.oxygen.width+Math.floor(x/this.fieldScale);}
    prepareEnvironment(){
      const {oxygen,glucose,acid,density}=this.fields,blocked=oxygen.blocked,n=oxygen.values.length;
      for(let kind=1;kind<=3;kind++){
        const field=this.densityFields[kind];
        for(let i=0;i<n;i++)field.values[i]=blocked[i]?0:this.occupancy[kind][i]/this.binAreas[i];
        // Two no-flux smoothing steps give density a local neighbourhood range.
        field.step(.2,0);field.step(.2,0);this.densities[kind]=field.values;
      }
      const rn=this.densities[1],rt=this.densities[2],ri=this.densities[3];
      for(let i=0;i<n;i++)density.values[i]=clamp(rn[i]+rt[i]+ri[i]);
      // Yielding moves material out of the displayed slice, not out of the
      // local metabolic budget. Keep its contribution in the same local bins.
      this.loads=this.densities;
      if(this.section){
        for(let kind=1;kind<=3;kind++)this.massFields[kind].values.fill(0);
        for(const m of this.live())for(const [i,pixels] of m.fieldBins)if(!blocked[i])this.massFields[m.kind].values[i]+=pixels/(Math.max(.5,m.sectionFraction)*this.binAreas[i]);
        this.loads=[null];for(let kind=1;kind<=3;kind++){const f=this.massFields[kind];f.step(.2,0);f.step(.2,0);this.loads[kind]=f.values;}
      }
    }
    integrateEnvironment(dt){
      const {oxygen,glucose,acid}=this.fields,blocked=oxygen.blocked,n=oxygen.values.length;
      const [_,rn,rt,ri]=this.loads;
      for(let remaining=dt;remaining>0;remaining--){const sub=Math.min(1,remaining);
        oxygen.step(.10*sub,0);glucose.step(.065*sub,0);acid.step(.045*sub,0);
        for(let i=0;i<n;i++){
          if(blocked[i])continue;
          const o=oxygen.values[i],g=glucose.values[i],a=acid.values[i],s=this.settings.supply*(.65+.35*this.supplyMap[i]),clearance=this.settings.supply*this.supplyMap[i],k=this.settings.metabolism;
          const loadO=.55*rn[i]+rt[i]+.7*ri[i],loadG=.4*rn[i]+1.35*rt[i]+.8*ri[i];
          oxygen.values[i]=clamp(o+sub*(.012*s*(1-o)-.024*k*loadO*o/(.2+o)));
          glucose.values[i]=clamp(g+sub*(.010*s*(1-g)-.023*k*loadG*g/(.15+g)));
          acid.values[i]=clamp(a+sub*(.014*k*(.3*rn[i]+1.2*rt[i]+.45*ri[i])*g/(.15+g)*(1+.8*(1-o))-.009*clearance*a));
        }
      }
    }
    updateEnvironment(dt){this.prepareEnvironment();this.integrateEnvironment(dt);}
    updateMetabolism(dt){
      this.applySources();
      for(const m of this.live()){
        if(m.dying)continue;let o=0,g=0,a=0,n=0;
        // Integrate over the actual footprint; an amoeboid centroid can lie outside it.
        for(const [i,pixels] of m.fieldBins){if(this.fields.oxygen.blocked[i])continue;o+=this.fields.oxygen.values[i]*pixels;g+=this.fields.glucose.values[i]*pixels;a+=this.fields.acid.values[i]*pixels;n+=pixels;}
        if(!n){o=m.oxygen;g=m.glucose;a=m.acid;n=1;}
        m.oxygen=o/n;m.glucose=g/n;m.acid=a/n;
        const tolerance=m.genome?.tolerance||1;
        m.adversity=.35*clamp((.45-m.oxygen)/.45)+.4*clamp((.5-m.glucose)/.5)+.25*clamp((m.acid-.25)/.75);
        // Tolerance reduces injury and acid inhibition, but cannot create nutrients.
        m.fitness=clamp(m.oxygen/.45)*clamp(m.glucose/.5)*clamp(1-.85*m.acid/(m.kind===TUMOR?Math.sqrt(tolerance):1));
        m.stress=clamp(m.stress+dt*(m.adversity*m.adversity/(220*tolerance)-Math.max(0,.18-m.adversity)/160));
        if(m.stress>=1)this.beginDeath(m.id,'environment');
        this.updateMechanics(m);
      }
    }
    updateSignals(dt){
      for(const m of this.live()){
        if(m.dying)continue;
        // Sources live on occupied bins, never at a concave body's empty centroid.
        const deposit=(channel,amount)=>{const volume=this.C.getVolume(m.id);for(const [i,pixels] of m.fieldBins){const f=this.fields[channel];if(!f.blocked[i])f.values[i]=Math.min(30,f.values[i]+amount*pixels/volume);}};
        if(m.kind===NORMAL)deposit('cohesion',.045*dt);
        if(m.state==='abnormal')deposit('danger',.035*dt);
        if(m.kind===TUMOR)deposit('danger',.10*dt);
        if(m.kind===IMMUNE&&m.recruitment>0)deposit('trail',.38*dt*this.settings.recruitment*m.fitness);
      }
      const decay=Math.LN2/this.settings.halfLife;
      // Fixed substeps keep the explicit solver positive for any requested dt.
      for(let remaining=dt;remaining>0;remaining-=2){const sub=Math.min(2,remaining);for(const key of SIGNALS){this.fields[key].step(.09*sub,this.maze&&key==='trail'?0:decay*sub);this.applySources(key);}}
    }
    updatePolarity(dt){
      const s=this.settings,next=[];
      for(const m of this.live()){
        if(m.dying)continue;let gx=0,gy=0,ax=0,ay=0,rx=0,ry=0,ix=0,iy=0,total=0;
        const gradient=key=>{const f=this.fields[key];let x=0,y=0,n=0;for(const [i,amount] of m.fieldBins){const g=f.gradient(i%f.width,Math.floor(i/f.width));x+=g[0]*amount;y+=g[1]*amount;n+=amount;}return [x/(n||1),y/(n||1)];};
        if(m.kind===IMMUNE){const a=gradient('danger'),b=gradient('trail');gx=a[0]+b[0]*1.8;gy=a[1]+b[1]*1.8;}
        else if(m.kind===NORMAL){[gx,gy]=gradient('cohesion');}
        else {const g=gradient('cohesion');gx=g[0]*.25;gy=g[1]*.25;}
        const magnitude=Math.hypot(gx,gy);if(magnitude>0){const gain=Math.min(1,magnitude/.035);gx=gx/magnitude*gain;gy=gy/magnitude*gain;}
        // This cue reads only local damage/recruitment gradients. Concentration
        // or contact with another immune cell does not confer recognition.
        if(m.kind===IMMUNE)m.immuneCue=clamp(s.chemotaxis/1.6)*Math.min(1,magnitude/.035);
        for(const edge of this.contacts.get(m.id)?.values()||[]){
          const other=this.cells[edge.id];if(!other||other.dying)continue;
          if(m.kind===IMMUNE&&other.kind===IMMUNE){ix-=edge.nx;iy-=edge.ny;continue;}
          if(other.kind===m.kind){ax+=other.px*edge.length;ay+=other.py*edge.length;total+=edge.length;}
          if(m.targetID!==other.id){rx-=edge.nx;ry-=edge.ny;}
        }
        if(total){ax/=total;ay/=total;}
        const r=Math.hypot(rx,ry);if(r>0){rx/=r;ry/=r;}
        const chemo=m.kind===NORMAL?s.cohesion:s.chemotaxis;
        const repel=s.repulsion*(m.kind===TUMOR?.18:m.kind===IMMUNE?.16:1);
        const separation=Math.hypot(ix,iy);if(separation){ix/=separation;iy/=separation;}
        // Protect an actual antigen scan/synapse. Other-cell repulsion above is
        // unchanged; this extra term acts exclusively on immune/immune contact.
        const peerSeparation=m.kind===IMMUNE&&m.phase==='search'&&!m.targetID?s.immuneSeparation*(1-.65*m.immuneCue):0;
        const o=gradient('oxygen'),g=gradient('glucose'),a=gradient('acid');
        let ex=o[0]+g[0]-a[0],ey=o[1]+g[1]-a[1],en=Math.hypot(ex,ey);
        if(en){const gain=Math.min(1,en/.025)*m.adversity*s.escape;ex=ex/en*gain;ey=ey/en*gain;}
        const angle=(this.C.random()-.5)*s.noise*.36*Math.sqrt(Math.max(0,dt));
        const px=m.px*Math.cos(angle)-m.py*Math.sin(angle),py=m.px*Math.sin(angle)+m.py*Math.cos(angle);
        const blend=1-Math.exp(-dt/12);
        let nx=px+blend*(chemo*gx+s.alignment*ax+repel*rx+peerSeparation*ix+ex),ny=py+blend*(chemo*gy+s.alignment*ay+repel*ry+peerSeparation*iy+ey);
        const norm=Math.hypot(nx,ny)||1;next.push([m,nx/norm,ny/norm]);
      }
      for(const [m,x,y] of next){m.px=x;m.py=y;this.updateMechanics(m);}
    }
    immuneInteractions(dt){
      for(const m of this.live())if((m.kind===TUMOR||m.state==='abnormal')&&!m.dying)m.damage*=Math.exp(-dt/400);
      const seen=new Set();
      for(const ctl of this.live()){
        if(ctl.kind!==IMMUNE||ctl.dying)continue;
        let chosen=null;ctl.targetID=0;ctl.phase='search';
        for(const edge of this.contacts.get(ctl.id)?.values()||[]){
          const target=this.cells[edge.id];if(!this.immuneTarget(target)||edge.length<1)continue;
          const key=ctl.id+':'+target.id;seen.add(key);
          let h=this.histories.get(key);if(!h){h={ctl:ctl.id,target:target.id,dwell:0,recognized:false};this.histories.set(key,h);}
          h.dwell+=dt*Math.min(1,edge.length/(3*this.scale))*target.antigenLevel*ctl.fitness;
          if(!h.recognized&&h.dwell>=12){h.recognized=true;this.counters.recognitions++;this.log('recognize',ctl.id,target.id);}
          if(!chosen||h.dwell>chosen.h.dwell)chosen={target,edge,h};
        }
        if(chosen){
          ctl.phase=chosen.h.recognized?'kill':'scan';
          // Only the currently contacting, antigen-positive target gets damage.
          if(chosen.h.recognized){
            ctl.targetID=chosen.target.id;ctl.activation=700;ctl.recruitment=200;
            chosen.target.damage+=dt*.012*this.settings.kill*chosen.target.antigenLevel*Math.min(1,chosen.edge.length/(3*this.scale))*ctl.fitness;
            if(chosen.target.damage>=1)this.beginDeath(chosen.target.id,'kill');
          }
        }
        this.updateMechanics(ctl);
      }
      for(const [key,h] of this.histories){
        if(!this.cells[h.ctl]||!this.immuneTarget(this.cells[h.target]))this.histories.delete(key);
        else if(!seen.has(key)){h.dwell=Math.max(0,h.dwell-dt*.5);if(!h.dwell)this.histories.delete(key);}
      }
    }
    updateLocal(dt){this.refreshPositions();this.scanContacts();this.section?.updateJunctions(0);this.immuneInteractions(dt);this.updatePolarity(dt);}
    log(type,id,target=0,detail={}){this.events.push({time:this.C.time,type,id,target,...detail});if(this.events.length>1000)this.events.shift();}
    beginDeath(id,cause){
      const m=this.cells[id];if(!m||m.dying)return false;
      m.dying=true;m.deathCause=cause;m.deathStartedAt=this.C.time;m.targetID=0;m.phase='dying';m.recruitment=0;
      m.deathElapsed=0;m.deathProgress=0;m.deathArea=this.C.getVolume(id);m.deathIntact=cause==='kill';
      m.deathPhase=cause==='kill'?'rounding':cause==='spontaneous'?'shrinking':'withering';
      if(m.deathIntact)m.target=m.deathArea/(this.section?m.sectionFraction:1);
      // Keep a separate lifetime ledger: the rolling interaction log cannot
      // serve as a complete death history, and grid IDs may later be reused.
      m.deathRecord={id,birth:m.birth,kind:m.kind,state:m.state,clone:m.clone,cause,effect:cause==='kill'?'lysis':cause==='spontaneous'?'apoptosis':'stress',startedAt:this.C.time,clearedAt:null};
      this.deathHistory.push(m.deathRecord);const keys=DEATH_COUNTERS[cause];if(keys)this.counters[keys[0]]++;
      this.section?.forget(id);this.updateMechanics(m);this.log('death-start',id,0,{cause,birth:m.birth});
      for(const ctl of this.live())if(ctl.targetID===id){ctl.targetID=0;ctl.phase='search';this.updateMechanics(ctl);}return true;
    }
    eraseCell(id,{manual=false,points=null}={}){
      const m=this.cells[id];
      if(manual&&!m)return;
      if(m?.dying)m.deathFinalArea=this.C.getVolume(id);
      this.section?.forget(id);
      const occupied=points||[...this.C.pixels()].filter(([,cid])=>cid===id).map(([p])=>p);for(const p of occupied)this.C.setpix(p,0);
      // Both zero-pixel cleanup and small-remnant removal converge here.
      // Administrative removal of a healthy cell is not a biological death.
      if(manual){
        this.counters.manualRemoved++;this.log('manual-remove',id,0,{birth:m.birth,kind:m.kind,state:m.state,interruptedCause:m.dying?m.deathCause:null});
        if(m.dying){this.manualDeathRemovals[m.deathCause]++;if(m.deathRecord)m.deathRecord.manuallyRemovedAt=this.C.time;}
      }else if(m?.dying)this.countDeath(m.deathCause,m);
      delete this.cells[id];this.contacts.delete(id);for(const [key,h] of this.histories)if(h.ctl===id||h.target===id)this.histories.delete(key);
      for(const m of this.live())if(m.targetID===id){m.targetID=0;m.phase='search';this.updateMechanics(m);}this.C.stat_values={};
    }
    eraseCells(points,radius){
      if(!Array.isArray(points)||!Number.isFinite(radius)||radius<=0)return {removed:0};
      const r=Math.min(radius,64*this.scale),ids=new Set(),grid=this.C.grid._pixels;
      for(const p of points){if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))continue;
        for(let dy=-Math.ceil(r);dy<=r;dy++)for(let dx=-Math.ceil(r);dx<=r;dx++)if(dx*dx+dy*dy<=r*r){
          let x=Math.round(p[0])+dx,y=Math.round(p[1])+dy;if(this.wrap){x=(x%this.width+this.width)%this.width;y=(y%this.height+this.height)%this.height;}
          if(x<0||y<0||x>=this.width||y>=this.height)continue;const id=grid[this.positions[y*this.width+x]];if(this.cells[id])ids.add(id);
        }
      }
      if(!ids.size)return {removed:0};
      // One body traversal per stroke batch, rather than one full-grid scan per cell.
      const occupied=new Map([...ids].map(id=>[id,[]]));for(const [p,id]of this.C.pixels())occupied.get(id)?.push(p);
      for(const [id,body]of occupied)this.eraseCell(id,{manual:true,points:body});
      if(ids.size){this.refreshPositions();this.scanContacts();this.prepareEnvironment();this.section?.updateJunctions(0);this.updateScenarioState();this.record();this.version++;}
      return {removed:ids.size};
    }
    cleanup(){for(const m of this.live())if(!this.C.getVolume(m.id))this.eraseCell(m.id);}
    countDeath(cause,m){
      if(!m||m.deathCounted)return;m.deathCounted=true;
      const keys=DEATH_COUNTERS[cause];if(keys)this.counters[keys[1]]++;
      if(cause==='kill'&&m.state==='abnormal')this.counters.abnormalKills++;
      if(cause==='environment'){if(m.state==='normal')this.counters.normalEnvironmentDeaths++;if(m.state==='abnormal')this.counters.abnormalEnvironmentDeaths++;}
      if(cause==='kill'){
        this.deathEffects.push({id:m.id,birth:m.birth,cause,x:m.x,y:m.y,radius:Math.sqrt((m.deathFinalArea||m.deathArea||1)/Math.PI),startedAt:this.C.time,duration:48});
        if(this.deathEffects.length>128)this.deathEffects.shift(); // Temporary particles only; full death accounting is never truncated.
      }
      if(m.deathRecord){
        m.deathRecord.clearedAt=this.C.time;
        // Completion order differs from onset order. Keep a bounded display
        // buffer rather than sorting the full lifetime ledger every frame.
        this.recentClearances.push(m.deathRecord);if(this.recentClearances.length>8)this.recentClearances.shift();
      }
      this.log('removed',m.id,0,{cause,birth:m.birth,startedAt:m.deathStartedAt});
    }
    deathSummary(){
      return Object.fromEntries(Object.entries(DEATH_COUNTERS).map(([cause,[start,end]])=>[cause,{started:this.counters[start],clearing:this.counters[start]-this.counters[end]-this.manualDeathRemovals[cause],cleared:this.counters[end]}]));
    }
    growTarget(m,desired,amount){
      if(amount<=0||m.target>=desired)return;
      let available=1,ceiling=desired;
      if(this.section){
        // A compressed body must first obtain real space. Otherwise its target
        // mass raises MIN_AREA above its footprint and pins every neighbour in
        // a confluent sheet. Keep a compression margin for sequential copies;
        // do not remove existing mass or relax nuclei/topology to unjam cells.
        const area=this.C.getVolume(m.id),fraction=m.sectionFraction,ratio=area/Math.max(1,m.target*fraction);
        available=clamp((ratio-.9)/.1);
        ceiling=Math.min(desired,area/(.9*fraction));
      }
      m.target+=Math.min(Math.max(0,ceiling-m.target),amount*available);
    }
    biology(dt){
      this.deathEffects=this.deathEffects.filter(e=>this.C.time-e.startedAt<e.duration);
      const live=this.live();
      for(const m of live){
        m.age+=dt;
        m.activation=Math.max(0,m.activation-dt);m.recruitment=Math.max(0,m.recruitment-dt);
        if(m.dying){
          m.deathElapsed+=dt;
          if(m.deathCause==='kill'){
            m.deathProgress=clamp(m.deathElapsed/96);m.deathPhase=m.deathElapsed<28?'rounding':'swelling';
            const t=clamp((m.deathElapsed-24)/72),swelling=t*t*(3-2*t);
            m.target=m.deathArea*(1+.32*swelling)/(this.section?m.sectionFraction:1);
            if(m.deathElapsed>=96){m.deathPhase='rupture';this.eraseCell(m.id);continue;}
          }else{
            m.target=Math.max(0,m.target-dt*Math.max(1.8*this.scale*this.scale,m.base*.025));
            m.deathProgress=clamp(1-this.C.getVolume(m.id)/Math.max(1,m.deathArea));
          }
          this.updateMechanics(m);if(this.C.getVolume(m.id)<=3*this.scale*this.scale)this.eraseCell(m.id);continue;
        }
        this.transformation(m,dt);
        if(m.kind===TUMOR){
          const hazard=this.settings.apoptosis/100/1000;
          if(this.C.random()<1-Math.exp(-hazard*dt)){this.beginDeath(m.id,'spontaneous');continue;}
          this.growTarget(m,m.base,this.settings.growth*m.genome.proliferation*m.fitness*(1-m.stress)*dt*this.scale*this.scale);
          if(this.settings.growth>0&&m.target>=m.base&&this.C.getVolume(m.id)>=m.base*.9*(this.section?m.sectionFraction:1)&&m.age>100)this.divide(m.id);
        }else if(m.kind===IMMUNE){
          const expanding=m.activation>0&&m.divisionsLeft>0&&this.settings.immuneGrowth>0;
          const desired=expanding?m.base*1.7:m.base;
          if(m.target<desired)this.growTarget(m,desired,dt*this.scale*this.scale*(expanding?this.settings.immuneGrowth:.8)*m.fitness*(1-m.stress));
          else if(!expanding&&m.target>m.base)m.target=Math.max(m.base,m.target-dt*.3*this.scale*this.scale);
          if(expanding&&m.fitness>.25&&m.target>=desired&&this.C.getVolume(m.id)>=desired*.88*(this.section?m.sectionFraction:1)&&m.age>120)this.divide(m.id);
        }else if(m.target<m.base)this.growTarget(m,m.base,dt*.8*this.scale*this.scale*m.fitness);
        this.updateMechanics(m);
      }
    }
    components(id){
      const remaining=new Set();for(const [p,cid] of this.C.pixels())if(cid===id)remaining.add(this.C.grid.p2i(p));
      const parts=[];while(remaining.size){const seed=remaining.values().next().value,queue=[seed],part=[];remaining.delete(seed);while(queue.length){const i=queue.pop();part.push(i);for(const n of (this.section?this.faces[i]:this.neighbors[i]))if(remaining.delete(n))queue.push(n);}parts.push(part);}return parts;
    }
    divide(id){
      const m=this.cells[id];if(!m||m.dying||m.state==='abnormal'||this.C.getVolume(id)<80*this.scale*this.scale||(m.kind===IMMUNE&&m.divisionsLeft<=0))return 0;
      // Relabelling existing cytoplasm is not a new protrusion. Preserve its Act
      // age instead of letting GridManipulator turn the whole daughter red.
      const activity=[];for(const [p,cid] of this.C.pixels())if(cid===id){const i=this.C.grid.p2i(p);activity.push([i,this.act.pxact(i)]);}
      const restoreActivity=()=>{for(const [i,a] of activity)this.act.setActivity(i,a);};
      const parentTarget=m.target,parentFraction=m.sectionFraction,parentArea=this.C.getVolume(id),divisionX=m.x,divisionY=m.y;
      this.C.stat_values={};const child=this.wrap?this.gm.divideCellTorus(id):this.gm.divideCell(id);
      this.refreshPositions();const daughter=this.cells[child],nuclei=this.section&&daughter?[this.section.findNucleus(m,activity.map(x=>x[0])),this.section.findNucleus(daughter,activity.map(x=>x[0]))]:null;
      if(!this.C.getVolume(child)||this.components(id).length!==1||this.components(child).length!==1||(nuclei&&nuclei.some(p=>!p))){
        const points=[...this.C.pixels()].filter(([,cid])=>cid===child).map(([p])=>p);for(const p of points)this.C.setpix(p,id);delete this.cells[child];this.contacts.delete(child);restoreActivity();this.C.stat_values={};this.refreshPositions();return 0;
      }
      restoreActivity();
      this.section?.forget(id);
      const parentBirth=m.birth,generation=m.generation+1,left=m.divisionsLeft===null?null:m.divisionsLeft-1,genome=m.genome?{...m.genome}:null,damage=m.damage*.5;
      for(const c of [m,daughter]){
        c.target=this.section?parentTarget*this.C.getVolume(c.id)/parentArea:this.C.getVolume(c.id);c.sectionFraction=parentFraction;c.age=0;c.damage=damage;c.targetID=0;c.phase='search';c.generation=generation;c.clone=m.clone;c.parentBirth=parentBirth;c.birth=++this.birthSerial;c.divisionsLeft=left;
        c.stress=m.stress;c.fitness=m.fitness;c.oxygen=m.oxygen;c.glucose=m.glucose;c.acid=m.acid;c.adversity=m.adversity;c.activation=m.activation;c.recruitment=c===m?m.recruitment:0;
        c.state=m.state;c.origin=m.origin;c.abnormalSince=m.abnormalSince;c.abnormalAge=m.abnormalAge;c.transformedAt=m.transformedAt;c.inflammatorySignal=m.inflammatorySignal;c.inflammatoryExposure=m.inflammatoryExposure;c.nucleusStrainX=m.nucleusStrainX;c.nucleusStrainY=m.nucleusStrainY;
        if(genome){c.genome=this.mutate(genome);this.applyGenome(c);}
        if(nuclei){const p=nuclei[c===m?0:1];c.nucleusX=p[0];c.nucleusY=p[1];c.hasNucleus=true;}
        if(this.section)this.section.resetProtrusions(c);this.updateMechanics(c);
      }
      daughter.px=m.px;daughter.py=m.py;
      for(const [key,h] of this.histories)if(h.ctl===id||h.target===id)this.histories.delete(key);
      this.lineage.push({time:this.C.time,parent:parentBirth,children:[m.birth,daughter.birth],ids:[id,child],clone:m.clone,generation,genomes:genome?[{...m.genome},{...daughter.genome}]:null});
      if(this.lineage.length>4000)this.lineage.shift();
      if(m.kind===IMMUNE)this.counters.immuneDivisions++;
      if(m.kind===TUMOR&&this.scenarioState){this.scenarioState.tumorDivisions++;if(this.scenarioState.initial.clones.includes(m.clone)&&this.scenarioDistance(divisionX,divisionY)>55)this.scenarioState.distalDivisions++;}
      this.counters.divisions++;this.log('divide',id,child,{generation,clone:m.clone});this.refreshPositions();this.scanContacts();this.immuneInteractions(0);return child;
    }
    mutate(parent){
      const child={...parent};
      for(const key of ['tolerance','proliferation','invasion','antigen'])if(this.C.random()<this.settings.mutation/100){
        const z=Math.sqrt(-2*Math.log(Math.max(1e-12,this.C.random())))*Math.cos(2*Math.PI*this.C.random()),step=this.settings.mutationSize*z;
        const value=key==='antigen'?clamp(child[key]+step):clamp(child[key]*Math.exp(step),.25,3);
        if(value!==child[key])this.counters.mutations++;child[key]=value;
      }
      return child;
    }
    set(name,value){
      if(!(name in DEFAULTS)||!Number.isFinite(value))return;
      if(name==='sectionYield')value=clamp(value,0,.5);
      if(name==='stressMutation'||name==='progression')value=clamp(value,0,20);
      if(name==='inflammation')value=clamp(value,0,10);
      if(name==='immuneSeparation')value=clamp(value,0,3);
      if(name==='tumorMorphology')value=Math.round(clamp(value,0,2));
      if(name==='branchLength')value=clamp(value,1.6,4);
      if(name==='branchStrength')value=clamp(value,0,12);
      if(name==='networkAdhesion')value=clamp(value,0,2);
      if(name==='branching')value=clamp(value,0,3);
      this.settings[name]=value;if(name==='temperature')this.C.conf.T=value;
      this.section?.updateJunctions(0);
      for(const m of this.live())this.updateMechanics(m);
      // Adhesive cohesion is local contact energy, complementary to the secreted field.
      if(name==='cohesion')this.C.conf.J[1][1]=Math.max(2,12-value*5);
    }
    moveCell(id,x,y,{elastic=false,reference=new Map()}={}){
      const cell=this.cells[id];if(!cell||cell.dying)return {steps:0,blocked:true};
      this.refreshPositions();let dx=Math.round(x-cell.x),dy=Math.round(y-cell.y);
      if(this.wrap){if(dx>this.width/2)dx-=this.width;if(dx< -this.width/2)dx+=this.width;if(dy>this.height/2)dy-=this.height;if(dy< -this.height/2)dy+=this.height;}
      let occupied=[...this.C.pixels()].filter(([,cid])=>cid===id).map(([p])=>this.C.grid.p2i(p));
      let steps=0,blocked=false;const displaced=new Set();
      const shift=(sx,sy)=>{
        if(!sx&&!sy)return true;
        const moved=[];for(const i of occupied){let xx=this.xs[i]+sx,yy=this.ys[i]+sy;if(this.wrap){xx=(xx+this.width)%this.width;yy=(yy+this.height)%this.height;}if(xx<0||yy<0||xx>=this.width||yy>=this.height)return false;
          const j=this.C.grid.p2i([xx,yy]),other=this.C.pixti(j);if(other&&other!==id){
            if(!elastic||!this.section||!globalThis.CellLabInsertion)return false;
            const result=CellLabInsertion.shift(this,id,sx,sy,occupied,reference);if(!result.ok)return false;
            for(const other of result.changed)displaced.add(other);occupied=result.moved;steps++;return true;
          }moved.push(j);
        }
        const next=new Set(moved),activity=occupied.map(i=>this.act.pxact(i));
        // Add before removing so the cell ID and volume bookkeeping survive.
        for(const j of moved)this.C.setpixi(j,id);
        for(const i of occupied)if(!next.has(i)){this.C.setpixi(i,0);this.act.setActivity(i,0);}
        for(let k=0;k<moved.length;k++)this.act.setActivity(moved[k],activity[k]);
        occupied=moved;steps++;return true;
      };
      const distance=Math.max(Math.abs(dx),Math.abs(dy));let doneX=0,doneY=0;
      for(let k=1;k<=distance;k++){
        const xx=Math.round(dx*k/distance),yy=Math.round(dy*k/distance);
        const sx=xx-doneX,sy=yy-doneY;
        if(!shift(sx,0)){blocked=true;break;}if(cell.hasNucleus)cell.nucleusX=(cell.nucleusX+sx+this.width)%this.width;
        if(!shift(0,sy)){blocked=true;break;}if(cell.hasNucleus)cell.nucleusY=(cell.nucleusY+sy+this.height)%this.height;doneX=xx;doneY=yy;
      }
      for(const [key,h] of this.histories)if(h.ctl===id||h.target===id||displaced.has(h.ctl)||displaced.has(h.target))this.histories.delete(key);
      this.C.stat_values={};this.refreshPositions();this.scanContacts();this.section?.updateJunctions(0);
      // Manual movement updates contact geometry, not stochastic search,
      // recognition, damage or biological clocks while the gesture is held.
      for(const m of this.live())if(m.targetID&&(m.id===id||displaced.has(m.id)||m.targetID===id||displaced.has(m.targetID)||!this.contacts.get(m.id)?.has(m.targetID))){m.targetID=0;m.phase=m.dying?'dying':'search';this.updateMechanics(m);}
      if(displaced.size)this.prepareEnvironment();this.version++;
      return {steps,blocked,displaced:displaced.size,x:cell.x,y:cell.y};
    }
    pulse(x,y,channel='danger'){if(SIGNALS.includes(channel))this.fields[channel].deposit(x/this.fieldScale,y/this.fieldScale,8);}
    mechanicalStep(){
      if(this.C.borderpixels.length)this.C.timeStep();else this.C.time++;
      this.cleanup();this.refreshPositions();this.scanContacts();
      if(this.section)this.section.update(1);
    }
    biologicalStep(){
      if(this.C.time%4===0)this.updateMetabolism(4);
      this.immuneInteractions(1);this.biology(1);
      if(this.C.time%4===0){this.updateSignals(4);this.updatePolarity(4);}
      this.updateScenarioState();
      if(this.C.time%30===0)this.record();
    }
    advance(steps){for(let n=0;n<steps;n++){this.mechanicalStep();if(this.C.time%4===0)this.updateEnvironment(4);this.biologicalStep();}}
    async advanceAsync(steps,backend){for(let n=0;n<steps;n++){this.mechanicalStep();if(this.C.time%4===0){this.prepareEnvironment();await backend.step(this,4);}this.biologicalStep();}}
    initializeScenario(){
      if(!['oncogenesis','cold','hot'].includes(this.scene))return;
      const live=this.live(),tumors=live.filter(m=>m.kind===TUMOR);
      this.scenarioState={initial:{normal:live.filter(m=>m.kind===NORMAL).length,tumor:tumors.length,immune:live.filter(m=>m.kind===IMMUNE).length,antigenPositive:tumors.filter(m=>m.antigen).length,clones:tumors.map(m=>m.clone)},tumorDivisions:0,distalDivisions:0,peakTumor:tumors.length,everTumor:tumors.length>0,clearanceAt:null};
    }
    scenarioDistance(x,y){return Math.hypot(x/this.scale-this.worldWidth/2,y/this.scale-this.worldHeight/2);}
    updateScenarioState(){
      if(this.maze)for(const racer of this.maze.racers){const m=this.cells[racer.id];if(racer.arrivedAt===null&&m?.birth===racer.birth&&!m.dying&&Math.hypot((m.nucleusX??m.x)-this.maze.cx,(m.nucleusY??m.y)-this.maze.cy)<=this.maze.goalRadius){racer.arrivedAt=this.C.time;this.maze.arrivals.push({number:racer.number,time:this.C.time});this.log('maze-arrival',m.id,0,{number:racer.number});}}
      const state=this.scenarioState;if(!state)return;const tumors=this.live().filter(m=>m.kind===TUMOR).length;
      state.peakTumor=Math.max(state.peakTumor,tumors);
      if(tumors){state.everTumor=true;state.clearanceAt=null;}
      else if(state.everTumor&&state.clearanceAt===null)state.clearanceAt=this.C.time;
    }
    scenarioReport(){
      const state=this.scenarioState;if(!state)return null;const live=this.live(),tumors=live.filter(m=>m.kind===TUMOR),active=tumors.filter(m=>!m.dying);
      const far=active.filter(m=>state.initial.clones.includes(m.clone)&&this.scenarioDistance(m.x,m.y)>55).length;
      const elapsed=state.clearanceAt===null?0:this.C.time-state.clearanceAt,c=this.counters,abnormal=live.filter(m=>m.state==='abnormal'&&!m.dying).length;
      const maxAdversity=Math.max(0,...live.filter(m=>!m.dying).map(m=>m.adversity));
      let phase='',achieved=false;
      if(this.scene==='oncogenesis'){
        achieved=active.length>0&&state.tumorDivisions>0;
        phase=achieved?'新生肿瘤克隆扩增':active.length?'肿瘤已发生':c.malignantTransitions?'肿瘤已出现，当前无存活肿瘤':c.abnormalInitiations?'已发生异常中间态':maxAdversity>.08?'环境压力累积':'局部资源消耗';
      }else if(this.scene==='cold'){
        achieved=far>0&&state.distalDivisions>0&&active.length>state.initial.tumor;
        phase=achieved?'原灶外播散并增殖':far?'肿瘤向原灶外扩散':state.tumorDivisions?'原发灶扩增':'低免疫浸润的原发灶';
        if(!tumors.length)phase='当前区域肿瘤已消失';
      }else{
        achieved=state.everTumor&&!tumors.length&&elapsed>=150&&c.kills>0;
        phase=achieved?'当前区域持续清除':!tumors.length&&state.everTumor?'清除后继续观察':!active.length&&tumors.length?'靶细胞凋亡清除中':c.kills?'免疫清除进行中':c.recognitions?'接触识别与招募':'浸润与接触扫描';
      }
      const preset=PRESETS[this.scene],baseline={...DEFAULTS,...preset.settings};
      return {label:preset.label,description:preset.description,profile:{environment:preset.environmentProfile||'uniform',founderTolerance:preset.founderTolerance||1},phase,achieved,initial:{...state.initial,clones:[...state.initial.clones]},tumor:active.length,tumorBodies:tumors.length,abnormal,farTumor:far,distalRadius:55,tumorDivisions:state.tumorDivisions,distalDivisions:state.distalDivisions,peakTumor:state.peakTumor,clearanceAt:state.clearanceAt,clearanceElapsed:elapsed,maxAdversity,customized:Object.keys(DEFAULTS).some(k=>this.settings[k]!==baseline[k])};
    }
    populationRow(){const counts=[0,0,0,0];let px=0,py=0,n=0,abnormal=0;for(const m of this.live()){counts[m.kind]++;if(m.state==='abnormal')abnormal++;if(!m.dying){px+=m.px;py+=m.py;n++;}}
      return {time:this.C.time,normal:counts[1]-abnormal,abnormal,tumor:counts[2],immune:counts[3],order:n?Math.hypot(px,py)/n:0,...this.counters};
    }
    record(){const row=this.populationRow();if(!sameHistoryRow(this.history.at(-1),row))this.history.push(row);}
    populationHistory(reduced=false){
      let rows=this.history;
      if(reduced){
        // Rebuild once per archived sample, not for every render/snapshot.
        if(this.historyCache?.length!==rows.length||this.historyCache?.last!==rows.at(-1))this.historyCache={length:rows.length,last:rows.at(-1),rows:sampleHistory(rows)};
        rows=this.historyCache.rows;
      }
      const result=rows.slice(),current=this.populationRow();
      if(!sameHistoryRow(result.at(-1),current))result.push(current);
      return result;
    }
    snapshot(){
      this.refreshPositions();const grid=new Uint16Array(this.width*this.height),activity=new Uint8Array(grid.length),walls=new Uint8Array(grid.length);let orphans=0;
      for(let q=0;q<grid.length;q++){const i=this.positions[q],id=this.C.grid.pixti(i);grid[q]=id;const m=this.cells[id];if(m)activity[q]=Math.min(255,Math.round(this.act.pxact(i)/this.C.conf.MAX_ACT[m.kind]*255));else if(id){if(this.C.cellKind(id)===WALL)walls[q]=1;else orphans++;}}
      const cells=this.live().map(m=>({id:m.id,kind:m.kind,x:m.x,y:m.y,px:m.px,py:m.py,area:this.C.getVolume(m.id),target:m.target,antigen:m.antigen,antigenLevel:m.antigenLevel,damage:m.damage,dying:m.dying,deathCause:m.deathCause,phase:m.phase,targetID:m.targetID,age:m.age,genome:m.genome?{...m.genome}:null,clone:m.clone,generation:m.generation,divisionsLeft:m.divisionsLeft,activation:m.activation,recruitment:m.recruitment,oxygen:m.oxygen,glucose:m.glucose,acid:m.acid,stress:m.stress,fitness:m.fitness,confinement:m.confinement}));
      for(const c of cells){const m=this.cells[c.id];for(const key of ['sectionFraction','sectionPressure','planarTarget','offPlaneTarget','hasNucleus','nucleusX','nucleusY','nucleusRadius','birth','nucleusStrainX','nucleusStrainY','state','origin','abnormalSince','abnormalAge','transformedAt','adversity','immuneCue','inflammatorySignal','inflammatoryExposure','morphologyMode','branchCount','networkDegree','deathStartedAt','deathPhase','deathProgress','deathIntact'])c[key]=m[key];}
      const fields={};for(const [key,f] of Object.entries(this.fields))fields[key]={width:f.width,height:f.height,values:f.values.slice()};
      const history=this.populationHistory(true),historySamples=this.history.length+(history.at(-1)===this.history.at(-1)?0:1);
      const maze=this.maze?{...this.maze,racers:this.maze.racers.map(r=>({...r,alive:this.cells[r.id]?.birth===r.birth&&!this.cells[r.id].dying})),arrivals:this.maze.arrivals.map(a=>({...a}))}:null;
      return {kernel:this.kernel,width:this.width,height:this.height,worldWidth:this.worldWidth,worldHeight:this.worldHeight,refinement:this.scale,fieldScale:this.fieldScale,fieldMask:this.fields.oxygen.blocked.slice(),scene:this.scene,scenario:this.scenarioReport(),maze,sources:this.sources.map(s=>({...s})),boundary:this.boundary,time:this.C.time,seed:this.seedValue,settings:{...this.settings},counters:{...this.counters},manualDeathRemovals:{...this.manualDeathRemovals},deaths:this.deathSummary(),recentDeaths:this.deathHistory.slice(-8).map(d=>({...d})),recentClearances:this.recentClearances.map(d=>({...d})),deathEffects:this.deathEffects.map(e=>({...e})),grid,activity,walls,orphans,cells,fields,history,historySamples,events:this.events.slice(-12)};
    }
  }
  globalThis.CellLab={Simulation,SignalField,StepClock,DEFAULTS,PRESETS,BODY_COLORS,TYPE_NAMES,NORMAL,TUMOR,IMMUNE,WALL,sampleHistory,randomSettings,RANDOM_RANGES};
})();
