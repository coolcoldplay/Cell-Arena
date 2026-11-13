/* Artistoo extensions. Biology, signal transport, and pacing are independent of rendering. */
(() => {
  'use strict';
  const NORMAL=1, TUMOR=2, IMMUNE=3, WALL=4, FIELD_SCALE=4;
  const DEATH_COUNTERS={spontaneous:['apoptosisStarted','apoptosis'],kill:['killStarted','kills'],environment:['environmentStarted','environment'],lifespan:['lifespanStarted','lifespan']};
  const DEFAULTS={normalMotility:.08,tumorMotility:.7,immuneMotility:1,chemotaxis:1.6,alignment:.8,cohesion:1,repulsion:.7,immuneSeparation:1,noise:.6,halfLife:140,growth:.8,apoptosis:8,antigen:65,kill:1,temperature:12,supply:1.8,metabolism:1,escape:2,recruitment:1,immuneGrowth:.35,immuneDivisions:3,mutation:6,mutationSize:.16,sectionYield:.35,stressMutation:1,inflammation:0,progression:1,tumorMorphology:0,branchLength:2.8,branchStrength:5,networkAdhesion:1,branching:1};
  const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
  Object.assign(DEFAULTS,{normalSupport:0,immuneKillLimit:10});
  Object.assign(DEFAULTS,{cycleCoupling:1,reserveCapacity:80,replicationStress:1,dnaRepair:1,checkpointIntegrity:1,traitCost:.45,normalRepair:.25,normalDivisions:4});
  Object.assign(DEFAULTS,{stemFraction:20,stemSymmetry:30,stemRenewal:60,stemCycleSlowdown:1.35,stemRepair:1.4,stemPlasticity:.25,tumorProgenyLimit:0});
  const MODEL_REVISION='2026-11-contact-learning-angiogenesis-4';
  Object.assign(DEFAULTS,{antigenLength:6,initialImmuneReady:65,primingRate:1,checkpointStrength:1});
  Object.assign(DEFAULTS,{immuneLearning:1,immuneLearningTime:100,immuneLearningLimit:3,angiogenesis:1,angiogenicSecretion:1,angiogenicThreshold:.012,angiogenicHalfLife:400,angiogenicHypoxia:.55,tumorVesselPenalty:.75});
  // Vascular parameters are phenomenological MCS rates, not clinical estimates.
  Object.assign(DEFAULTS,{vesselCount:0,vesselRadius:11,vesselSupply:1,vesselDependence:45,vesselImmuneRate:1,vesselImmuneHealth:60,vesselPassage:1,vesselRepair:1,vesselDivisions:4,vesselLifespan:18000,vesselInflammation:1,tumorIntravasation:1});
  // Dimensionless phase-specific uptake and expenditure, not measured ATP units.
  const PHASE_RESOURCE={G0:[.65,.65,.6,.48,.18],G1:[1.1,1.3,1.2,.85,.8],S:[1.25,1.15,1.0,.9,1.05],G2:[1.2,1.1,1.0,.8,.65],M:[1.3,1.15,1.1,1.15,.3]};
  // Phenomenological MCS parameters; not hours or molecular concentrations.
  Object.assign(DEFAULTS,{tumorCycle:240,tumorQuiescence:1,immuneCycle:220,antigenMemory:900,il2Secretion:1,il2HalfLife:180,exhaustionRate:1});
  Object.assign(DEFAULTS,{normalMutationGain:2,tumorMutationGain:2,mutationBias:0,antigenStressGain:.5,contactEscape:.1,signalEscape:.05,evolutionMemory:800});
  Object.assign(DEFAULTS,{damagePolarization:1,damageDeactivation:1,suppressiveSecretion:1,suppressionStrength:1,immuneRegulationMemory:400,suppressionRecovery:1});
  const newCycle=()=>({phase:'G0',progress:0,entry:0,blockedFor:0,arrest:'',drive:0,pressure:0,retry:0});
  const CYCLE_STAGES=['G1','S','G2','M'],CYCLE_FRACTIONS={G1:.4,S:.35,G2:.18,M:.07};
  // Exploratory defaults, deliberately narrower than the manual slider limits.
  // A separate seeded generator makes configuration reproducible without
  // consuming the CPM stream. These are model ranges, not biological calibration.
  const RANDOM_RANGES={normalMotility:[.05,.25,.05],tumorMotility:[.35,1.2,.05],immuneMotility:[.75,1.4,.05],chemotaxis:[.7,2.2,.1],alignment:[.1,1,.1],cohesion:[.6,1.6,.1],repulsion:[.4,1.2,.1],immuneSeparation:[.7,1.7,.1],noise:[.35,1,.05],halfLife:[80,220,10],growth:[.5,1.4,.05],apoptosis:[0,8,1],antigen:[30,95,5],kill:[.6,1.8,.1],temperature:[8,18,1],supply:[1.6,2.8,.05],metabolism:[.6,1.1,.05],escape:[1.5,3.5,.1],recruitment:[.6,2,.1],immuneGrowth:[.15,.65,.05],immuneDivisions:[2,4,1],mutation:[2,15,1],mutationSize:[.05,.2,.01],sectionYield:[.25,.4,.01],stressMutation:[.2,2,.1],inflammation:[0,1.5,.1],progression:[.5,3,.1],tumorMorphology:[0,2,1],branchLength:[2,3.2,.1],branchStrength:[3,7,.5],networkAdhesion:[.4,1.4,.1],branching:[.5,1.5,.1]};
  Object.assign(RANDOM_RANGES,{tumorCycle:[180,320,20],tumorQuiescence:[.6,1.4,.1],immuneCycle:[160,280,20],antigenMemory:[600,1400,100],il2Secretion:[.6,1.5,.1],il2HalfLife:[120,260,20],exhaustionRate:[.5,1.5,.1]});
  Object.assign(RANDOM_RANGES,{normalMutationGain:[1,5,1],tumorMutationGain:[1,5,1],mutationBias:[0,0,1],antigenStressGain:[.2,1,.1],contactEscape:[.05,.3,.05],signalEscape:[.02,.12,.02],evolutionMemory:[600,1200,100]});
  Object.assign(RANDOM_RANGES,{damagePolarization:[.5,1.5,.1],damageDeactivation:[.5,1.5,.1],suppressiveSecretion:[.5,1.5,.1],suppressionStrength:[.5,1.5,.1],immuneRegulationMemory:[200,600,50],suppressionRecovery:[.5,1.5,.1]});
  // Random development experiments stay near competing, viable regimes rather
  // than combining unrelated extremes or pre-planting malignant cells.
  Object.assign(RANDOM_RANGES,{supply:[2.65,2.8,.05],metabolism:[1,1.1,.05],stressMutation:[3,6,.5],progression:[1.5,4,.5],inflammation:[.6,1.6,.1],normalMutationGain:[3,6,.5],tumorMutationGain:[3,7,.5],growth:[1,1.4,.05],tumorMotility:[.9,1.3,.05],normalMotility:[.05,.15,.05],immuneMotility:[1,1.4,.05],kill:[1,1.8,.1],recruitment:[1,2,.1],immuneGrowth:[.3,.65,.05],immuneDivisions:[3,4,1],immuneCycle:[180,240,20],antigenMemory:[900,1500,100],tumorCycle:[160,220,20],chemotaxis:[1.5,2.5,.1],escape:[2.5,3.5,.1],mutation:[8,16,1],mutationSize:[.12,.24,.02],antigenStressGain:[.5,1.5,.1],contactEscape:[.2,.8,.1],signalEscape:[.1,.4,.05],damagePolarization:[2.5,4.5,.25],damageDeactivation:[.7,1.5,.1],suppressiveSecretion:[1,1.8,.1],suppressionStrength:[.8,1.6,.1],suppressionRecovery:[1,2.5,.25],immuneRegulationMemory:[150,350,50],tumorMorphology:[0,1,1]});
  Object.assign(RANDOM_RANGES,{normalSupport:[10,25,5],immuneKillLimit:[8,15,1]});
  Object.assign(RANDOM_RANGES,{cycleCoupling:[.7,1,.1],reserveCapacity:[120,160,10],replicationStress:[.7,1.3,.1],dnaRepair:[.7,1.3,.1],checkpointIntegrity:[.7,1,.1],traitCost:[.2,.4,.1],normalRepair:[.1,.25,.05],normalDivisions:[3,5,1]});
  Object.assign(RANDOM_RANGES,{stemFraction:[10,30,5],stemSymmetry:[20,40,5],stemRenewal:[45,65,5],stemCycleSlowdown:[1.15,1.6,.05],stemRepair:[1.1,1.6,.1],stemPlasticity:[.1,.5,.05],tumorProgenyLimit:[0,0,1]});
  Object.assign(RANDOM_RANGES,{vesselCount:[2,3,1],vesselRadius:[10,13,1],vesselSupply:[.8,1.3,.1],vesselDependence:[15,25,5],vesselImmuneRate:[.6,1.4,.1],vesselImmuneHealth:[40,80,10],vesselPassage:[.8,1.4,.1],vesselRepair:[.7,1.3,.1],vesselDivisions:[3,5,1],vesselLifespan:[16000,24000,1000],vesselInflammation:[.5,1.2,.1],tumorIntravasation:[.6,1.4,.1]});
  Object.assign(RANDOM_RANGES,{antigenLength:[6,6,2],initialImmuneReady:[40,80,5],primingRate:[.6,1.5,.1],checkpointStrength:[.7,1.3,.1]});
  // Let initiated clones leave a hostile niche before their own acid production
  // overwhelms it. Physical passage, resource gates and death stay unchanged.
  Object.assign(RANDOM_RANGES,{metabolism:[.9,1,.05],progression:[3,5,.5],normalMotility:[.15,.25,.05],cohesion:[.35,.6,.05],sectionYield:[.38,.42,.01],tumorMotility:[1.25,1.5,.05],tumorMorphology:[1,1,1],escape:[3.5,4.5,.25],chemotaxis:[2.2,2.8,.1]});
  // Onset calibration: avoid making the abstract injury-to-suppression route
  // dominate before antigen-specific surveillance. This is not a Treg census.
  Object.assign(RANDOM_RANGES,{damagePolarization:[.5,1.5,.25],damageDeactivation:[.7,1.3,.1],suppressiveSecretion:[.75,1.25,.25],suppressionStrength:[.8,1.2,.1],immuneRegulationMemory:[400,800,100]});
  Object.assign(RANDOM_RANGES,{immuneLearning:[.7,1.3,.1],immuneLearningTime:[60,100,20],immuneLearningLimit:[3,3,1],angiogenesis:[.7,1.3,.1],angiogenicSecretion:[.8,1.2,.1],angiogenicThreshold:[.006,.012,.002],angiogenicHalfLife:[360,440,40],angiogenicHypoxia:[.5,.6,.05],tumorVesselPenalty:[.6,.8,.05]});
  function randomSettings(seed){
    let state=seed>>>0;
    const random=()=>{state=(state+0x6d2b79f5)>>>0;let n=Math.imul(state^(state>>>15),1|state);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};
    return Object.fromEntries(Object.entries(RANDOM_RANGES).map(([key,[lo,hi,step]])=>[key,Number((lo+Math.floor(random()*(Math.round((hi-lo)/step)+1))*step).toFixed(2))]));
  }
  function ecologyLayout(seed,randomized){
    let state=(seed^0x58a1c9e7)>>>0;
    const random=()=>{state=(state+0x6d2b79f5)>>>0;let n=Math.imul(state^(state>>>15),1|state);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};
    const niches=randomized?[
      {x:.4+.2*random(),y:.4+.2*random(),rx:.22+.04*random(),ry:.26+.05*random(),floor:.20+.05*random()},
      ...Array.from({length:2},()=>({x:.24+.5*random(),y:.25+.5*random(),rx:.11+.05*random(),ry:.14+.06*random(),floor:.25+.10*random()}))
    ]:[{x:.5,y:.5,rx:.25,ry:.30,floor:.22},{x:.28,y:.38,rx:.13,ry:.18,floor:.28},{x:.70,y:.68,rx:.14,ry:.15,floor:.25}];
    const patrols=randomized?Array.from({length:16},(_,i)=>({x:.18+(i%4)*.213+(random()-.5)*.03,y:.2+Math.floor(i/4)*.2+(random()-.5)*.03,key:random()})).sort((a,b)=>a.key-b.key).slice(0,12+Math.floor(random()*5)).map(p=>[p.x,p.y]):Array.from({length:12},(_,i)=>[.2+(i%4)*.2,.25+Math.floor(i/4)*.25]);
    return {niches,patrols};
  }
  const POPULATIONS=['normal','abnormal','tumor','immune','endothelial'];
  const POPULATION_STATES=['normalLiving','normalDying','abnormalPositive','abnormalNegative','abnormalDying','tumorPositive','tumorNegative','tumorDying','immuneResting','immuneActive','immuneSuppressive','immuneDying','endothelialLiving','endothelialDying'];
  const sameHistoryRow=(a,b)=>!!a&&Object.keys(b).every(key=>a[key]===b[key]);
  // Only the display is reduced. Keep each population's minimum and maximum
  // in each time bin, plus both endpoints, in their original temporal order.
  function sampleHistory(rows,bins=256){
    const keys=[...POPULATIONS,...POPULATION_STATES.filter(k=>rows.some(r=>Object.hasOwn(r,k)))],stride=keys.length*2;
    bins=Math.min(bins,Math.max(1,Math.floor(2048/stride)));
    if(rows.length<=bins*stride+2)return rows.slice();
    const first=rows[0].time,span=Math.max(1,rows.at(-1).time-first),extrema=new Int32Array(bins*stride).fill(-1);
    for(let i=0;i<rows.length;i++){
      const offset=Math.min(bins-1,Math.floor((rows[i].time-first)/span*bins))*stride;
      for(let k=0;k<keys.length;k++){const key=keys[k],lo=offset+2*k,hi=lo+1;
        if(extrema[lo]<0||(rows[i][key]||0)<(rows[extrema[lo]][key]||0))extrema[lo]=i;
        if(extrema[hi]<0||(rows[i][key]||0)>(rows[extrema[hi]][key]||0))extrema[hi]=i;
      }
    }
    const indices=new Set([0,rows.length-1]);for(const i of extrema)if(i>=0)indices.add(i);
    return [...indices].sort((a,b)=>a-b).map(i=>rows[i]);
  }
  const SIGNALS=['cohesion','danger','trail','il2','normalDamage','inhibition'];
  const PRESETS={
    oncogenesis:{label:'肿瘤发生发展',environmentProfile:'mosaic',founderTolerance:2.3,description:'密铺正常组织与 12 颗分散免疫细胞，从零肿瘤开始。三处供给较弱的区域与健康边缘形成差异；癌前、癌变、免疫清除、抑制与恢复相互竞争，逃逸克隆可能再次扩增。没有定时转变或预设结局。',settings:{supply:2.7,metabolism:1.05,inflammation:1.3,stressMutation:4.5,progression:2.5,normalMutationGain:5,tumorMutationGain:6,growth:1.3,tumorCycle:170,apoptosis:3,tumorMotility:1.1,normalMotility:.1,cohesion:1.1,escape:3,immuneMotility:1.3,immuneGrowth:.5,immuneDivisions:3,immuneCycle:200,antigenMemory:1200,kill:1.4,recruitment:1.4,chemotaxis:1.8,mutation:12,mutationSize:.2,antigenStressGain:1.2,contactEscape:.6,signalEscape:.3,damagePolarization:3.5,damageDeactivation:1.2,suppressiveSecretion:1.5,suppressionStrength:1.3,suppressionRecovery:1.5,immuneRegulationMemory:200}},
    random:{label:'随机肿瘤演化',environmentProfile:'mosaic',founderTolerance:2.3,description:'随机化的密铺正常组织、12–16 颗内部免疫细胞与三处弱供给区域。参数在发生发展附近抽样，肿瘤必须由局部癌前产生；相同种子和参数可重现开局，结局由局部相互作用产生。',settings:{}},
    cold:{label:'免疫冷肿瘤扩散转移',description:'正常细胞铺满背景，中央嵌入 19 颗低抗原肿瘤，外围仅 3 颗免疫细胞。梭形肿瘤侵袭扩增，压力提高性状变异，部分克隆可能暴露抗原；免疫招募较弱。包含局部侵袭与概率性入血播散，不模拟远处器官定植。',settings:{supply:2.8,metabolism:.65,stressMutation:0,progression:1,growth:1.4,tumorCycle:180,apoptosis:2,tumorMotility:1.5,tumorMorphology:1,normalMotility:.25,cohesion:.4,sectionYield:.4,immuneMotility:.8,antigen:15,kill:1,chemotaxis:.6,recruitment:.35,immuneGrowth:.15,immuneDivisions:2,alignment:.2,noise:.85,mutation:8,normalMutationGain:1,tumorMutationGain:5,antigenStressGain:.3,contactEscape:.15,signalEscape:.1}},
    hot:{label:'免疫热肿瘤应答',description:'正常细胞铺满背景，中央嵌入 37 颗高抗原肿瘤，18 颗免疫细胞分散在病灶周边的组织内。接触识别、招募及 IL-2 扩增支持早期清除；少数存活克隆可能丢失抗原并再次扩增。结局随种子改变，关闭杀伤可作对照。',settings:{supply:2.8,metabolism:.65,stressMutation:0,progression:1,growth:.75,tumorCycle:280,apoptosis:0,tumorMotility:.35,immuneMotility:1.2,antigen:100,kill:2,chemotaxis:2.5,recruitment:2.4,immuneGrowth:.65,immuneDivisions:3,immuneCycle:200,antigenMemory:1200,il2Secretion:1.2,noise:.45,halfLife:180,mutation:2,mutationSize:.05,antigenStressGain:.15,contactEscape:.35,signalEscape:.12}},
    ecosystem:{label:'免疫共培养',settings:{}},
    network:{label:'胶质瘤样分枝成网',settings:{tumorMorphology:2,tumorMotility:.12,branchLength:2.8,branchStrength:5,networkAdhesion:1,growth:.18,apoptosis:0,metabolism:.65,supply:2.6,stressMutation:0,alignment:.15,noise:.35}},
    collective:{label:'群体迁移',settings:{normalMotility:.85,alignment:2,cohesion:1.2,repulsion:.4,noise:.35,growth:0,apoptosis:0}},
    invasion:{label:'肿瘤扩张',settings:{growth:.7,tumorMotility:1,apoptosis:10}},
    maze:{label:'免疫细胞迷宫',description:'圆心持续释放最强招募信号，入口清除信号；开局已建立沿通道扩散的浓度场。6 颗免疫细胞从等距入口出发，仅凭局部梯度与随机探索前进，胞核进入中心终点区计时。',settings:{chemotaxis:3,halfLife:400,immuneMotility:1.4,noise:.5,immuneSeparation:.8,growth:0,immuneGrowth:0,apoptosis:0,metabolism:.3,supply:3,stressMutation:0,inflammation:0,escape:1}},
    stress:{label:'密度与逃逸',settings:{supply:.8,metabolism:1.15,growth:.6,tumorMotility:.9,apoptosis:0,escape:3}},
    surveillance:{label:'癌前监视',settings:{supply:.8,metabolism:1.2,stressMutation:3,progression:.7,kill:2,apoptosis:0}}
  };
  const TYPE_NAMES=['培养液','正常细胞','肿瘤细胞','免疫细胞','实体障碍'];
  const BODY_COLORS=[[239,242,237],[174,184,181],[48,56,65],[190,65,78],[93,108,111]];
  // Preserve a viable background when local vascular exchange is added. The
  // reserve/cycle window lets initiated clones compete before cumulative injury.
  Object.assign(PRESETS.oncogenesis.settings,{normalSupport:20,reserveCapacity:140,traitCost:.3,normalRepair:.15});
  Object.assign(PRESETS.oncogenesis.settings,{metabolism:.95,progression:4,normalMotility:.25,cohesion:.4,sectionYield:.4,tumorMotility:1.5,tumorMorphology:1,escape:4,chemotaxis:2.5});
  Object.assign(PRESETS.cold.settings,{normalSupport:20,initialImmuneReady:25,primingRate:.4});
  Object.assign(PRESETS.hot.settings,{normalSupport:15,initialImmuneReady:95,primingRate:1.4});
  Object.assign(PRESETS.maze.settings,{initialImmuneReady:100});
  Object.assign(PRESETS.oncogenesis.settings,{vesselCount:2,vesselDependence:20});
  Object.assign(PRESETS.oncogenesis.settings,{damagePolarization:1,damageDeactivation:1,suppressiveSecretion:1,suppressionStrength:1,immuneRegulationMemory:600});
  Object.assign(PRESETS.cold.settings,{vesselCount:2,vesselImmuneRate:.35,vesselPassage:.65,vesselDependence:25,tumorIntravasation:1.3});
  Object.assign(PRESETS.hot.settings,{vesselCount:2,vesselImmuneRate:1.3,vesselPassage:1.4,vesselDependence:25,tumorIntravasation:.6});
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
  Object.assign(PRESETS.oncogenesis.settings,{immuneLearningTime:60,immuneSeparation:.5,angiogenicThreshold:.008,angiogenicHalfLife:400});
  Object.assign(PRESETS.hot.settings,{immuneLearningTime:100,angiogenicThreshold:.012});
  Object.assign(PRESETS.cold.settings,{immuneLearning:.7,immuneLearningTime:140,angiogenicThreshold:.012});
  Object.assign(RANDOM_RANGES,{immuneSeparation:[.4,.8,.1]});
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
  // Deformable endothelial rings on an annular basement scaffold. Kind 1 is
  // reused only for CPM mechanics; state=endothelial is a distinct population.
  // This is a 2D vessel cross-section with axial perfusion as a lumped variable,
  // not a blood-flow solver or a model of successful distant colonization.
  class VascularSystem {
    constructor(sim,definitions){
      this.s=sim;this.vessels=[];this.serial=0;this.version=0;this.region=new Uint16Array(sim.C.grid._pixels.length);this.initial=[];
      this.exchange=new Float32Array(sim.fields.oxygen.values.length);this.hostHealth=1;
      Object.assign(sim.counters,{endothelialDeaths:0,endothelialDivisions:0,vascularArrivals:0,extravasations:0,circulationReturns:0,intravasations:0,bloodstreamExports:0,vascularSprouts:0,vascularMaturations:0});
      const locations=[[.23,.27],[.77,.73],[.78,.25],[.22,.76],[.5,.18],[.5,.82]];
      const specs=definitions??locations.slice(0,Math.round(sim.settings.vesselCount)).map(([x,y])=>({x:x*sim.worldWidth,y:y*sim.worldHeight,radius:sim.settings.vesselRadius}));
      for(const spec of specs)this.plan(spec.x*sim.scale,spec.y*sim.scale,spec.radius*sim.scale);
      if(definitions&&this.vessels.length!==definitions.length)throw Error('血管几何无效：需要完整管腔、内皮与血管间距');
      this.initial=this.vessels.map(v=>this.definition(v));
    }
    definition(v){const r=this.s.scale;return {x:v.x/r,y:v.y/r,radius:v.initialRadius/r};}
    delta(x,y,v){let dx=x-v.x,dy=y-v.y;const s=this.s;if(s.wrap){if(dx>s.width/2)dx-=s.width;else if(dx< -s.width/2)dx+=s.width;if(dy>s.height/2)dy-=s.height;else if(dy< -s.height/2)dy+=s.height;}return [dx,dy];}
    distance(x,y,v){const [dx,dy]=this.delta(x,y,v);return Math.sqrt(dx*dx+dy*dy);}
    plan(x,y,radius){
      const s=this.s,wall=7*s.scale,outer=radius+wall;
      if(this.serial>=64||x<outer+2||y<outer+2||x>s.width-outer-3||y>s.height-outer-3||this.vessels.some(v=>this.distance(x,y,v)<outer+v.initialRadius+v.wall+8*s.scale))return null;
      const v={id:++this.serial,x,y,initialRadius:radius,radius,wall,coverage:1,perfusion:1,patency:1,initialMass:0,mass:0,area:Math.PI*radius*radius,cells:[],active:true,quality:1,tumorFraction:0,angiogenicSignal:0,drive:0,parent:0,nascent:false,bornAt:this.s.C.time,nextSprout:0};
      this.vessels.push(v);this.rebuildRegion();return v;
    }
    rebuildRegion(){
      const s=this.s;this.region.fill(0);
      for(const v of this.vessels)if(v.active&&!v.nascent){const reach=Math.max(v.initialRadius*1.8,v.radius)+v.wall+4*s.scale;
        for(let y=Math.max(0,Math.floor(v.y-reach));y<=Math.min(s.height-1,Math.ceil(v.y+reach));y++)for(let x=Math.max(0,Math.floor(v.x-reach));x<=Math.min(s.width-1,Math.ceil(v.x+reach));x++)if(this.distance(x,y,v)<=reach)this.region[s.C.grid.p2i([x,y])]=v.id;
      }this.version++;
    }
    at(id){const v=id?this.vessels[id-1]:null;return v?.active?v:null;}
    reserved(x,y,margin=0){return this.vessels.some(v=>v.active&&this.distance(x,y,v)<=v.initialRadius+v.wall+margin);}
    seedRing(v){
      const s=this.s,n=Math.max(6,Math.round(2*Math.PI*(v.radius+v.wall/2)/(11*s.scale))),groups=Array.from({length:n},()=>[]),outer=v.radius+v.wall;
      for(let y=Math.floor(v.y-outer);y<=Math.ceil(v.y+outer);y++)for(let x=Math.floor(v.x-outer);x<=Math.ceil(v.x+outer);x++){
        const d=this.distance(x,y,v);if(d<v.radius||d>outer)continue;
        const a=(Math.atan2(y-v.y,x-v.x)+2*Math.PI)%(2*Math.PI),j=Math.min(n-1,Math.floor(a/(2*Math.PI)*n));groups[j].push(s.C.grid.p2i([x,y]));
      }
      const made=[];
      for(const points of groups){const id=s.C.makeNewCellID(NORMAL),m=s.cells[id];
        Object.assign(m,{state:'endothelial',origin:'endothelial',name:'血管内皮细胞',vesselID:v.id,divisionsLeft:s.settings.vesselDivisions,endothelialInjury:0,repairProgress:0,age:s.C.random()*s.settings.vesselLifespan*.35,lifespanScale:.8+.4*s.C.random()});
        for(const i of points)s.C.setpixi(i,id);m.base=m.target=points.length;
        if(s.section&&!s.section.initialize(m,points)){for(const prior of [...made,id])s.eraseCell(prior);v.active=false;this.rebuildRegion();return false;}
        s.updateMechanics(m);made.push(id);
      }
      v.cells=made;v.initialMass=made.reduce((sum,id)=>sum+s.cells[id].base,0);v.mass=v.initialMass;s.refreshPositions();return true;
    }
    initialize(){for(const v of this.vessels)this.seedRing(v);this.measure(0);}
    add(x,y,radius){
      const s=this.s,outer=radius+7*s.scale;
      // Explicit user placement is transactional: never silently delete tissue.
      for(let yy=Math.floor(y-outer);yy<=Math.ceil(y+outer);yy++)for(let xx=Math.floor(x-outer);xx<=Math.ceil(x+outer);xx++)if((xx-x)**2+(yy-y)**2<=outer*outer){if(xx<0||yy<0||xx>=s.width||yy>=s.height||s.C.pixt([xx,yy]))return {id:0,reason:'occupied'};}
      const v=this.plan(x,y,radius);if(!v||!this.seedRing(v))return {id:0,reason:'geometry'};
      this.initial.push(this.definition(v));this.measure(0);s.record();s.version++;return {id:v.id,reason:'',vessel:true};
    }
    allowed(src,tgt,a,b){
      if(!this.vessels.length)return true;
      const s=this.s,m=s.cells[a];if(!m||m.dying)return true;
      const own=this.at(m.vesselID),local=this.at(this.region[tgt]);
      if(own){const d=this.distance(s.xs[tgt],s.ys[tgt],own);return d>=Math.max(0,own.radius-s.scale)&&d<=own.radius+own.wall+2*s.scale;}
      if(m.vascularPhase===1){const v=this.at(m.vascularID);if(v)return this.distance(s.xs[tgt],s.ys[tgt],v)<v.radius;}
      if(!local)return true;
      const d=this.distance(s.xs[tgt],s.ys[tgt],local),access=m.vascularID===local.id&&m.vascularPhase>=2;
      // Basement membrane is selective. A grant permits ordinary copy attempts,
      // never overlapping entities or overwriting another cell's nucleus.
      return d>=local.radius+(m.kind===TUMOR?local.wall-2*s.scale:0)||access;
    }
    pointEnergy(i,m){
      if(!m?.vesselID||m.dying)return 0;const v=this.at(m.vesselID);if(!v)return 0;
      const q=(this.distance(this.s.xs[i],this.s.ys[i],v)-v.radius-v.wall/2)/this.s.scale;return .65*q*q;
    }
    energy(src,tgt,a,b){return this.pointEnergy(tgt,this.s.cells[a])-this.pointEnergy(tgt,this.s.cells[b]);}
    sample(m,key){let value=0,n=0;const f=this.s.fields[key];for(const [i,k]of m.fieldBins){value+=f.values[i]*k;n+=k;}return value/Math.max(1,n);}
    angiogenicMix(m){
      const normal=this.sample(m,'angiogenicNormal'),tumor=this.sample(m,'angiogenicTumor'),total=normal+tumor;
      return {normal,tumor,total,fraction:total>1e-9?tumor/total:0};
    }
    sprout(m,parent){
      const s=this.s;
      if(parent.nascent||s.C.time<parent.nextSprout||this.serial>=32||s.settings.angiogenesis<=0)return false;
      const mix=this.angiogenicMix(m);if(mix.total<s.settings.angiogenicThreshold)return false;
      const [dx,dy]=this.delta(m.nucleusX??m.x,m.nucleusY??m.y,parent),length=Math.hypot(dx,dy)||1;
      const radius=8*s.scale,wall=7*s.scale,x=(m.nucleusX??m.x)+dx/length*(radius+wall/2),y=(m.nucleusY??m.y)+dy/length*(radius+wall/2),outer=radius+wall;
      if(x<outer+3||y<outer+3||x>s.width-outer-3||y>s.height-outer-3||this.vessels.some(v=>v.active&&v.id!==parent.id&&this.distance(x,y,v)<outer+v.radius+v.wall+3*s.scale))return false;
      // Reassign an actual daughter after a successful endothelial division.
      // No disk is carved and no tissue is erased or teleported. A nascent loop
      // does not reserve a lumen or supply nutrients until coverage matures.
      const v={id:++this.serial,x,y,radius,initialRadius:radius,wall,coverage:0,perfusion:0,patency:0,initialMass:Math.PI*((radius+wall)**2-radius**2),mass:s.C.getVolume(m.id),area:0,cells:[m.id],active:true,quality:1-s.settings.tumorVesselPenalty*mix.fraction,tumorFraction:mix.fraction,angiogenicSignal:mix.total,drive:0,parent:parent.id,nascent:true,bornAt:s.C.time,nextSprout:s.C.time+1200};
      this.vessels.push(v);m.vesselID=v.id;parent.nextSprout=s.C.time+1200;this.version++;
      s.counters.vascularSprouts++;s.log('vascular-sprout',m.id,0,{vessel:v.id,parent:parent.id,tumorFraction:mix.fraction});return true;
    }
    localGap(m,v){
      const s=this.s,[dx,dy]=this.delta(m.x,m.y,v),a=Math.atan2(dy,dx),r=v.radius+v.wall/2;
      // Follow only the cell's immediate basement-facing edge. A fixed offset
      // incorrectly sampled the enlarged cell itself and hid persistent gaps.
      const end=sign=>{for(let span=.25;span<=1.2;span+=.12){const x=Math.round(v.x+r*Math.cos(a+sign*span)),y=Math.round(v.y+r*Math.sin(a+sign*span)),other=s.cells[s.C.pixt([x,y])];if(other===m)continue;return !other||other.dying||other.vesselID!==v.id;}return false;};
      return [end(-1),end(1)];
    }
    steer(m){
      let v=this.at(m.vesselID||m.vascularID);
      if(!v&&m.kind===TUMOR&&m.genome.invasion>.85&&this.s.settings.tumorIntravasation>0){
        // Invasive adhesion uses only the membrane actually being touched.
        // It helps maintain a local encounter; passage is still stochastic and
        // every displaced pixel must satisfy nuclear/neck/connectivity rules.
        let x=0,y=0;for(const edge of this.s.contacts.get(m.id)?.values()||[]){const ec=this.s.cells[edge.id];if(ec?.vesselID&&!ec.dying){v=this.at(ec.vesselID);x+=edge.nx;y+=edge.ny;}}
        if(v){const length=Math.hypot(x,y)||1;m.px=x/length;m.py=y/length;return true;}
      }
      if(!v)return false;
      const [dx,dy]=this.delta(m.x,m.y,v),d=Math.sqrt(dx*dx+dy*dy)||1,nx=dx/d,ny=dy/d;
      if(m.vascularPhase===3&&d>v.radius+v.wall+(m.maxReach||10*this.s.scale)){
        // Losing the local encounter (including a manual move) cancels entry;
        // permission is not a permanent long-range vessel homing signal.
        m.vascularPhase=0;m.vascularID=0;m.vascularContact=0;return false;
      }
      if(m.vesselID){const [left,right]=this.localGap(m,v),t=(right?1:0)-(left?1:0),radial=clamp((v.radius+v.wall/2-d)/this.s.scale,-1,1);let x=radial*nx-t*ny,y=radial*ny+t*nx;const length=Math.hypot(x,y)||1;m.px=x/length;m.py=y/length;return true;}
      if(m.vascularPhase===1){
        // Luminal crawling has short direction memory; it does not know targets.
        const turn=(this.s.C.random()-.5)*.3,c=Math.cos(turn),q=Math.sin(turn),px=m.px;m.px=px*c-m.py*q;m.py=px*q+m.py*c;
      }else if(m.vascularPhase===2){m.px=nx;m.py=ny;}
      else if(m.vascularPhase>=3){m.px=-nx;m.py=-ny;}
      return true;
    }
    endothelialMetabolism(m,dt){
      // Endothelium is strongly glycolytic. Mild hypoxia is not an automatic
      // death switch. Chronic combined metabolic/inflammatory injury is a proxy.
      const adversity=.15*clamp((.12-m.oxygen)/.12)+.6*clamp((.3-m.glucose)/.3)+.25*clamp((m.acid-.45)/.55);
      m.adversity=adversity;m.fitness=clamp(m.glucose/.35)*(.8+.2*clamp(m.oxygen/.2))*clamp(1-.65*m.acid);
      const inflammation=clamp((this.sample(m,'trail')-.3)/1.7),injury=adversity*adversity/700+this.s.settings.vesselInflammation*inflammation*(.15+.85*adversity)/6000;
      m.endothelialInjury=clamp((m.endothelialInjury||0)+dt*(injury-(adversity<.15&&inflammation<.2?.0005:0)));m.stress=m.endothelialInjury;
      if(m.stress>=1)this.s.beginDeath(m.id,'environment');
    }
    biology(m,dt){
      const s=this.s,v=this.at(m.vesselID);if(!v)return;
      const life=s.settings.vesselLifespan*m.lifespanScale;
      if(life>0&&m.age>life&&s.C.random()<1-Math.exp(-dt*(m.age/life-1)/Math.max(100,life*.1))){if(s.beginDeath(m.id,'lifespan'))m.deathRecord.trigger='endothelial-age';return;}
      s.updateResources(m,dt);if(m.dying)return;
      const mix=this.angiogenicMix(m),drive=s.settings.angiogenesis*Math.max(0,mix.total-s.settings.angiogenicThreshold)/(s.settings.angiogenicThreshold+mix.total),gap=this.localGap(m,v).some(Boolean);
      m.angiogenicExposure=drive>0?Math.min(1000,(m.angiogenicExposure||0)+dt*drive):Math.max(0,(m.angiogenicExposure||0)-dt);
      const growth=s.settings.vesselRepair+drive,canRepair=(gap||drive>0||m.repairProgress>=.4)&&m.divisionsLeft>0&&m.fitness>.45&&m.resources.energy>.25&&m.resources.precursor>.25&&growth>0;
      if(canRepair){
        const c=m.cycle;c.phase=m.repairProgress<.4?'G1':m.repairProgress<.75?'S':m.repairProgress<.93?'G2':'M';c.progress=m.repairProgress;c.arrest='';
        s.growTarget(m,m.base*1.9,dt*.4*s.scale*s.scale*growth*m.fitness);
        m.repairProgress=Math.min(1,m.repairProgress+dt*growth*m.fitness/400);
        if(m.repairProgress>=1&&s.C.getVolume(m.id)>m.base*1.5&&s.C.time%12===0){const child=s.divide(m.id);if(child){m.repairProgress=0;s.cells[child].repairProgress=0;if(m.angiogenicExposure>=160)this.sprout(s.cells[child],v);}else c.arrest='geometry';}
      }else{m.cycle.phase='G0';m.cycle.progress=0;m.cycle.arrest=m.divisionsLeft<=0?'lineage':gap?'reserve':'';m.repairProgress=Math.max(0,(m.repairProgress||0)-dt/200);}
      if(m.target<m.base)s.growTarget(m,m.base,dt*.5*s.scale*s.scale*m.fitness);this.steer(m);s.updateMechanics(m);
    }
    measure(dt){
      const s=this.s;
      for(const v of this.vessels)if(v.active){
        const cells=s.live().filter(m=>m.vesselID===v.id&&!m.dying);v.cells=cells.map(m=>m.id);v.mass=cells.reduce((sum,m)=>sum+s.C.getVolume(m.id),0);
        if(!cells.length){v.perfusion=0;v.coverage=0;v.area=0;v.active=false;this.rebuildRegion();continue;}
        let normal=0,tumor=0;for(const m of cells){const mix=this.angiogenicMix(m);normal+=mix.normal;tumor+=mix.tumor;}
        v.angiogenicSignal=(normal+tumor)/cells.length;v.drive=s.settings.angiogenesis*Math.max(0,v.angiogenicSignal-s.settings.angiogenicThreshold)/(s.settings.angiogenicThreshold+v.angiogenicSignal);
        if(v.drive>0)v.tumorFraction+=((tumor/(normal+tumor||1))-v.tumorFraction)*(1-Math.exp(-dt*v.drive/600));v.quality=1-s.settings.tumorVesselPenalty*v.tumorFraction;
        const boundary=Math.min(v.x,v.y,s.width-1-v.x,s.height-1-v.y)-v.wall-3*s.scale;
        const growthLimit=Math.max(1,Math.min(1.8,boundary/v.initialRadius));
        const target=v.nascent?v.initialRadius:v.initialRadius*clamp(Math.sqrt(v.mass/Math.max(1,v.initialMass)),.25,v.drive>0?growthLimit:Math.max(1,v.radius/v.initialRadius));
        v.radius+=clamp(target-v.radius,-.018*s.scale*dt,.008*s.scale*dt);
        let covered=0;for(let j=0;j<64;j++){const a=j*Math.PI/32;let found=false;for(const dr of [-2,0,2]){const r=v.radius+v.wall/2+dr*s.scale,x=Math.round(v.x+r*Math.cos(a)),y=Math.round(v.y+r*Math.sin(a)),m=s.cells[s.C.pixt([x,y])];if(m?.vesselID===v.id&&!m.dying)found=true;}if(found)covered++;}
        let open=0,total=0;for(let y=Math.floor(v.y-v.radius);y<=Math.ceil(v.y+v.radius);y++)for(let x=Math.floor(v.x-v.radius);x<=Math.ceil(v.x+v.radius);x++)if((x-v.x)**2+(y-v.y)**2<v.radius*v.radius){total++;const id=s.C.pixt([x,y]);if(!id||s.cells[id]?.kind===IMMUNE)open++;}
        v.coverage=covered/64;v.patency=open/Math.max(1,total);v.area=open;
        if(v.nascent&&v.coverage>=.65&&v.patency>=.5){v.nascent=false;s.counters.vascularMaturations++;this.rebuildRegion();s.log('vascular-mature',0,0,{vessel:v.id,parent:v.parent});}
        v.perfusion=(v.nascent?0:1)*v.quality*clamp((v.coverage-.25)/.65)*v.patency*clamp((v.radius/(3*s.scale)-1)/2)*clamp(v.radius*v.radius/(v.initialRadius*v.initialRadius));
      }
      this.prepareExchange();
    }
    prepareExchange(){
      const s=this.s,f=s.fields.oxygen;this.exchange.fill(0);
      for(const v of this.vessels)if(v.active&&v.perfusion>0){const reach=v.radius+v.wall;
        for(let y=Math.max(0,Math.floor((v.y-reach)/s.fieldScale));y<=Math.min(f.height-1,Math.floor((v.y+reach)/s.fieldScale));y++)for(let x=Math.max(0,Math.floor((v.x-reach)/s.fieldScale));x<=Math.min(f.width-1,Math.floor((v.x+reach)/s.fieldScale));x++){
          const d=this.distance((x+.5)*s.fieldScale,(y+.5)*s.fieldScale,v),weight=clamp((reach-d)/Math.max(1,v.wall));if(weight)this.exchange[y*f.width+x]+=v.perfusion*weight*6*s.settings.vesselSupply;
        }
      }
    }
    enter(v){
      const s=this.s,rad=3*s.scale;if(!v.active||v.perfusion<=.05||v.radius<rad+2*s.scale)return 0;
      for(let j=0;j<12;j++){const a=s.C.random()*Math.PI*2,d=Math.sqrt(s.C.random())*Math.max(0,v.radius-rad-1),id=s.seed(IMMUNE,v.x+d*Math.cos(a),v.y+d*Math.sin(a),rad);if(id){const m=s.cells[id];Object.assign(m,{vascularID:v.id,vascularPhase:1,vascularContact:0,circulationAge:0});s.immunity.arrival(m);s.counters.vascularArrivals++;s.log('vascular-arrival',id,0,{vessel:v.id});return id;}}
      return 0;
    }
    extent(m,v){
      // Rare transit completion uses every actual occupied pixel, including the
      // nucleus. It cannot be triggered by a 2D centroid crossing alone.
      let inner=0,outer=0,n=0;const s=this.s;
      for(const bin of m.fieldBins.keys()){const bx=bin%s.fields.oxygen.width,by=Math.floor(bin/s.fields.oxygen.width);for(let y=by*s.fieldScale;y<Math.min(s.height,(by+1)*s.fieldScale);y++)for(let x=bx*s.fieldScale;x<Math.min(s.width,(bx+1)*s.fieldScale);x++)if(s.C.pixt([x,y])===m.id){n++;const d=this.distance(x,y,v);if(d<v.radius)inner++;if(d>v.radius+v.wall)outer++;}}
      const nucleus=this.distance(m.nucleusX??m.x,m.nucleusY??m.y,v),nr=m.nucleusRadius||2*s.scale;
      return {inside:inner/Math.max(1,n),outside:outer/Math.max(1,n),nucleusInside:nucleus+nr<v.radius,nucleusOutside:nucleus-nr>v.radius+v.wall};
    }
    tick(dt){
      const s=this.s;if(!this.vessels.length)return;
      const retained=s.normalSupportReport().retained;this.hostHealth+=(retained-this.hostHealth)*(1-Math.exp(-dt/400));
      if(s.C.time%4===0)this.measure(4);
      for(const m of s.live()){
        if(m.dying||m.vesselID||![TUMOR,IMMUNE].includes(m.kind))continue;
        if(m.kind===TUMOR&&m.vascularPhase===4&&s.C.time-(m.bloodstreamEnteredAt??s.C.time)>=40){s.counters.bloodstreamExports++;s.log('bloodstream-export',m.id,0,{vessel:m.vascularID,clone:m.clone,residence:s.C.time-m.bloodstreamEnteredAt});s.eraseCell(m.id);continue;}
        let v=this.at(m.vascularID);
        if(!v&&m.vascularID){m.vascularPhase=0;m.vascularID=0;}
        if(!m.vascularPhase||m.vascularPhase===1){
          let contact=0,contactVessel=null;for(const e of s.contacts.get(m.id)?.values()||[]){const ec=s.cells[e.id];if(ec?.vesselID&&!ec.dying){contact+=e.length;contactVessel=this.at(ec.vesselID);}}
          if(contactVessel&&(!v||contactVessel.id===v.id)){
            v=contactVessel;if(m.vascularContactVessel!==v.id)m.vascularContact=0;m.vascularContactVessel=v.id;m.vascularContact=(m.vascularContact||0)+dt;
            if(m.kind===IMMUNE&&m.vascularPhase===1&&m.vascularContact>=6){const signal=this.sample(m,'trail'),rate=.012*s.settings.vesselPassage*(.15+signal/(.15+signal));if(s.C.random()<1-Math.exp(-dt*rate)){m.vascularPhase=2;s.log('extravasation-start',m.id,0,{vessel:v.id});}}
            if(m.kind===TUMOR&&m.vascularContact>=12){const invasive=Math.max(0,(m.genome?.invasion||0)-.85),rate=.0007*s.settings.tumorIntravasation*invasive*(1+3*(1-v.coverage));if(s.C.random()<1-Math.exp(-dt*rate)){m.vascularID=v.id;m.vascularPhase=3;s.log('intravasation-start',m.id,0,{vessel:v.id});}}
          }else m.vascularContact=0;
        }
        if(!v)continue;
        if(m.vascularPhase===1){m.circulationAge=(m.circulationAge||0)+dt;if(m.circulationAge>1200&&s.C.random()<1-Math.exp(-dt*.002*v.perfusion)){s.counters.circulationReturns++;s.log('circulation-return',m.id,0,{vessel:v.id});s.eraseCell(m.id);}}
        else if(m.vascularPhase>=2&&s.C.time%8===0){const e=this.extent(m,v);
          if(m.vascularPhase===2&&e.outside>.95&&e.nucleusOutside){m.vascularPhase=0;m.vascularID=0;s.counters.extravasations++;s.log('extravasation',m.id,0,{vessel:v.id});}
          else if(m.vascularPhase===3&&e.inside>.9&&e.nucleusInside){m.vascularPhase=4;m.bloodstreamEnteredAt=s.C.time;s.counters.intravasations++;s.log('intravasation',m.id,0,{vessel:v.id});}
        }
      }
      const health=1-s.settings.vesselImmuneHealth/100*(1-this.hostHealth);
      for(const v of this.vessels)if(v.active&&v.perfusion>.05){let signal=0;for(let j=0;j<8;j++){const a=j*Math.PI/4,r=v.radius+v.wall+2*s.scale;signal+=s.fields.trail.values[s.fieldIndex(v.x+r*Math.cos(a),v.y+r*Math.sin(a))]||0;}signal/=8;
        const rate=.001*s.settings.vesselImmuneRate*v.perfusion*health*(.12+2*signal/(.2+signal));if(s.C.random()<1-Math.exp(-rate*dt))this.enter(v);
      }
    }
    report(){const s=this.s,active=this.vessels.filter(v=>v.active),health=1-s.settings.vesselImmuneHealth/100*(1-this.hostHealth);return {vessels:this.vessels.map(v=>({id:v.id,x:v.x,y:v.y,radius:v.radius,wall:v.wall,initialRadius:v.initialRadius,coverage:v.coverage,perfusion:v.perfusion,patency:v.patency,area:v.area,active:v.active,quality:v.quality,tumorFraction:v.tumorFraction,angiogenicSignal:v.angiogenicSignal,parent:v.parent,nascent:v.nascent,bornAt:v.bornAt})),initial:this.initial.map(v=>({...v})),sprouts:s.counters.vascularSprouts,matured:s.counters.vascularMaturations,nascent:active.filter(v=>v.nascent).length,meanQuality:active.reduce((n,v)=>n+v.quality,0)/Math.max(1,active.length),endothelial:s.live().filter(m=>m.vesselID).length,functional:active.filter(v=>v.perfusion>.05).length,immuneAvailability:health,canRecruit:s.settings.vesselImmuneRate>0&&health>0&&active.some(v=>v.perfusion>.05&&v.radius>5*s.scale),area:active.reduce((n,v)=>n+v.area,0),meanPerfusion:active.reduce((n,v)=>n+v.perfusion,0)/Math.max(1,active.length)};}
  }
  // Opt-in performance prototype. Membership updates are O(1); only an event's
  // target body is sorted, in the exact x-major order of Artistoo's pixels().
  // Keeping that order preserves centroid sums, relabelling and RNG trajectories.
  class CellPixelIndex {
    constructor(size){this.members=[];this.slots=new Uint32Array(size);}
    update(i,old,id){
      if(old===id)return;
      if(old){
        const body=this.members[old],slot=this.slots[i],last=body.pop();
        if(last!==i){body[slot]=last;this.slots[last]=slot;}
        if(!body.length)delete this.members[old];
      }
      if(id){const body=this.members[id]||(this.members[id]=[]);this.slots[i]=body.length;body.push(i);}
    }
    indices(id){return (this.members[id]||[]).slice().sort((a,b)=>a-b);}
  }
  class Simulation {
    constructor({width,height,worldWidth=240,worldHeight=180,refinement,scene='ecosystem',seed=17,boundary='solid',settings={},sources,vessels,initialCells=[],mazeSignalThroughWalls=false,warmup=35,kernel='fast',sectionModel=true,pixelIndex=false}={}){
      this.scale=refinement??(width===undefined?1.5:1);
      if(![1,1.5,2,3,4].includes(this.scale))throw Error('Unsupported lattice refinement');
      width=width??Math.round(worldWidth*this.scale);height=height??Math.round(worldHeight*this.scale);
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<24||width>1024||height>768)throw Error('计算格点需在 32×24 至 1024×768 内，请降低区域或精细度');
      this.worldWidth=width/this.scale;this.worldHeight=height/this.scale;this.fieldScale=scene==='maze'?Math.max(1,Math.round(this.scale*1.25)):FIELD_SCALE*this.scale;
      this.width=width;this.height=height;this.scene=scene;this.seedValue=seed;this.wrap=boundary==='wrap';this.boundary=boundary;
      this.initialWarmup=warmup;
      this.settings={...DEFAULTS,...(scene==='random'?randomSettings(seed):PRESETS[scene]?.settings||{}),...settings};
      // Legacy saved configurations may contain a population budget. It has
      // no biological meaning and must not influence this run or its report.
      delete this.settings.capacity;
      this.cells=[];this.contacts=new Map();this.histories=new Map();this.events=[];this.history=[];this.wallID=0;this.version=0;
      this.normalSupplyReference=0;
      this.counters={manualRemoved:0,divisions:0,immuneDivisions:0,kills:0,apoptosis:0,environment:0,apoptosisStarted:0,killStarted:0,environmentStarted:0,recognitions:0,mutations:0,abnormalInitiations:0,malignantTransitions:0,abnormalKills:0,normalEnvironmentDeaths:0,abnormalEnvironmentDeaths:0};this.birthSerial=0;this.lineage=[];this.deathHistory=[];this.recentClearances=[];this.manualDeathRemovals={spontaneous:0,kill:0,environment:0};
      this.deathEffects=[];this.sources=[];this.sourceSerial=0;
      this.counters.lifespan=0;this.counters.lifespanStarted=0;this.manualDeathRemovals.lifespan=0;
      this.counters.normalDivisions=0;this.counters.replicationDeaths=0;Object.assign(this.counters,{stemAsymmetric:0,stemSelfRenewal:0,stemDifferentiation:0,stemReversions:0});
      Object.assign(this.counters,{normalTraitMutations:0,stressMutations:0,antigenExposures:0,antigenEscapes:0});
      Object.assign(this.counters,{suppressiveTransitions:0,suppressiveRecoveries:0,injuryDeactivations:0,signalDeactivations:0});
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
      // Observers only: neither coverage nor inspected identities enter steering.
      this.patrol={visited:new Uint8Array(size),checked:new Set(),contacts:new Map(),needsSeed:true};this.trackPatrol=false;
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
      const vascularGate=new CPM.HardConstraint({});vascularGate.fulfilled=(...args)=>this.vascular?.allowed(...args)??true;C.add(vascularGate);
      const vascularShape=new CPM.SoftConstraint({});vascularShape.deltaH=(...args)=>this.vascular?.energy(...args)||0;C.add(vascularShape);
      const make=C.makeNewCellID.bind(C);C.makeNewCellID=kind=>{const id=make(kind);if(kind!==WALL)this.register(id,kind);return id;};
      C.post_setpix_listeners.push((i,old,id)=>{if(this.cells[old])this.moment(this.cells[old],i,-1);if(this.cells[id])this.moment(this.cells[id],i,1);
        if(this.trackPatrol){if(this.cells[id]?.kind===IMMUNE&&!this.cells[id].dying)this.patrol.visited[i]=1;}
        else if(this.cells[old]?.kind===IMMUNE||this.cells[id]?.kind===IMMUNE)this.patrol.needsSeed=true;
      });
      // Register before fast/WASM capture the known listeners so bulk commit,
      // reference JS, user edits and trapped-WASM fallback all maintain it.
      this.pixelIndex=pixelIndex?new CellPixelIndex(size):null;
      if(this.pixelIndex)C.post_setpix_listeners.push(this.pixelIndex.update.bind(this.pixelIndex));
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
      this.fields={};for(const key of [...SIGNALS,'angiogenicNormal','angiogenicTumor','oxygen','glucose','acid','density'])this.fields[key]=new SignalField(Math.ceil(width/this.fieldScale),Math.ceil(height/this.fieldScale),this.wrap);
      this.fields.oxygen.values.fill(1);this.fields.glucose.values.fill(1);
      const bins=this.fields.oxygen.values.length;
      // Fixed reservoir geometry, independent of time, cell identity and goals.
      // Core acid clearance is limited more strongly than nutrient supply, so
      // chronic injury can coexist with a viable, better supplied frontier.
      this.supplyMap=new Float32Array(bins).fill(1);
      this.ecology=PRESETS[scene]?.environmentProfile==='mosaic'?ecologyLayout(seed,scene==='random'):null;
      if(this.ecology)for(let i=0;i<bins;i++){
        const x=(i%this.fields.oxygen.width+.5)*this.fieldScale/width,y=(Math.floor(i/this.fields.oxygen.width)+.5)*this.fieldScale/height;
        for(const n of this.ecology.niches){const radius=Math.hypot((x-n.x)/n.rx,(y-n.y)/n.ry);this.supplyMap[i]=Math.min(this.supplyMap[i],n.floor+(1-n.floor)*clamp((radius-.55)/.65));}
      }
      if(PRESETS[scene]?.environmentProfile==='poor-core')for(let i=0;i<bins;i++){
        const x=(i%this.fields.oxygen.width+.5)*this.fieldScale/this.scale,y=(Math.floor(i/this.fields.oxygen.width)+.5)*this.fieldScale/this.scale;
        const radius=Math.hypot((x-this.worldWidth/2)/(this.worldWidth*.22),(y-this.worldHeight/2)/(this.worldHeight*.25));
        this.supplyMap[i]=.05+.95*clamp((radius-.55)/.65);
      }
      this.occupancy=[null,new Float32Array(bins),new Float32Array(bins),new Float32Array(bins)];
      this.densities=[null,new Float32Array(bins),new Float32Array(bins),new Float32Array(bins)];
      this.densityFields=[null,...[1,2,3].map(()=>new SignalField(this.fields.oxygen.width,this.fields.oxygen.height,this.wrap))];
      this.massFields=[null,...[1,2,3].map(()=>new SignalField(this.fields.oxygen.width,this.fields.oxygen.height,this.wrap))];
      this.metabolicFields=[0,1,2].map(()=>new SignalField(this.fields.oxygen.width,this.fields.oxygen.height,this.wrap));
      for(const f of this.metabolicFields)f.blocked=this.fields.oxygen.blocked;
      for(const f of this.densityFields.slice(1))f.blocked=this.fields.oxygen.blocked;
      for(const f of this.massFields.slice(1))f.blocked=this.fields.oxygen.blocked;
      this.binAreas=new Float32Array(bins);for(let y=0;y<height;y++)for(let x=0;x<width;x++)this.binAreas[this.fieldIndex(x,y)]++;
      this.immunity=new CellLabImmunity.System(this);
      this.vascular=new VascularSystem(this,vessels);
      if(scene!=='empty')this.populate();
      this.vascular.initialize();
      this.initialCells=structuredClone(initialCells);this.immunity.initialize(initialCells);
      if(sources){this.sources=[];for(const source of sources)this.addSource(source.x*this.scale,source.y*this.scale,source.type,source.radius*this.scale);}
      if(this.maze){this.maze.signalThroughWalls=!!mazeSignalThroughWalls;if(mazeSignalThroughWalls)this.fields.trail.blocked.fill(0);this.equilibrateMaze();}
      this.updateNormalReference();this.record(); // The initial population belongs at model time zero.
      this.refreshPositions();for(let i=0;i<(this.maze?0:warmup);i++){if(C.borderpixels.length)C.timeStep();if(this.section){this.refreshPositions();this.scanContacts();this.section.update(1);}}
      this.cleanup();this.refreshPositions();this.updateEnvironment(0);this.updateMetabolism(0);this.updateLocal(0);this.initializeScenario();this.record();
    }
    live(){return this.cells.filter(Boolean);}
    normalLivingCount(){let n=0;for(const m of this.cells)if(m?.kind===NORMAL&&m.state==='normal'&&!m.dying&&this.C.getVolume(m.id)>0)n++;return n;}
    updateNormalReference(){this.normalSupplyReference=Math.max(this.normalSupplyReference,this.normalLivingCount());}
    normalSupportReport(){
      const living=this.normalLivingCount(),reference=this.normalSupplyReference,retained=reference?clamp(living/reference):1;
      const strength=clamp((this.settings.normalSupport||0)/100),factor=1-strength*(1-retained);
      return {living,reference,retained,strength,factor,effectiveSupply:this.settings.supply*factor};
    }
    observe(id,birth){
      const m=this.cells[id];
      if(!id){this.observation=null;return true;}
      const split=this.lineage.find(e=>e.parent===birth);
      if((!m||m.birth!==birth)&&!split)return false;
      const members=new Map([[birth,0]]);
      // The displayed parent may divide between the click and Worker delivery.
      // Reconcile that short race from actual birth links, never from clone/ID.
      for(const e of this.lineage)if(members.has(e.parent)){const g=members.get(e.parent)+1;members.delete(e.parent);for(const child of e.children)members.set(child,g);}
      this.observation={rootBirth:birth,rootID:id,rootGeneration:split?split.generation-1:m.generation,members};this.observationReport();return true;
    }
    observationReport(){
      const o=this.observation;if(!o)return null;
      const cells=[];for(const m of this.live())if(o.members.has(m.birth))cells.push({id:m.id,birth:m.birth,generation:o.members.get(m.birth)});
      // Track living identities, not reusable CPM IDs or the bounded event log.
      o.members=new Map(cells.map(c=>[c.birth,c.generation]));
      return {rootBirth:o.rootBirth,rootID:o.rootID,rootGeneration:o.rootGeneration,cells};
    }
    register(id,kind){
      const theta=this.C.random()*2*Math.PI,roll=this.C.random();
      const base=[0,240,330,72][kind]*this.scale*this.scale;
      const genome=kind===TUMOR?{tolerance:(.85+.3*this.C.random())*(PRESETS[this.scene]?.founderTolerance||1),proliferation:.85+.3*this.C.random(),invasion:.85+.3*this.C.random(),antigen:roll<this.settings.antigen/100?.45+.55*this.C.random():.04+.07*this.C.random()}:null;
      const m={id,kind,name:TYPE_NAMES[kind],base,target:kind===TUMOR?base*.55:base,lambdaV:0,lambdaP:0,perimeter:0,activity:0,drive:0,px:Math.cos(theta),py:Math.sin(theta),x:0,y:0,sx:0,sy:0,sinX:0,cosX:0,sinY:0,cosY:0,age:0,antigenRoll:roll,antigen:false,antigenLevel:0,damage:0,dying:false,deathCause:'',targetID:0,phase:'search',genome,clone:id,generation:0,birth:++this.birthSerial,parentBirth:0,divisionsLeft:kind===IMMUNE?this.settings.immuneDivisions:null,activation:0,recruitment:0,stress:0,adversity:0,fitness:1,oxygen:1,glucose:1,acid:0,confinement:0};
      m.state=kind===NORMAL?'normal':kind===TUMOR?'tumor':'immune';m.origin=m.state;m.abnormalAge=0;m.abnormalSince=null;m.transformedAt=null;m.immuneCue=0;m.inflammatorySignal=0;m.inflammatoryExposure=0;
      m.nucleusStrainX=0;m.nucleusStrainY=0;m.fieldBins=new Map();m.sectionFraction=1;m.sectionPressure=0;m.hasNucleus=false;if(genome)this.applyGenome(m);
      m.cycle=newCycle();m.antigenMemory=0;m.il2=0;m.il2Response=0;m.il2Production=0;m.chronicStimulation=0;m.exhaustion=0;
      m.resources={energy:.65,precursor:.65,dnaDamage:0};m.freeMembrane=0;m.freeFraction=0;
      if(kind===NORMAL)m.divisionsLeft=this.settings.normalDivisions;
      this.initializeStemness(m);
      m.normalTolerance=1;m.mutationPressure=0;m.immuneEncounters=0;m.immuneContactMemory=0;m.recruitmentExposure=0;m.lastAntigenChange=null;m.tumorKills=0;
      m.immunePhenotype=kind===IMMUNE?'cytotoxic':null;m.normalDamageExposure=0;m.inhibition=0;m.immuneRefractory=0;m.recruitmentTargetID=0;m.recruitmentTargetBirth=0;
      this.cells[id]=m;this.contacts.set(id,new Map());this.immunity.register(m);this.updateMechanics(m);return m;
    }
    applyGenome(m){if(m.geneClone){this.immunity.summarize(m);return;}const recognized=m.antigen;m.antigenLevel=m.genome.antigen;m.antigen=m.antigenLevel>=.18;if(recognized&&!m.antigen)this.releaseAntigenTarget(m);}
    immuneTarget(m){return !!m&&!m.dying&&(m.kind===TUMOR||(m.kind===NORMAL&&m.state==='abnormal'))&&m.antigen;}
    beginAbnormal(id){
      const m=this.cells[id];if(!m||m.dying||m.kind!==NORMAL||m.state!=='normal')return false;
      // A first alteration MAY introduce a new epitope. Keep normal mechanics
      // and metabolism; precancer alone does not grant proliferation/invasion.
      m.state='abnormal';m.name='癌前细胞';m.abnormalSince=this.C.time;m.abnormalAge=0;
      m.cycle=newCycle();
      this.immunity.abnormal(m);
      this.counters.abnormalInitiations++;this.log('abnormal',id,0,{antigen:m.antigenLevel,stress:m.stress,adversity:m.adversity,inflammatoryExposure:m.inflammatoryExposure,inflammation:this.settings.inflammation});return true;
    }
    becomeTumor(id){
      const m=this.cells[id];if(!m||m.dying||m.kind!==NORMAL||m.state!=='abnormal')return false;
      // Relabel the same occupied body. Preserve target mass, damage, contacts,
      // lineage and the already occupied nuclear disk; never reseed or teleport.
      for(const [bin,pixels] of m.fieldBins){this.occupancy[NORMAL][bin]-=pixels;this.occupancy[TUMOR][bin]+=pixels;}
      this.C.setCellKind(id,TUMOR);m.kind=TUMOR;m.state='tumor';m.name=TYPE_NAMES[TUMOR];m.base=330*this.scale*this.scale;m.age=0;m.transformedAt=this.C.time;
      m.divisionsLeft=null;
      m.genome={tolerance:clamp((.85+.3*this.C.random())*(PRESETS[this.scene]?.founderTolerance||1)*m.normalTolerance,.25,3),proliferation:.85+.3*this.C.random(),invasion:.85+.3*this.C.random(),antigen:m.antigenLevel};
      m.cycle=newCycle();this.initializeStemness(m);this.immunity.malignant(m);this.updateMechanics(m);this.C.stat_values={};
      this.counters.malignantTransitions++;this.log('malignant',id,0,{clone:m.clone,genome:{...m.genome}});return true;
    }
    sampleInflammation(m,dt){
      // Existing damage/recruitment fields are an explicit inflammatory proxy,
      // not molecular IL-6. Sample only this body's occupied, unblocked bins.
      let signal=0,area=0;
      for(const [i,pixels] of m.fieldBins)if(!this.fields.danger.blocked[i]){signal+=pixels*(this.fields.danger.values[i]+this.fields.trail.values[i])*.5;area+=pixels;}
      const concentration=area?signal/area:0;m.inflammatorySignal=concentration/(.35+concentration);
      m.inflammatoryExposure=clamp(m.inflammatorySignal+(m.inflammatoryExposure-m.inflammatorySignal)*Math.exp(-dt/240));
    }
    transformation(m,dt,sampled=false){
      if(m.kind!==NORMAL||m.dying||dt<=0)return;
      if(!sampled)this.sampleInflammation(m,dt);
      const pressure=1-(1-m.adversity)*(1-.5*m.inflammatoryExposure),gain=1+this.settings.normalMutationGain*pressure;
      if(m.state==='normal'){
        // Two independent, switchable initiation routes. Neither a short pulse
        // nor inflammation skips the existing precancerous intermediate.
        const environmental=.002*this.settings.stressMutation*m.adversity**2*clamp((m.stress-.06)/.24);
        const inflammatory=.0004*this.settings.inflammation*clamp((m.inflammatoryExposure-.2)/.8)**2;
        const hazard=(environmental+inflammatory)*gain;
        if(hazard>0&&this.C.random()<-Math.expm1(-hazard*dt))this.beginAbnormal(m.id);
      }else{
        const eligible=Math.max(0,m.abnormalAge+dt-160)-Math.max(0,m.abnormalAge-160);m.abnormalAge+=dt;
        const hazard=.0006*this.settings.progression*(.2+.8*m.adversity)*gain;
        if(eligible>0&&hazard>0&&this.C.random()<-Math.expm1(-hazard*eligible))this.becomeTumor(m.id);
      }
    }
    evolutionStep(m,dt){
      if(dt<=0||m.dying||m.kind===IMMUNE)return;
      this.sampleInflammation(m,dt);
      const s=this.settings,pressure=1-(1-m.adversity)*(1-.5*m.inflammatoryExposure);
      m.mutationPressure=clamp(pressure);
      m.immuneContactMemory*=Math.exp(-Math.LN2*dt/s.evolutionMemory);
      const trail=this.fieldOnCell(m,'trail'),signal=trail/(.35+trail);
      m.recruitmentExposure=clamp(signal+(m.recruitmentExposure-signal)*Math.exp(-dt/s.evolutionMemory));
      this.immunity.express(m,dt);
      if(m.stress>.3)this.immunity.expose(m,.15*m.stress);
    }
    changeAntigen(m,level,cause){
      // Explicit experimental expression perturbation, never a DNA mutation.
      for(let i=0;i<this.immunity.genes(m).peptides.length;i++)m.expression.peptides[i]=this.immunity.genes(m).peptides[i].present?clamp(level):0;
      m.lastAntigenChange={time:this.C.time,cause};this.immunity.summarize(m);
    }
    releaseAntigenTarget(m){
      // Invalidate both current synapses and recent recruitment from this exact
      // birth identity. Already released fields, damage and CTL memory remain.
      const scanned=new Set();
      for(const [key,h]of this.histories)if(h.target===m.id){scanned.add(h.ctl);this.histories.delete(key);}
      for(const ctl of this.live())if(ctl.kind===IMMUNE){
        const bound=ctl.targetID===m.id,recruiting=ctl.recruitmentTargetID===m.id&&ctl.recruitmentTargetBirth===m.birth;
        if(bound||recruiting){ctl.recruitment=0;ctl.recruitmentTargetID=0;ctl.recruitmentTargetBirth=0;}
        if(bound||(!ctl.targetID&&scanned.has(ctl.id))){ctl.targetID=0;ctl.phase='search';this.updateMechanics(ctl);}
      }
    }
    updateMechanics(m){
      if(this.section)this.section.sync(m);
      const invasion=m.genome?.invasion||1;
      const speed=this.settings[['','normalMotility','tumorMotility','immuneMotility'][m.kind]]*(m.kind===TUMOR?invasion*this.traitEconomy(m).migration:1)*(m.kind===IMMUNE?Math.max(.04,m.fitness):Math.max(.12,m.fitness));
      const contactGate=(m.targetID?.08:m.kind===IMMUNE&&m.phase==='scan'?.55:1)*(m.cycle?.phase==='M'?.2:1)*(m.kind===IMMUNE?1-.45*(m.exhaustion||0):1);
      m.activity=m.dying?0:[0,50,180,240][m.kind]*speed*contactGate;
      m.drive=m.dying?0:[0,7,17,25][m.kind]*speed*contactGate;
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
      if(m.vesselID&&!m.dying){m.activity=18*m.fitness;m.drive=12*m.fitness*this.settings.vesselRepair;m.lambdaP=.3/this.scale;m.perimeter=12*Math.sqrt(Math.max(1,m.planarTarget));}
      if(m.vascularPhase===3&&!m.dying){
        // Adhesive transendothelial traction polarizes an actual local contact.
        // A persistent random Act front otherwise keeps a large tumor cell
        // sliding tangentially around the wall despite inward nuclear movement.
        m.activity*=.35;m.drive*=3;
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
      if(this.vascular)for(const v of this.vascular.vessels)if(v.active&&kind!==IMMUNE&&this.vascular.distance(x,y,v)<v.radius+radius)return reject('lumen');
      x=Math.round(x);y=Math.round(y);radius=Math.round(radius);const points=[];
      for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++)if(dx*dx+dy*dy<=radius*radius){
        let xx=x+dx,yy=y+dy;if(this.wrap){xx=(xx+this.width)%this.width;yy=(yy+this.height)%this.height;}
        if(xx<0||yy<0||xx>=this.width||yy>=this.height)return reject('edge');
        const occupied=this.C.pixt([xx,yy]);if(occupied)return reject(this.cells[occupied]?.vesselID?'vascular':this.C.cellKind(occupied)===WALL?'wall':'occupied');points.push([xx,yy]);
      }
      const id=this.C.makeNewCellID(kind);for(const p of points)this.C.setpix(p,id);this.C.stat_values={};this.refreshPositions();
      if(this.section&&!this.section.initialize(this.cells[id],points.map(p=>this.C.grid.p2i(p)))){this.eraseCell(id);return reject('nucleus');}
      this.lastSeedResult={id,reason:'',population:population+1};
      if(kind===IMMUNE&&this.vascular)for(const v of this.vascular.vessels)if(v.active&&this.vascular.distance(x,y,v)<v.radius)Object.assign(this.cells[id],{vascularID:v.id,vascularPhase:1,vascularContact:0,circulationAge:0});
      if(kind===NORMAL)this.updateNormalReference();
      this.version++;return id;
    }
    insert(kind,x,y,radius=4){return globalThis.CellLabInsertion.insert(this,kind,x,y,radius);}
    populateMonolayer(tumorCount=0){
      // Power-Voronoi initialization only; subsequent shapes obey ordinary CPM.
      // Tissue reaches all four boundaries. Small interstitial immune territories
      // cut convex epithelial polygons, without deleting a nucleus or leaving holes.
      const W=this.worldWidth,H=this.worldHeight,s=this.scale,rows=[],sites=[],step=16.6,dy=step*Math.sqrt(3)/2;
      const ny=Math.max(2,Math.round(H/dy)),nx=Math.max(2,Math.round(W/step));
      for(let row=0;row<ny;row++){const list=[];for(let col=0;col<nx;col++){
        const x=clamp((col+.5+(row%2? .22:-.22))*W/nx+(this.C.random()-.5)*2,3,W-3),y=(row+.5)*H/ny+(this.C.random()-.5)*2;
        const site={x,y,id:this.vascular.reserved(x*s,y*s,3*s)?0:this.C.makeNewCellID(NORMAL),points:[]};if(site.id)sites.push(site);list.push(site);
      }rows.push(list);}
      // Reserve a compact lesion within the same continuous epithelial sheet.
      // This is initialization, not a transformation event or a source of cues.
      if(tumorCount)for(const site of [...sites].sort((a,b)=>(a.x-W/2)**2+(a.y-H/2)**2-(b.x-W/2)**2-(b.y-H/2)**2).slice(0,tumorCount)){
        this.C.setCellKind(site.id,TUMOR);this.register(site.id,TUMOR);
      }
      const nearest=(x,y)=>{let best=null,d=Infinity;const row=Math.floor(y/H*ny),col=Math.floor(x/W*nx);
        for(let yy=Math.max(0,row-3);yy<=Math.min(ny-1,row+3);yy++)for(let xx=Math.max(0,col-3);xx<=Math.min(nx-1,col+3);xx++){const site=rows[yy][xx];if(!site.id)continue;const q=(site.x-x)**2+(site.y-y)**2;if(q<d){d=q;best=site;}}return [best,d];};
      const patrols=[];
      const hot=this.scene==='hot',positions=!tumorCount?(this.ecology?.patrols||[[.24,.27],[.73,.25],[.32,.73],[.77,.69]]):hot?Array.from({length:18},(_,i)=>[.5+64*Math.cos(i*Math.PI/9)/W,.5+64*Math.sin(i*Math.PI/9)/H]):[[.08,.28],[.92,.5],[.08,.76]];
      for(const [fx,fy]of positions){
        let spot=null,score=-Infinity;
        for(const reach of [7,18,32,48]){for(let y=Math.max(6,H*fy-reach);y<=Math.min(H-6,H*fy+reach);y++)for(let x=Math.max(6,W*fx-reach);x<=Math.min(W-6,W*fx+reach);x++){
          if(this.vascular.reserved(x*s,y*s,6*s)||patrols.some(p=>(p.x-x)**2+(p.y-y)**2<144)||hot&&Math.hypot(x-W/2,y-H/2)<55)continue;
          const d=nearest(x,y)[1]-.03*((x-W*fx)**2+(y-H*fy)**2);if(d>score){score=d;spot=[x,y];}
        }if(spot)break;}if(!spot)continue;
        const [x,y]=spot,site={x,y,id:this.C.makeNewCellID(IMMUNE),points:[],weight:0};let lo=-100,hi=100;
        for(let n=0;n<15;n++){const mid=(lo+hi)/2;let area=0;for(let yy=Math.max(0,Math.floor(y-12));yy<Math.min(H,y+12);yy++)for(let xx=Math.max(0,Math.floor(x-12));xx<Math.min(W,x+12);xx++)if((xx-x)**2+(yy-y)**2+mid<nearest(xx,yy)[1])area++;if(area>72)lo=mid;else hi=mid;}site.weight=(lo+hi)/2;patrols.push(site);
      }
      for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
        if(this.vascular.reserved(x,y))continue;
        const xx=(x+.5)/s,yy=(y+.5)/s;let [site,d]=nearest(xx,yy);
        for(const ctl of patrols){const radius2=(ctl.x-xx)**2+(ctl.y-yy)**2,q=radius2+ctl.weight;if(this.vascular.vessels.length){if(radius2<=23.5){site=ctl;break;}}else if(q<d){d=q;site=ctl;}}
        const i=this.C.grid.p2i([x,y]);this.C.setpixi(i,site.id);site.points.push(i);
      }
      if(this.vascular.vessels.length){
        // A curved reserved lumen can cut off a small Voronoi corner. During
        // initialization only, grow neighbouring tissue into those corners so
        // every founder is connected; no fragment is left as a phantom cell.
        const pending=[];for(const site of sites){const remaining=new Set(site.points),parts=[];
          while(remaining.size){const queue=[remaining.values().next().value],part=[];remaining.delete(queue[0]);while(queue.length){const i=queue.pop();part.push(i);for(const n of this.faces[i])if(remaining.delete(n))queue.push(n);}parts.push(part);}parts.sort((a,b)=>b.length-a.length);
          for(const part of parts.slice(1))for(const i of part){this.C.setpixi(i,0);pending.push(i);}
        }
        for(let pass=0;pending.length&&pass<100;pass++)for(let j=pending.length-1;j>=0;j--){const i=pending[j],neighbor=this.faces[i].find(k=>{const m=this.cells[this.C.pixti(k)];return m?.kind===NORMAL||m?.kind===TUMOR;});if(neighbor!==undefined){this.C.setpixi(i,this.C.pixti(neighbor));pending.splice(j,1);}}
        // Fully isolated subcellular pores remain extracellular space; no cell
        // identity is assigned without a connected neighbouring body.
        const map=new Map([...sites,...patrols].map(site=>{site.points=[];return [site.id,site];}));for(const i of this.positions){const site=map.get(this.C.pixti(i));if(site)site.points.push(i);}
      }
      this.refreshPositions();for(const site of [...sites,...patrols]){const m=this.cells[site.id];m.target=this.C.getVolume(m.id);if(!tumorCount||m.kind===NORMAL)m.base=m.target;if(this.section&&!this.section.initialize(m,site.points))throw Error('Monolayer nucleus does not fit: '+this.scene+' '+m.id);this.updateMechanics(m);}this.C.stat_values={};
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
      if(![...SIGNALS,'oxygen','glucose','acid','nutrient','hostile'].includes(type)||![x,y,radius].every(Number.isFinite)||radius<=0)return 0;
      x=clamp(x,0,this.width-1);y=clamp(y,0,this.height-1);radius=clamp(radius,2*this.scale,40*this.scale);
      const existing=this.sources.find(s=>s.type===type&&this.sourceDistance(s,x,y)<Math.max(2*this.scale,radius*.5));if(existing)return existing.id;
      const source={id:++this.sourceSerial,x,y,type,radius};this.sources.push(source);this.applySources();this.version++;return source.id;
    }
    sourceDistance(source,x,y){let dx=Math.abs(source.x-x),dy=Math.abs(source.y-y);if(this.wrap){dx=Math.min(dx,this.width-dx);dy=Math.min(dy,this.height-dy);}return Math.hypot(dx,dy);}
    removeSources(x,y,radius=10*this.scale){const n=this.sources.length;this.sources=this.sources.filter(s=>this.sourceDistance(s,x,y)>radius+s.radius);this.version++;return n-this.sources.length;}
    sourceBins(source){
      const f=this.fields.oxygen,result=new Set(),step=this.fieldScale;
      // Clip each periodic image's bounding box, rather than scanning the whole dish.
      for(const dx of this.wrap?[-this.width,0,this.width]:[0])for(const dy of this.wrap?[-this.height,0,this.height]:[0]){
        const cx=source.x+dx,cy=source.y+dy;
        for(let y=Math.max(0,Math.floor((cy-source.radius)/step));y<Math.min(f.height,(cy+source.radius)/step+1);y++)for(let x=Math.max(0,Math.floor((cx-source.radius)/step));x<Math.min(f.width,(cx+source.radius)/step+1);x++){
          const i=y*f.width+x;if(!f.blocked[i]&&Math.hypot((x+.5)*step-cx,(y+.5)*step-cy)<=source.radius)result.add(i);
        }
      }
      return result;
    }
    applySources(channel=null){
      for(const source of this.sources){if(channel&&source.type!==channel&&!(source.type==='normalDamage'&&channel==='danger'))continue;for(const i of this.sourceBins(source)){
        if(SIGNALS.includes(source.type))this.fields[source.type].values[i]=30;
        else if(source.type==='nutrient'){this.fields.oxygen.values[i]=1;this.fields.glucose.values[i]=1;}
        else if(source.type==='hostile'){this.fields.oxygen.values[i]=.06;this.fields.acid.values[i]=.95;}
        else this.fields[source.type].values[i]=1;
        if(source.type==='normalDamage')this.fields.danger.values[i]=30;
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
      if(this.scene==='random'){
        this.populateMonolayer();
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
        this.populateMonolayer(this.scene==='hot'?37:19);
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
      for(const m of this.live()){let map=contacts.get(m.id);if(!map){map=new Map();contacts.set(m.id,map);}map.clear();m.freeMembrane=0;}
      const add=(a,b,dx,dy)=>{if(!this.cells[a])return;const map=contacts.get(a);let edge=map.get(b);if(!edge){edge={id:b,length:0,nx:0,ny:0};map.set(b,edge);}edge.length++;edge.nx+=dx;edge.ny+=dy;};
      const present=id=>!!this.cells[id]||this.C.cellKind(id)===WALL;
      for(const i of this.C.borderpixels.elements){
        const a=grid[i];if(!present(a))continue;const ring=this.rings[i];
        if(this.cells[a]?.kind===NORMAL)for(const j of this.faces[i])if(j>=0&&grid[j]===0)this.cells[a].freeMembrane++;
        const right=ring[3],b=right<0?0:grid[right];if(a!==b&&present(b)){add(a,b,1,0);add(b,a,-1,0);}
        const down=ring[5],c=down<0?0:grid[down];if(a!==c&&present(c)){add(a,c,0,1);add(c,a,0,-1);}
      }
      for(const m of this.live()){let length=0;for(const e of contacts.get(m.id).values())length+=e.length;m.confinement=clamp(length/Math.max(1,4*Math.sqrt(this.C.getVolume(m.id))));m.freeFraction=m.freeMembrane/Math.max(1,m.freeMembrane+length);}
      return this.contacts;
    }
    fieldIndex(x,y){return Math.floor(y/this.fieldScale)*this.fields.oxygen.width+Math.floor(x/this.fieldScale);}
    prepareEnvironment(){
      this.vascular.prepareExchange();
      this.updateNormalReference();
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
      {
        for(let kind=1;kind<=3;kind++)this.massFields[kind].values.fill(0);
        for(const f of this.metabolicFields)f.values.fill(0);
        for(const m of this.live()){
          const cycling=m.cycle.phase!=='G0'&&!m.cycle.arrest;
          // The same phase-weighted loads feed both CPU and WebGPU reactions.
          // Keep density geometric; quiescence saves resources, not occupied area.
          const demand=m.dying?.6:m.kind===TUMOR?(cycling?1.15:.6):m.kind===IMMUNE?(cycling?1.35:.8):1;
          const profile=this.metabolicProfile(m);
          for(const [i,pixels] of m.fieldBins)if(!blocked[i]){const mass=pixels/((this.section?Math.max(.5,m.sectionFraction):1)*this.binAreas[i]);this.massFields[m.kind].values[i]+=demand*mass;this.metabolicFields[0].values[i]+=profile.oxygen*mass;this.metabolicFields[1].values[i]+=profile.glucose*mass;this.metabolicFields[2].values[i]+=profile.acid*mass;}
        }
        this.loads=[null];for(let kind=1;kind<=3;kind++){const f=this.massFields[kind];f.step(.2,0);f.step(.2,0);this.loads[kind]=f.values;}
        this.metabolicLoads=this.metabolicFields.map(f=>{f.step(.2,0);f.step(.2,0);return f.values;});
      }
    }
    integrateEnvironment(dt){
      const {oxygen,glucose,acid}=this.fields,blocked=oxygen.blocked,n=oxygen.values.length;
      const effectiveSupply=this.normalSupportReport().effectiveSupply,background=this.vascular.vessels.length?1-this.settings.vesselDependence/100:1,exchange=this.vascular.exchange;
      const [loadOxygen,loadGlucose,loadAcid]=this.metabolicLoads;
      for(let remaining=dt;remaining>0;remaining--){const sub=Math.min(1,remaining);
        oxygen.step(.10*sub,0);glucose.step(.065*sub,0);acid.step(.045*sub,0);
        for(let i=0;i<n;i++){
          if(blocked[i])continue;
          const o=oxygen.values[i],g=glucose.values[i],a=acid.values[i],s=effectiveSupply*((.65+.35*this.supplyMap[i])*background+exchange[i]),clearance=effectiveSupply*(this.supplyMap[i]*background+exchange[i]),k=this.settings.metabolism;
          const loadO=loadOxygen[i],loadG=loadGlucose[i];
          oxygen.values[i]=clamp(o+sub*(.012*s*(1-o)-.024*k*loadO*o/(.2+o)));
          glucose.values[i]=clamp(g+sub*(.010*s*(1-g)-.023*k*loadG*g/(.15+g)));
          acid.values[i]=clamp(a+sub*(.014*k*loadAcid[i]*g/(.15+g)*(1+.8*(1-o))-.009*clearance*a));
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
        if(m.vesselID){this.vascular.endothelialMetabolism(m,dt);this.updateMechanics(m);continue;}
        const tolerance=m.genome?.tolerance||m.normalTolerance||1;
        m.adversity=.35*clamp((.45-m.oxygen)/.45)+.4*clamp((.5-m.glucose)/.5)+.25*clamp((m.acid-.25)/.75);
        // Tolerance reduces injury and acid inhibition, but cannot create nutrients.
        m.fitness=clamp(m.oxygen/.45)*clamp(m.glucose/.5)*clamp(1-.85*m.acid/Math.sqrt(tolerance));
        m.stress=clamp(m.stress+dt*(m.adversity*m.adversity/(220*tolerance)-Math.max(0,.18-m.adversity)/160));
        if(m.stress>=1)this.beginDeath(m.id,'environment');
        this.updateMechanics(m);
      }
    }
    updateSignals(dt){
      for(const m of this.live()){
        // Sources live on occupied bins, never at a concave body's empty centroid.
        const deposit=(channel,amount)=>{const volume=this.C.getVolume(m.id);for(const [i,pixels] of m.fieldBins){const f=this.fields[channel];if(!f.blocked[i])f.values[i]=Math.min(30,f.values[i]+amount*pixels/volume);}};
        // Track provenance: normal injury is part of total danger, while tumor
        // alarm and manually supplied generic danger do not acquire this tag.
        if(m.kind===NORMAL&&m.state==='normal'){
          const injury=m.dying?clamp(1-m.deathProgress):clamp((Math.max(m.stress,m.damage)-.06)/.6);
          if(injury>0){deposit('normalDamage',.08*dt*injury);deposit('danger',.08*dt*injury);}
        }
        if(m.dying)continue;
        if((m.kind===NORMAL&&!m.vesselID)||m.kind===TUMOR){const hypoxia=clamp((this.settings.angiogenicHypoxia-m.oxygen)/this.settings.angiogenicHypoxia);if(hypoxia>0)deposit(m.kind===TUMOR?'angiogenicTumor':'angiogenicNormal',.06*dt*this.settings.angiogenicSecretion*hypoxia);}
        if(m.kind===NORMAL&&!m.vesselID)deposit('cohesion',.045*dt);
        // This constitutive lesion cue is an explicit recognizable-phenotype
        // proxy; antigen-negative bodies do not carry a moving chemo-beacon.
        if(m.state==='abnormal'&&m.antigen)deposit('danger',.035*dt);
        if(m.kind===TUMOR&&m.antigen)deposit('danger',.10*dt);
        const effector=m.immunePhenotype!=='suppressive'&&m.immuneRefractory<=0;
        if(m.kind===IMMUNE&&m.immunePhenotype==='suppressive')deposit('inhibition',.30*dt*this.settings.suppressiveSecretion*m.fitness);
        if(m.kind===IMMUNE&&effector){if(m.recruitment>0)deposit('trail',.38*dt*this.settings.recruitment*m.fitness);else if(this.settings.immuneLearning>0&&m.antigenCargo?.some(c=>c.expiresAt>this.C.time))deposit('trail',.12*dt*this.settings.recruitment*m.fitness);}
        if(m.kind===IMMUNE&&effector&&m.il2Production>0)deposit('il2',.24*dt*this.settings.il2Secretion*m.fitness*(1-.8*m.exhaustion));
        if(m.kind===IMMUNE){
          const f=this.fields.il2,area=this.C.getVolume(m.id),receptor=.15+.85*m.antigenMemory;
          for(const [i,pixels]of m.fieldBins)if(!f.blocked[i])f.values[i]*=Math.exp(-.025*dt*receptor*pixels/Math.max(1,area));
        }
      }
      for(let remaining=dt;remaining>0;remaining-=2){const sub=Math.min(2,remaining);for(const key of ['angiogenicNormal','angiogenicTumor'])this.fields[key].step(.09*sub,Math.LN2/this.settings.angiogenicHalfLife*sub);}
      const decay=Math.LN2/this.settings.halfLife;
      // Fixed substeps keep the explicit solver positive for any requested dt.
      for(let remaining=dt;remaining>0;remaining-=2){const sub=Math.min(2,remaining);for(const key of SIGNALS){this.fields[key].step((key==='il2'?.065:.09)*sub,this.maze&&key==='trail'?0:(key==='il2'?Math.LN2/this.settings.il2HalfLife:decay)*sub);this.applySources(key);}}
    }
    patrolDirection(m,dt,randomAngle){
      const x=m.nucleusX??m.x,y=m.nucleusY??m.y;
      let p=m.patrolMotion;if(!p||p.birth!==m.birth)p=m.patrolMotion={birth:m.birth,x,y,hx:m.px,hy:m.py,dx:0,dy:0,elapsed:0,run:64+(m.birth*37%73),turn:0,turnTime:0,reorientations:0};
      const delta=(v,size)=>this.wrap?v-size*Math.round(v/size):v,dx=delta(x-p.x,this.width)/this.scale,dy=delta(y-p.y,this.height)/this.scale;
      p.x=x;p.y=y;p.dx+=dx;p.dy+=dy;p.elapsed+=dt;p.run-=dt;
      const searching=m.phase==='search'&&!m.targetID&&this.settings.immuneMotility>0&&m.fitness>.2;
      let stalled=false;if(p.elapsed>=64){stalled=Math.hypot(p.dx,p.dy)<3;p.dx=0;p.dy=0;p.elapsed=0;}
      // Finite kinematic memory, no visited-position map and no target lookup.
      // Reorientation is gradual, never a displacement or a geometric exemption.
      if(searching&&this.settings.noise>0&&p.turnTime<=0&&(p.run<=0||stalled)){
        p.turn=(this.C.random()<.5?-1:1)*(stalled?1.1+.5*this.C.random():.45+.6*this.C.random());p.turnTime=16;p.run=72+this.C.random()*88;p.reorientations++;
      }
      let angle=randomAngle*.35;
      if(!searching){p.turn=0;p.turnTime=0;p.run=Math.max(p.run,32);p.hx=m.px;p.hy=m.py;}
      else if(p.turnTime>0){const step=p.turn*Math.min(1,dt/p.turnTime);p.turn-=step;p.turnTime=Math.max(0,p.turnTime-dt);angle+=step;}
      const c=Math.cos(angle),s=Math.sin(angle),hx=p.hx*c-p.hy*s,hy=p.hx*s+p.hy*c;p.hx=hx;p.hy=hy;
      return {px:m.px*c-m.py*s,py:m.px*s+m.py*c,memory:searching?.55*(1-.9*m.immuneCue):0,turning:p.turnTime>0};
    }
    updatePolarity(dt){
      const s=this.settings,next=[];
      for(const m of this.live()){
        if(m.dying)continue;let gx=0,gy=0,ax=0,ay=0,rx=0,ry=0,ix=0,iy=0,total=0;
        if(this.vascular.steer(m)){this.updateMechanics(m);continue;}
        const gradient=key=>{const f=this.fields[key];let x=0,y=0,n=0;for(const [i,amount] of m.fieldBins){const g=f.gradient(i%f.width,Math.floor(i/f.width));x+=g[0]*amount;y+=g[1]*amount;n+=amount;}return [x/(n||1),y/(n||1)];};
        if(m.kind===IMMUNE){
          if(m.immunePhenotype==='suppressive')[gx,gy]=gradient('normalDamage');
          else {const a=gradient('danger'),b=gradient('trail');gx=a[0]+b[0]*1.8;gy=a[1]+b[1]*1.8;}
        }
        else if(m.kind===NORMAL){[gx,gy]=gradient('cohesion');}
        else {const g=gradient('cohesion');gx=g[0]*.25;gy=g[1]*.25;}
        const magnitude=Math.hypot(gx,gy);if(magnitude>0){const gain=Math.min(1,magnitude/.035);gx=gx/magnitude*gain;gy=gy/magnitude*gain;}
        // This cue reads only phenotype-specific local gradients. Concentration
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
        // Tumors also bias migration toward local nutrients before stress develops.
        // This phenomenological taxis uses only the gradients at the actual body;
        // it neither reveals distant sources nor overrides mechanical constraints.
        if(m.kind===TUMOR){const tx=o[0]+g[0],ty=o[1]+g[1],tn=Math.hypot(tx,ty);if(tn){const gain=.8*s.chemotaxis*Math.min(1,tn/.025);ex+=tx/tn*gain;ey+=ty/tn*gain;}}
        const angle=(this.C.random()-.5)*s.noise*.36*Math.sqrt(Math.max(0,dt));
        const patrol=m.kind===IMMUNE&&dt>0?this.patrolDirection(m,dt,angle):null;
        const px=patrol?patrol.px:m.px*Math.cos(angle)-m.py*Math.sin(angle),py=patrol?patrol.py:m.px*Math.sin(angle)+m.py*Math.cos(angle);
        const blend=1-Math.exp(-dt/12);
        let nx=px+blend*(chemo*gx+s.alignment*ax+repel*rx+peerSeparation*ix+ex),ny=py+blend*(chemo*gy+s.alignment*ay+repel*ry+peerSeparation*iy+ey);
        if(patrol){const p=m.patrolMotion;nx+=patrol.memory*(p.hx-px);ny+=patrol.memory*(p.hy-py);const follow=1-Math.exp(-dt/64),n=Math.hypot(nx,ny)||1;p.hx+=(nx/n-p.hx)*follow;p.hy+=(ny/n-p.hy)*follow;const h=Math.hypot(p.hx,p.hy)||1;p.hx/=h;p.hy/=h;}
        const norm=Math.hypot(nx,ny)||1;next.push([m,nx/norm,ny/norm]);
      }
      for(const [m,x,y] of next){m.px=x;m.py=y;this.updateMechanics(m);}
    }
    immuneInteractions(dt){
      this.immuneRegulation(dt);
      this.scanPatrol(dt);
      for(const m of this.live())if((m.kind===TUMOR||m.state==='abnormal')&&!m.dying)m.damage*=Math.exp(-dt/400);
      const seen=new Set();
      for(const ctl of this.live()){
        if(ctl.kind!==IMMUNE||ctl.dying)continue;
        if(dt>0&&this.checkImmuneLifespan(ctl))continue;
        let chosen=null;ctl.targetID=0;ctl.phase='search';ctl.recognition={target:0,score:0,stimulus:0,execution:0,reasons:['no-contact']};
        for(const edge of this.contacts.get(ctl.id)?.values()||[]){
          const target=this.cells[edge.id];if(!target||target.dying||!(target.kind===TUMOR||target.state==='abnormal')||edge.length<1)continue;
          const recognition=this.immunity.evaluate(ctl,target,true);
          if(!ctl.recognition.target||recognition.stimulus>ctl.recognition.stimulus||recognition.score>ctl.recognition.score)ctl.recognition=recognition;
          const encounterKey=ctl.geneClone+':'+target.geneClone;
          this.immunity.encounters.set(encounterKey,{immune:ctl.geneClone,target:target.geneClone,time:this.C.time,matched:recognition.score>=CellLabImmunity.threshold,stimulated:recognition.stimulus>0});
          if(this.immunity.encounters.size>512)this.immunity.encounters.delete(this.immunity.encounters.keys().next().value);
          const key=ctl.id+':'+target.id;
          if(!recognition.stimulus){if(ctl.recruitmentTargetID===target.id&&ctl.recruitmentTargetBirth===target.birth){ctl.recruitment=0;ctl.recruitmentTargetID=0;ctl.recruitmentTargetBirth=0;}const old=this.histories.get(key);if(old)old.recognized=false;continue;}
          seen.add(key);
          let h=this.histories.get(key);if(!h){h={ctl:ctl.id,target:target.id,dwell:0,recognized:false};this.histories.set(key,h);}
          if(dt>0){h.contactGap=0;h.episodeDwell=(h.episodeDwell||0)+dt*Math.min(1,edge.length/(3*this.scale))*ctl.fitness;
            if(h.episodeDwell>=6&&!h.episodeCounted){h.episodeCounted=true;target.immuneEncounters++;target.immuneContactMemory=clamp(target.immuneContactMemory+.18);}}
          h.dwell+=dt*Math.min(1,edge.length/(3*this.scale))*recognition.stimulus;
          if(!h.recognized&&h.dwell>=12){h.recognized=true;this.counters.recognitions++;this.log('recognize',ctl.id,target.id);}
          if(!chosen||h.dwell>chosen.h.dwell)chosen={target,edge,h,recognition};
        }
        if(chosen){
          ctl.recognition=chosen.recognition;
          ctl.phase=chosen.h.recognized?'kill':'scan';
          // Only the currently contacting, antigen-positive target gets damage.
          if(chosen.h.recognized){
            ctl.targetID=chosen.target.id;ctl.activation=700;ctl.recruitment=200;ctl.recruitmentTargetID=chosen.target.id;ctl.recruitmentTargetBirth=chosen.target.birth;
            const delivered=dt*.012*this.settings.kill*chosen.recognition.execution*Math.min(1,chosen.edge.length/(3*this.scale));
            chosen.target.damage+=delivered;if(delivered>0)this.immunity.expose(chosen.target,.25);
            if(chosen.target.damage>=1&&this.beginDeath(chosen.target.id,'kill')){
              // Credit the contact that commits irreversible death, once per
              // target birth. Other contributors are not counted as extra kills.
              Object.assign(chosen.target.deathRecord,{killerID:ctl.id,killerBirth:ctl.birth});
              if(chosen.target.kind===TUMOR){ctl.tumorKills++;this.checkImmuneLifespan(ctl);}
            }
          }
        }
        this.updateMechanics(ctl);
      }
      for(const [key,h] of this.histories){
        if(!this.cells[h.ctl]||!this.immuneTarget(this.cells[h.target]))this.histories.delete(key);
        else if(!seen.has(key)){h.contactGap=(h.contactGap||0)+dt;if(h.contactGap>=20){h.episodeDwell=0;h.episodeCounted=false;}h.dwell=Math.max(0,h.dwell-dt*.5);if(!h.dwell&&h.contactGap>=20)this.histories.delete(key);}
      }
    }
    immuneRegulation(dt){
      if(dt<=0)return;
      const s=this.settings;
      for(const m of this.live())if(m.kind===IMMUNE&&!m.dying){
        m.immuneRefractory=Math.max(0,m.immuneRefractory-dt);
        // Endogenous injury is diluted over a cell's occupied field bins. Its
        // dimensionless response scale must match that source, not a 30-unit
        // manually painted pulse; otherwise natural tissue injury is inert.
        const injury=this.fieldOnCell(m,'normalDamage'),u=injury/(.03+injury);
        m.normalDamageExposure=clamp(u+(m.normalDamageExposure-u)*Math.exp(-dt/s.immuneRegulationMemory));
        m.inhibition=this.fieldOnCell(m,'inhibition');
        if(m.immunePhenotype==='suppressive'){
          // Both recent history and present dose must fall. Self-secreted
          // inhibition does not lock the cell into its suppressive phenotype.
          const relief=clamp((.5-Math.max(m.normalDamageExposure,u))/.5),hazard=.001*s.suppressionRecovery*relief**2;
          if(hazard>0&&this.C.random()<-Math.expm1(-hazard*dt)){
            this.deactivateImmune(m);m.immunePhenotype='cytotoxic';this.counters.suppressiveRecoveries++;
            this.log('immune-recovery',m.id,0,{birth:m.birth,normalDamageExposure:m.normalDamageExposure});
          }
          continue;
        }
        if(m.activation>0){
          const injuryRate=.0008*s.damageDeactivation*m.normalDamageExposure**2,signalRate=.0012*s.suppressionStrength*m.inhibition/(.35+m.inhibition),hazard=injuryRate+signalRate;
          if(hazard>0&&this.C.random()<-Math.expm1(-hazard*dt)){
            const cause=this.C.random()*hazard<injuryRate?'injury':'signal';
            this.deactivateImmune(m);this.counters[cause==='injury'?'injuryDeactivations':'signalDeactivations']++;
            this.log('immune-deactivation',m.id,0,{birth:m.birth,cause,normalDamageExposure:m.normalDamageExposure,inhibition:m.inhibition});
          }
        }else{
          const hazard=.00045*s.damagePolarization*m.normalDamageExposure**2;
          if(hazard>0&&this.C.random()<-Math.expm1(-hazard*dt)){
            this.deactivateImmune(m);m.immunePhenotype='suppressive';this.counters.suppressiveTransitions++;
            this.log('immune-suppressive',m.id,0,{birth:m.birth,normalDamageExposure:m.normalDamageExposure});
          }
        }
      }
    }
    deactivateImmune(m){
      m.activation=0;m.recruitment=0;m.recruitmentTargetID=0;m.recruitmentTargetBirth=0;m.il2Production=0;m.targetID=0;m.phase='search';m.immuneRefractory=240;
      for(const [key,h]of this.histories)if(h.ctl===m.id)this.histories.delete(key);
      // This changes function, not geometry, stored antigen memory or already
      // delivered target damage. The refractory interval prevents same-step reactivation.
      this.updateMechanics(m);
    }
    updateLocal(dt){this.refreshPositions();this.scanContacts();this.section?.updateJunctions(0);this.immuneInteractions(dt);this.updatePolarity(dt);}
    scanPatrol(dt){
      if(dt<=0)return;const seen=new Set();
      for(const ctl of this.live())if(ctl.kind===IMMUNE&&!ctl.dying){
        if(ctl.patrolCheckedBirth!==ctl.birth){ctl.patrolCheckedBirth=ctl.birth;ctl.patrolCheckedSet=new Set();ctl.patrolChecked=0;}
        ctl.patrolScanning=false;
        for(const edge of this.contacts.get(ctl.id)?.values()||[]){const target=this.cells[edge.id];if(!target||target.dying||target.kind===IMMUNE||edge.length<1)continue;
          ctl.patrolScanning=true;const key=ctl.birth+':'+target.birth;seen.add(key);
          const dwell=Math.min(6,(this.patrol.contacts.get(key)||0)+dt*Math.min(1,edge.length/(3*this.scale))*ctl.fitness);this.patrol.contacts.set(key,dwell);
          if(dwell>=6){this.patrol.checked.add(target.birth);ctl.patrolCheckedSet.add(target.birth);ctl.patrolChecked=ctl.patrolCheckedSet.size;}
        }
      }
      for(const key of this.patrol.contacts.keys())if(!seen.has(key))this.patrol.contacts.delete(key);
    }
    patrolReport(area){
      let visitedPixels=0,freePixels=0;if(area){({visitedPixels,freePixels}=area);}else for(const i of this.positions)if(this.C.cellKind(this.C.pixti(i))!==WALL){freePixels++;visitedPixels+=this.patrol.visited[i];}
      let currentTargets=0,currentChecked=0;for(const m of this.live())if(!m.dying&&m.kind!==IMMUNE){currentTargets++;if(this.patrol.checked.has(m.birth))currentChecked++;}
      return {coverage:freePixels?visitedPixels/freePixels:0,visitedPixels,freePixels,checkedCells:this.patrol.checked.size,currentChecked,currentTargets,scanThreshold:6};
    }
    log(type,id,target=0,detail={}){this.events.push({time:this.C.time,type,id,target,...detail});if(this.events.length>1000)this.events.shift();}
    checkImmuneLifespan(m){
      if(m.kind!==IMMUNE||m.dying||!this.settings.immuneKillLimit||m.tumorKills<this.settings.immuneKillLimit)return false;
      return this.beginDeath(m.id,'lifespan');
    }
    beginDeath(id,cause){
      const m=this.cells[id];if(!m||m.dying)return false;
      this.immunity.expose(m);
      m.dying=true;m.deathCause=cause;m.deathStartedAt=this.C.time;m.targetID=0;m.phase='dying';m.recruitment=0;
      m.deathElapsed=0;m.deathProgress=0;m.deathArea=this.C.getVolume(id);m.deathIntact=cause==='kill';
      m.deathPhase=cause==='kill'?'rounding':cause==='spontaneous'||cause==='lifespan'?'shrinking':'withering';
      if(m.deathIntact)m.target=m.deathArea/(this.section?m.sectionFraction:1);
      // Keep a separate lifetime ledger: the rolling interaction log cannot
      // serve as a complete death history, and grid IDs may later be reused.
      m.deathRecord={id,birth:m.birth,kind:m.kind,state:m.state,clone:m.clone,cause,effect:cause==='kill'?'lysis':cause==='spontaneous'||cause==='lifespan'?'apoptosis':'stress',startedAt:this.C.time,clearedAt:null,...(cause==='lifespan'?{tumorKills:m.tumorKills,killLimit:this.settings.immuneKillLimit}:{})};
      this.deathHistory.push(m.deathRecord);const keys=DEATH_COUNTERS[cause];if(keys)this.counters[keys[0]]++;
      this.section?.forget(id);this.updateMechanics(m);this.log('death-start',id,0,{cause,birth:m.birth});
      for(const ctl of this.live())if(ctl.targetID===id){ctl.targetID=0;ctl.phase='search';this.updateMechanics(ctl);}return true;
    }
    eraseCell(id,{manual=false,points=null}={}){
      const m=this.cells[id];
      if(manual&&!m)return;
      if(m?.dying)m.deathFinalArea=this.C.getVolume(id);
      this.section?.forget(id);
      if(this.pixelIndex&&!points){for(const i of this.pixelIndex.indices(id))this.C.setpixi(i,0);}
      else {const occupied=points||[...this.C.pixels()].filter(([,cid])=>cid===id).map(([p])=>p);for(const p of occupied)this.C.setpix(p,0);}
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
      if(ids.size){this.refreshPositions();this.scanContacts();this.vascular.measure(0);this.prepareEnvironment();this.section?.updateJunctions(0);this.updateScenarioState();this.record();this.version++;}
      return {removed:ids.size};
    }
    eraseAll(points,radius){
      const empty={removed:0,sources:0,wallPixels:0};
      if(!Array.isArray(points)||!Number.isFinite(radius)||radius<=0)return empty;
      const valid=points.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=0&&p[1]>=0&&p[0]<this.width&&p[1]<this.height);
      if(!valid.length)return empty;
      const r=Math.min(radius,64*this.scale),result={...this.eraseCells(valid,r),sources:0,wallPixels:0},bins=new Set(),C=this.C;
      for(const v of this.vascular.vessels)if(v.active&&valid.some(([x,y])=>this.vascular.distance(x,y,v)<=r)){for(const m of this.live())if(m.vesselID===v.id){this.eraseCell(m.id,{manual:true});result.removed++;}v.active=false;v.perfusion=0;v.area=0;this.vascular.rebuildRegion();this.vascular.prepareExchange();}
      for(const p of valid){
        result.sources+=this.removeSources(p[0],p[1],r);let walls=0;
        for(let dy=-Math.ceil(r);dy<=r;dy++)for(let dx=-Math.ceil(r);dx<=r;dx++)if(dx*dx+dy*dy<=r*r){
          let x=Math.round(p[0])+dx,y=Math.round(p[1])+dy;if(this.wrap){x=(x%this.width+this.width)%this.width;y=(y%this.height+this.height)%this.height;}
          if(x<0||y<0||x>=this.width||y>=this.height)continue;
          const id=C.pixt([x,y]);if(id&&C.cellKind(id)===WALL){C.setpix([x,y],0);walls++;}
          bins.add(this.fieldIndex(x,y));
        }
        result.wallPixels+=walls;
        if(walls&&this.maze)this.maze.cutouts.push([Math.round(p[0])+.5,Math.round(p[1])+.5,r]);
      }
      if(result.wallPixels){C.stat_values={};this.rebuildMask();}
      // Reset the touched extracellular field bins, not cell memories or history.
      // Remaining neighboring cells and sources can subsequently replenish them.
      for(const [name,f]of Object.entries(this.fields))for(const i of bins)f.values[i]=f.blocked[i]?0:(name==='oxygen'||name==='glucose'?1:0);
      this.version++;return result;
    }
    cleanup(){for(const m of this.live())if(!this.C.getVolume(m.id))this.eraseCell(m.id);}
    countDeath(cause,m){
      if(!m||m.deathCounted)return;m.deathCounted=true;
      if(m.vesselID)this.counters.endothelialDeaths++;
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
    fieldOnCell(m,name){
      const f=this.fields[name];let total=0,area=0;
      for(const [i,pixels]of m.fieldBins)if(!f.blocked[i]){total+=f.values[i]*pixels;area+=pixels;}
      return area?total/area:0;
    }
    immuneProgram(m,dt){
      // A stored activation timer or a nearby cytokine is never evidence of
      // antigen contact. Recheck the actual contacting, recognized target.
      const target=this.cells[m.targetID],edge=this.contacts.get(m.id)?.get(m.targetID),history=this.histories.get(m.id+':'+m.targetID);
      const recognition=target&&edge?this.immunity.evaluate(m,target,true):null;
      const signal=m.immunePhenotype!=='suppressive'&&m.immuneRefractory<=0&&this.immuneTarget(target)&&edge&&history?.recognized?Math.min(1,edge.length/(3*this.scale))*(recognition?.stimulus||0):0;
      m.antigenMemory=clamp(m.antigenMemory*Math.exp(-Math.LN2*dt/this.settings.antigenMemory)+(1-Math.exp(-signal*dt/45))*(1-m.antigenMemory));
      m.il2Production=Math.max(0,m.il2Production-dt);
      if(signal>0&&dt>0)m.il2Production=240;
      m.chronicStimulation=signal+(m.chronicStimulation-signal)*Math.exp(-dt/600);
      m.exhaustion=clamp(m.exhaustion+dt*this.settings.exhaustionRate*m.chronicStimulation**2/2400-(signal?0:dt*(1-m.chronicStimulation)/5000));
      m.il2=this.fieldOnCell(m,'il2');m.il2Response=m.il2/(.15+m.il2)*(.15+.85*m.antigenMemory);
    }
    initializeStemness(m){
      m.isStem=m.kind===TUMOR&&this.settings.stemFraction>0&&this.C.random()<this.settings.stemFraction/100;m.stemNiche=0;
      m.tumorDivisionsLeft=m.kind===TUMOR&&!m.isStem&&this.settings.tumorProgenyLimit>0?this.settings.tumorProgenyLimit:null;
    }
    stemProgram(m,dt){
      if(dt<=0||m.dying||m.kind!==TUMOR)return;
      // A local, sustained hypoxic niche is a proxy for plasticity signals.
      // This is not a claim that hypoxia alone universally makes a CSC.
      const niche=clamp((.55-m.oxygen)/.4)*clamp((m.glucose-.1)/.3);
      m.stemNiche+=(niche-m.stemNiche)*(-Math.expm1(-dt/240));
      if(m.isStem||!this.settings.stemPlasticity||m.stemNiche<.2||m.fitness<.15||m.resources.energy<.15)return;
      const hazard=.00003*this.settings.stemPlasticity*m.stemNiche*m.stemNiche;
      if(this.C.random()<-Math.expm1(-hazard*dt)){m.isStem=true;m.tumorDivisionsLeft=null;this.counters.stemReversions++;this.log('stem-reversion',m.id,0,{niche:m.stemNiche});}
    }
    stemDivision(m,daughter,parentStem,parentBudget){
      if(m.kind!==TUMOR)return '';
      let mode='differentiated',fates=[false,false];
      if(parentStem){
        if(this.C.random()<this.settings.stemSymmetry/100){
          const renew=this.C.random()<this.settings.stemRenewal/100;fates=[renew,renew];mode=renew?'self-renewal':'differentiation';
          this.counters[renew?'stemSelfRenewal':'stemDifferentiation']++;
        }else{const first=this.C.random()<.5;fates=[first,!first];mode='asymmetric';this.counters.stemAsymmetric++;}
      }
      for(const [i,c]of [m,daughter].entries()){
        c.isStem=fates[i];c.stemNiche=m.stemNiche;
        c.tumorDivisionsLeft=c.isStem?null:parentStem?(this.settings.tumorProgenyLimit||null):parentBudget===null?null:Math.max(0,parentBudget-1);
      }
      return mode;
    }
    traitEconomy(m){
      if(m.kind!==TUMOR||!m.genome||!this.settings.traitCost)return {demand:1,growth:1,migration:1};
      const g=m.genome,k=this.settings.traitCost,p=Math.max(0,g.proliferation-1),v=Math.max(0,g.invasion-1),t=Math.max(0,g.tolerance-1),r=Math.max(0,(m.repairTrait||1)-1);
      return {demand:1+k*(.35*p*p+.25*v*v+.2*t*t+.15*r*r),growth:1/(1+k*(.2*v*v+.15*t*t)),migration:1/(1+k*.2*p*p)};
    }
    metabolicProfile(m){
      const cycling=m.cycle.phase!=='G0'&&!m.cycle.arrest,legacy=m.dying?.6:m.kind===TUMOR?(cycling?1.15:.6):m.kind===IMMUNE?(cycling?1.35:.8):1;
      const base=m.vesselID?[.18,.65,.4]:m.kind===TUMOR?[1,1.35,1.2]:m.kind===IMMUNE?[.7,.8,.45]:[.55,.4,.3];
      const phase=PHASE_RESOURCE[m.cycle.phase],k=m.dying?0:this.settings.cycleCoupling,cost=this.traitEconomy(m).demand;
      // Arrested effectors may remain activated; cell cycle is not effector state.
      const effector=m.kind===IMMUNE&&m.activation>0&&m.immunePhenotype!=='suppressive',active=cycling||effector;
      const factors=m.kind===NORMAL&&!cycling?[1,1,1]:active?phase:PHASE_RESOURCE.G0;
      const phaseFloor=effector?1.15:0;
      return {oxygen:base[0]*((1-k)*legacy+k*Math.max(phaseFloor,factors[0]))*cost,glucose:base[1]*((1-k)*legacy+k*Math.max(phaseFloor,factors[1]))*cost,acid:base[2]*((1-k)*legacy+k*Math.max(phaseFloor,factors[2]))*cost,energyCost:(active?phase[3]:.48)*cost+(effector?.18:0),materialCost:cycling?phase[4]:.18};
    }
    reserveAmounts(m){const capacity=this.settings.reserveCapacity*Math.max(.05,m.target/Math.max(1,m.base));return {energy:capacity*m.resources.energy,precursor:capacity*m.resources.precursor};}
    updateResources(m,dt){
      const k=this.settings.cycleCoupling;if(!k||dt<=0||m.dying)return;
      const r=m.resources,p=this.metabolicProfile(m),capacity=this.settings.reserveCapacity;
      const acid=clamp(1-.85*m.acid/Math.sqrt(m.genome?.tolerance||m.normalTolerance||1)),glucose=1.15*m.glucose/(.15+m.glucose),oxygen=1.2*m.oxygen/(.2+m.oxygen);
      // Finite buffered pools. No glucose means no replenishment even in G0.
      const intake=glucose*(m.vesselID?.8+.2*oxygen:.25+.75*oxygen)*acid;
      r.energy=clamp(r.energy+dt*k*(1.35*intake-p.energyCost)/capacity);
      r.precursor=clamp(r.precursor+dt*k*(1.2*glucose*acid-p.materialCost)/capacity);
      const shortage=.7*clamp((.4-r.energy)/.4)+.9*clamp((.35-r.precursor)/.35)+.5*clamp((.18-m.oxygen)/.18);
      const injury=m.cycle.phase==='S'?this.settings.replicationStress*(shortage+.12*m.acid)/300:0;
      const repair=this.settings.dnaRepair*(m.repairTrait||1)*(m.isStem?this.settings.stemRepair:1)*Math.min(r.energy,r.precursor)*acid*(m.cycle.phase==='S'?.35:1)/500;
      const repaired=Math.min(r.dnaDamage,dt*k*repair);r.dnaDamage=clamp(r.dnaDamage+dt*k*injury-repaired);
      r.energy=clamp(r.energy-repaired*.15);r.precursor=clamp(r.precursor-repaired*.2);
      if(r.dnaDamage>=.98&&this.beginDeath(m.id,'environment')){m.deathRecord.trigger='replication';this.counters.replicationDeaths++;}
    }
    cycleStep(m,dt){
      if(dt<=0)return;
      const c=m.cycle,immune=m.kind===IMMUNE,s=this.settings;
      const normal=m.kind===NORMAL,committed=['S','G2','M'].includes(c.phase),economy=this.traitEconomy(m);
      if(immune)this.immuneProgram(m,dt);
      this.updateResources(m,dt);if(m.dying)return;
      const area=this.C.getVolume(m.id),fraction=this.section?m.sectionFraction:1;
      const ratio=area/Math.max(1,m.target*fraction);
      // Trigger within the finite deformation allowance: at default sensitivity
      // the gate is reached at ~87% of the current section target, before 82%.
      c.pressure=clamp((.96-ratio)/.12);
      const capacity=normal?s.normalRepair:immune?s.immuneGrowth*2:s.growth*m.genome.proliferation*economy.growth;
      const stored=Math.min(1,m.resources.energy/.25,m.resources.precursor/.25)*clamp(1-.85*m.acid/Math.sqrt(m.genome?.tolerance||1));
      const nutrientRate=(m.fitness*(1-s.cycleCoupling)+stored*s.cycleCoupling)*(1-m.stress);
      const il2Support=immune&&committed?m.il2/(.15+m.il2)*Math.max(.4,.15+.85*m.antigenMemory):m.il2Response;
      c.drive=capacity*nutrientRate*(immune?il2Support*(1-m.exhaustion)**2:1);
      let reason='';
      if(immune&&(m.immunePhenotype==='suppressive'||m.immuneRefractory>0))reason='suppression';
      else if(capacity<=0)reason='disabled';
      else if(m.kind===TUMOR&&!m.isStem&&m.tumorDivisionsLeft===0)reason='lineage';
      else if(normal&&m.divisionsLeft<=0)reason='lineage';
      else if(normal&&!committed&&m.freeFraction<.12)reason='contact';
      else if(m.oxygen<(committed&&s.cycleCoupling?.04:.12)||m.glucose<(committed&&s.cycleCoupling?.03:.15)||nutrientRate<.16)reason='nutrients';
      else if(m.acid>.8)reason='acid';
      else if(m.damage>.55||m.stress>.75)reason='injury';
      else if(s.cycleCoupling&&Math.min(m.resources.energy,m.resources.precursor)<(committed?.08:.22))reason='reserve';
      else if(s.cycleCoupling&&m.resources.dnaDamage>(1-.55*(normal||immune?1:s.checkpointIntegrity)))reason='dna';
      else if(immune&&m.divisionsLeft<=0)reason='lineage';
      else if(immune&&m.exhaustion>.72)reason='exhaustion';
      else if(immune&&!committed&&m.antigenMemory<.2)reason='antigen';
      else if(immune&&il2Support<.12)reason='il2';
      else if(c.pressure*(immune?1:s.tumorQuiescence)>.72)reason='space';
      c.arrest=reason;
      if(reason){
        c.entry=0;c.blockedFor+=dt;
        // Reversible G1 restriction point. S/G2/M preserve phase under stress;
        // loss of antigen memory alone cannot undo already replicated DNA.
        if(c.phase==='G1'&&c.blockedFor>=60){c.phase='G0';c.progress=0;}
        if(immune&&c.phase==='G0'&&['antigen','lineage','disabled'].includes(reason)&&m.target>m.base)m.target=Math.max(m.base,m.target-dt*.3*this.scale*this.scale);
        return;
      }
      c.blockedFor=0;
      if(c.phase==='G0'){
        c.entry+=dt*Math.min(1,c.drive/.2);
        if(c.entry>=20+(m.birth%5)*2){c.phase='G1';c.progress=0;c.entry=0;}
        return;
      }
      const desired=m.base*(normal?2:immune?1.7:1),growth=normal?s.normalRepair:immune?s.immuneGrowth:s.growth*m.genome.proliferation*economy.growth;
      const massBefore=m.target,amounts=this.reserveAmounts(m);
      this.growTarget(m,desired,dt*this.scale*this.scale*growth*nutrientRate*(immune?il2Support*(1-m.exhaustion)**2:1));
      if(s.cycleCoupling&&m.target>massBefore){const newCapacity=s.reserveCapacity*Math.max(.05,m.target/m.base);m.resources.energy=clamp(amounts.energy/newCapacity);m.resources.precursor=clamp(amounts.precursor/newCapacity);}
      const duration=(normal?360:immune?s.immuneCycle:s.tumorCycle*(m.isStem?s.stemCycleSlowdown:1))*CYCLE_FRACTIONS[c.phase];
      c.progress=Math.min(1,c.progress+dt*c.drive/duration);
      // Biomass is a separate checkpoint. Time alone never makes cytoplasm.
      const minimum=c.phase==='G1'?desired*.68:desired*.98;
      if(c.progress>=1&&m.target<minimum){c.arrest='growth';return;}
      if(c.progress<1)return;
      if(c.phase!=='M'){c.phase=CYCLE_STAGES[CYCLE_STAGES.indexOf(c.phase)+1];c.progress=0;return;}
      if(m.target<desired||area<desired*.9*fraction){c.arrest='space';return;}
      c.retry=Math.max(0,c.retry-dt);
      if(c.retry>0){c.arrest='geometry';return;}
      if(!this.divide(m.id)){c.arrest='geometry';c.retry=12;}
    }
    cycleReport(){
      const report=Object.fromEntries(['normal','tumor','immune','endothelial'].map(k=>[k,{G0:0,G1:0,S:0,G2:0,M:0,arrested:0}]));
      for(const m of this.live())if(!m.dying&&m.state!=='abnormal'){const r=report[m.vesselID?'endothelial':m.kind===TUMOR?'tumor':m.kind===IMMUNE?'immune':'normal'];r[m.cycle.phase]++;if(m.cycle.phase!=='G0'&&m.cycle.arrest)r.arrested++;}
      return report;
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
        if(m.vesselID){this.vascular.biology(m,dt);continue;}
        if(dt>0&&this.checkImmuneLifespan(m))continue;
        this.evolutionStep(m,dt);this.transformation(m,dt,true);
        if(m.kind===TUMOR){
          this.stemProgram(m,dt);
          const hazard=this.settings.apoptosis/100/1000;
          if(this.C.random()<1-Math.exp(-hazard*dt)){this.beginDeath(m.id,'spontaneous');continue;}
          this.cycleStep(m,dt);
        }else if(m.kind===IMMUNE){
          this.cycleStep(m,dt);
          if(m.target<m.base)this.growTarget(m,m.base,dt*.8*this.scale*this.scale*m.fitness);
        }else if(m.state==='normal'){this.cycleStep(m,dt);if(m.target<m.base)this.growTarget(m,m.base,dt*.8*this.scale*this.scale*m.fitness);}
        else if(m.target<m.base)this.growTarget(m,m.base,dt*.8*this.scale*this.scale*m.fitness);
        this.updateMechanics(m);
      }
      if(dt>0)this.shedDeathRemnants();
    }
    shedDeathRemnants(){
      // CPM can shrink into medium only if medium is available. In a completely
      // confluent layer a dead remnant can otherwise remain trapped forever.
      // After 120 MCS, shed ONLY committed non-lytic corpses from their exposed
      // membrane. The quadratic envelope vanishes at 240 MCS; healthy bodies,
      // solid walls and the lytic round/swell/rupture sequence are untouched.
      const pending=new Map();
      for(const m of this.live())if(m.dying&&m.deathCause!=='kill'&&m.deathElapsed>120){
        const maximum=Math.ceil(m.deathArea*clamp((240-m.deathElapsed)/120)**2);
        if(this.C.getVolume(m.id)>maximum)pending.set(m.id,{m,maximum,points:[]});
      }
      if(!pending.size)return;
      if(this.pixelIndex){for(const [id,body]of pending)body.points=this.pixelIndex.indices(id);}
      else for(const [p,id]of this.C.pixels())pending.get(id)?.points.push(this.C.grid.p2i(p));
      const grid=this.C.grid._pixels;
      for(const [id,{m,maximum,points}]of pending){
        const radius=i=>{let dx=this.xs[i]-m.x,dy=this.ys[i]-m.y;if(this.wrap){dx-=Math.round(dx/this.width)*this.width;dy-=Math.round(dy/this.height)*this.height;}return dx*dx+dy*dy;};
        points.sort((a,b)=>radius(b)-radius(a)||a-b);
        let budget=this.C.getVolume(id)-maximum,changed=true;
        while(budget>0&&changed){changed=false;for(const i of points){
          if(!budget)break;if(grid[i]!==id||!this.faces[i].some(j=>grid[j]!==id)&&this.faces[i].length===4)continue;
          this.C.setpixi(i,0);budget--;changed=true;
        }}
        m.deathProgress=clamp(1-this.C.getVolume(id)/Math.max(1,m.deathArea));
        if(this.C.getVolume(id)<=3*this.scale*this.scale)this.eraseCell(id);
      }
    }
    components(id){
      const remaining=new Set(this.pixelIndex?this.pixelIndex.indices(id):[]);
      if(!this.pixelIndex)for(const [p,cid] of this.C.pixels())if(cid===id)remaining.add(this.C.grid.p2i(p));
      const parts=[];while(remaining.size){const seed=remaining.values().next().value,queue=[seed],part=[];remaining.delete(seed);while(queue.length){const i=queue.pop();part.push(i);for(const n of (this.section?this.faces[i]:this.neighbors[i]))if(remaining.delete(n))queue.push(n);}parts.push(part);}return parts;
    }
    divide(id){
      const m=this.cells[id];if(!m||m.dying||m.state==='abnormal'||(m.kind===TUMOR&&!m.isStem&&m.tumorDivisionsLeft===0)||this.C.getVolume(id)<80*this.scale*this.scale||(m.kind===NORMAL&&m.divisionsLeft<=0)||(m.kind===IMMUNE&&(m.divisionsLeft<=0||(this.settings.immuneKillLimit>0&&m.tumorKills>=this.settings.immuneKillLimit))))return 0;
      // Relabelling existing cytoplasm is not a new protrusion. Preserve its Act
      // age instead of letting GridManipulator turn the whole daughter red.
      const activity=this.pixelIndex?this.pixelIndex.indices(id).map(i=>[i,this.act.pxact(i)]):[];
      if(!this.pixelIndex)for(const [p,cid] of this.C.pixels())if(cid===id){const i=this.C.grid.p2i(p);activity.push([i,this.act.pxact(i)]);}
      const restoreActivity=()=>{for(const [i,a] of activity)this.act.setActivity(i,a);};
      const parentTarget=m.target,parentFraction=m.sectionFraction,parentArea=this.C.getVolume(id),divisionX=m.x,divisionY=m.y;
      const parentStem=m.isStem,parentBudget=m.tumorDivisionsLeft;
      const parentBase=m.base,parentResources={...m.resources},parentAmounts=this.reserveAmounts(m);
      this.C.stat_values={};this.divisionParent=m;let child;
      try{
        if(this.pixelIndex){
          // Feed the unchanged upstream division algorithm exactly the pixels
          // and centroid it reads. Do not compute unrelated cells' statistics.
          // These private, target-only caches must not escape this call.
          const pixels={[id]:activity.map(([i])=>[this.xs[i],this.ys[i]])};
          const Type=this.wrap?CPM.CentroidsWithTorusCorrection:CPM.Centroids,stat=new Type();stat.model=this.C;
          this.C.stat_values.PixelsByCell=pixels;
          this.C.stat_values[Type.name]={[id]:stat.computeCentroidOfCell(id,pixels)};
        }
        child=this.wrap?this.gm.divideCellTorus(id):this.gm.divideCell(id);
      }finally{this.divisionParent=null;if(this.pixelIndex)this.C.stat_values={};}
      this.refreshPositions();const daughter=this.cells[child],nuclei=this.section&&daughter?[this.section.findNucleus(m,activity.map(x=>x[0])),this.section.findNucleus(daughter,activity.map(x=>x[0]))]:null;
      if(!this.C.getVolume(child)||this.components(id).length!==1||this.components(child).length!==1||(nuclei&&nuclei.some(p=>!p))){
        if(this.pixelIndex){for(const i of this.pixelIndex.indices(child))this.C.setpixi(i,id);}
        else {const points=[...this.C.pixels()].filter(([,cid])=>cid===child).map(([p])=>p);for(const p of points)this.C.setpix(p,id);}
        delete this.cells[child];this.contacts.delete(child);restoreActivity();this.C.stat_values={};this.refreshPositions();return 0;
      }
      restoreActivity();
      this.section?.forget(id);
      const parentBirth=m.birth,generation=m.generation+1,left=m.divisionsLeft===null?null:m.divisionsLeft-1,genome=m.genome?{...m.genome}:null,damage=m.damage*.5;
      const parentGeneClone=m.geneClone,parentExpression=structuredClone(m.expression);
      const inherited={primed:m.primed,primingBoosted:m.primingBoosted,antigenMemory:m.antigenMemory*.72,exhaustion:m.exhaustion,chronicStimulation:m.chronicStimulation,il2Production:m.il2Production,il2:m.il2,il2Response:m.il2Response,normalTolerance:m.normalTolerance,mutationPressure:m.mutationPressure,immuneEncounters:0,immuneContactMemory:m.immuneContactMemory*.5,recruitmentExposure:m.recruitmentExposure*.5,lastAntigenChange:m.lastAntigenChange};
      Object.assign(inherited,{immunePhenotype:m.immunePhenotype,normalDamageExposure:m.normalDamageExposure*.5,inhibition:m.inhibition,immuneRefractory:m.immuneRefractory});
      if(m.vesselID)Object.assign(inherited,{vesselID:m.vesselID,endothelialInjury:m.endothelialInjury*.8,lifespanScale:m.lifespanScale,repairProgress:0});
      if(m.vascularID)Object.assign(inherited,{vascularID:m.vascularID,vascularPhase:m.vascularPhase,vascularContact:0,circulationAge:m.circulationAge,bloodstreamEnteredAt:m.bloodstreamEnteredAt});
      const learned=structuredClone(m.learnedReceptors||[]),cargo=structuredClone(m.antigenCargo||[]);
      for(const c of [m,daughter]){
        if(c.kind===IMMUNE){c.learnedReceptors=structuredClone(learned);c.antigenCargo=structuredClone(cargo);c.antigenContacts={};}
        c.cycle=newCycle();Object.assign(c,inherited);c.tumorKills=0;
        c.target=this.section?parentTarget*this.C.getVolume(c.id)/parentArea:this.C.getVolume(c.id);c.sectionFraction=parentFraction;c.age=0;c.damage=damage;c.targetID=0;c.phase='search';c.generation=generation;c.clone=m.clone;c.parentBirth=parentBirth;c.birth=++this.birthSerial;c.divisionsLeft=left;
        if(c.kind===NORMAL)c.base=parentBase;
        const share=this.C.getVolume(c.id)/parentArea,cap=this.settings.reserveCapacity*Math.max(.05,c.target/c.base);
        c.resources={energy:clamp(parentAmounts.energy*share/cap),precursor:clamp(parentAmounts.precursor*share/cap),dnaDamage:parentResources.dnaDamage};
        c.stress=m.stress;c.fitness=m.fitness;c.oxygen=m.oxygen;c.glucose=m.glucose;c.acid=m.acid;c.adversity=m.adversity;c.activation=m.activation;c.recruitment=c===m?m.recruitment:0;
        c.state=m.state;c.origin=m.origin;c.abnormalSince=m.abnormalSince;c.abnormalAge=m.abnormalAge;c.transformedAt=m.transformedAt;c.inflammatorySignal=m.inflammatorySignal;c.inflammatoryExposure=m.inflammatoryExposure;c.nucleusStrainX=m.nucleusStrainX;c.nucleusStrainY=m.nucleusStrainY;
        this.immunity.inherit(c,parentGeneClone,parentExpression);
        if(nuclei){const p=nuclei[c===m?0:1];c.nucleusX=p[0];c.nucleusY=p[1];c.hasNucleus=true;}
        if(this.section)this.section.resetProtrusions(c);this.updateMechanics(c);
      }
      const divisionMode=this.stemDivision(m,daughter,parentStem,parentBudget);
      daughter.px=m.px;daughter.py=m.py;
      if(this.observation?.members.has(parentBirth)){
        const next=this.observation.members.get(parentBirth)+1;this.observation.members.delete(parentBirth);
        this.observation.members.set(m.birth,next);this.observation.members.set(daughter.birth,next);
      }
      for(const [key,h] of this.histories)if(h.ctl===id||h.target===id)this.histories.delete(key);
      this.lineage.push({time:this.C.time,parent:parentBirth,children:[m.birth,daughter.birth],ids:[id,child],clone:m.clone,generation,divisionMode,stemStates:[m.isStem,daughter.isStem],genomes:genome?[{...m.genome},{...daughter.genome}]:null});
      if(this.lineage.length>4000)this.lineage.shift();
      if(m.kind===IMMUNE)this.counters.immuneDivisions++;
      if(m.vesselID)this.counters.endothelialDivisions++;else if(m.kind===NORMAL)this.counters.normalDivisions++;
      if(m.kind===TUMOR&&this.scenarioState){this.scenarioState.tumorDivisions++;if(this.scenarioState.initial.clones.includes(m.clone)&&this.scenarioDistance(divisionX,divisionY)>55)this.scenarioState.distalDivisions++;}
      this.counters.divisions++;this.log('divide',id,child,{generation,clone:m.clone});this.refreshPositions();this.scanContacts();this.immuneInteractions(0);if(m.kind===NORMAL)this.updateNormalReference();return child;
    }
    mutationStep(key,context){
      const z=Math.sqrt(-2*Math.log(Math.max(1e-12,this.C.random())))*Math.cos(2*Math.PI*this.C.random());
      let step=this.settings.mutationSize*z;const bias=this.settings.mutationBias/100;
      const direction=key==='antigen'?0:key==='proliferation'&&context?.adversity>.15?-1:1;
      if(bias&&direction)step=Math.abs(step)*(this.C.random()<.5+.5*bias*direction?1:-1);
      return step;
    }
    mutate(parent,context=null,{probability,keys=['tolerance','proliferation','invasion','antigen']}={}){
      const child={...parent};
      const chance=probability??Math.min(1,this.settings.mutation/100*(1+this.settings.tumorMutationGain*(context?.mutationPressure||0))*(1+2*this.settings.cycleCoupling*(context?.resources?.dnaDamage||0)));
      for(const key of keys)if(this.C.random()<chance){
        const step=this.mutationStep(key,context);
        const value=key==='antigen'?clamp(child[key]+step):clamp(child[key]*Math.exp(step),.25,3);
        if(value!==child[key])this.counters.mutations++;child[key]=value;
      }
      return child;
    }
    set(name,value){
      if(name==='antigenLength')return; // structural setting: apply only on a new experiment
      if(['initialImmuneReady'].includes(name))value=clamp(value,0,100);
      if(['primingRate','checkpointStrength'].includes(name))value=clamp(value,0,3);
      if(!(name in DEFAULTS)||!Number.isFinite(value))return;
      const vascularBounds={vesselCount:[0,6],vesselRadius:[8,20],vesselSupply:[0,3],vesselDependence:[0,100],vesselImmuneRate:[0,3],vesselImmuneHealth:[0,100],vesselPassage:[0,3],vesselRepair:[0,3],vesselDivisions:[0,12],vesselLifespan:[0,50000],vesselInflammation:[0,5],tumorIntravasation:[0,3]};
      if(vascularBounds[name])value=clamp(value,...vascularBounds[name]);if(name==='vesselCount')value=Math.round(value);
      if(['stemFraction','stemSymmetry','stemRenewal'].includes(name))value=clamp(value,0,100);
      if(['stemCycleSlowdown','stemRepair'].includes(name))value=clamp(value,1,3);
      if(name==='stemPlasticity')value=clamp(value,0,3);
      if(name==='tumorProgenyLimit'){value=Math.round(clamp(value,0,20));for(const m of this.live())if(m.kind===TUMOR&&!m.isStem){const consumed=this.settings.tumorProgenyLimit>0?this.settings.tumorProgenyLimit-(m.tumorDivisionsLeft??0):0;m.tumorDivisionsLeft=value?Math.max(0,value-consumed):null;}}
      if(name==='normalSupport')value=clamp(value,0,100);
      if(name==='immuneKillLimit')value=Math.round(clamp(value,0,100));
      if(['cycleCoupling','checkpointIntegrity','normalRepair'].includes(name))value=clamp(value,0,1);
      if(['replicationStress','dnaRepair','traitCost'].includes(name))value=clamp(value,0,3);
      if(name==='reserveCapacity')value=clamp(value,10,240);
      if(name==='normalDivisions'){value=Math.round(clamp(value,0,12));for(const m of this.live())if(m.kind===NORMAL&&!m.vesselID)m.divisionsLeft=Math.max(0,value-m.generation);}
      if(name==='vesselDivisions'){value=Math.round(clamp(value,0,12));for(const m of this.live())if(m.vesselID)m.divisionsLeft=Math.max(0,value-m.generation);}
      if(name==='sectionYield')value=clamp(value,0,.5);
      if(name==='stressMutation'||name==='progression')value=clamp(value,0,20);
      if(name==='inflammation')value=clamp(value,0,10);
      if(name==='immuneSeparation')value=clamp(value,0,3);
      if(name==='tumorMorphology')value=Math.round(clamp(value,0,2));
      if(name==='branchLength')value=clamp(value,1.6,4);
      if(name==='branchStrength')value=clamp(value,0,12);
      if(name==='networkAdhesion')value=clamp(value,0,2);
      if(name==='branching')value=clamp(value,0,3);
      if(name==='tumorCycle'||name==='immuneCycle')value=clamp(value,80,1200);
      if(name==='tumorQuiescence'||name==='il2Secretion'||name==='exhaustionRate')value=clamp(value,0,3);
      if(name==='antigenMemory')value=clamp(value,100,6000);
      if(name==='il2HalfLife')value=clamp(value,20,800);
      if(name==='normalMutationGain'||name==='tumorMutationGain')value=clamp(value,0,12);
      if(['antigenStressGain','contactEscape','signalEscape'].includes(name))value=clamp(value,0,5);
      if(name==='mutationBias')value=clamp(value,-100,100);
      if(name==='evolutionMemory')value=clamp(value,100,4000);
      if(['damagePolarization','damageDeactivation','suppressiveSecretion','suppressionStrength','suppressionRecovery'].includes(name))value=clamp(value,0,5);
      if(name==='immuneRegulationMemory')value=clamp(value,100,2000);
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
          const j=this.C.grid.p2i([xx,yy]),other=this.C.pixti(j);if(!this.vascular.allowed(i,j,id,other))return false;if(other&&other!==id){
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
      const movedBirths=new Set();for(const m of this.live())if(m.id===id||displaced.has(m.id)){movedBirths.add(m.birth);m.patrolMotion=null;m.patrolScanning=false;}
      for(const key of this.patrol.contacts.keys())if(key.split(':').some(birth=>movedBirths.has(Number(birth))))this.patrol.contacts.delete(key);
      this.C.stat_values={};this.refreshPositions();this.scanContacts();this.section?.updateJunctions(0);
      // Manual movement updates contact geometry, not stochastic search,
      // recognition, damage or biological clocks while the gesture is held.
      for(const m of this.live())if(m.targetID&&(m.id===id||displaced.has(m.id)||m.targetID===id||displaced.has(m.targetID)||!this.contacts.get(m.id)?.has(m.targetID))){m.targetID=0;m.phase=m.dying?'dying':'search';this.updateMechanics(m);}
      if(displaced.size)this.prepareEnvironment();this.version++;
      return {steps,blocked,displaced:displaced.size,x:cell.x,y:cell.y};
    }
    pulse(x,y,channel='danger',radius){
      if(![...SIGNALS,'oxygen','glucose','acid','nutrient','hostile'].includes(channel)||![x,y].every(Number.isFinite)||x<0||y<0||x>=this.width||y>=this.height)return;
      if(radius!==undefined&&(!Number.isFinite(radius)||radius<=0))return;
      const bins=radius===undefined?[this.fieldIndex(x,y)]:this.sourceBins({x,y,radius:clamp(radius,2*this.scale,40*this.scale)});
      for(const i of bins){if(this.fields.oxygen.blocked[i])continue;
        if(SIGNALS.includes(channel)){this.fields[channel].values[i]=Math.min(30,this.fields[channel].values[i]+8);if(channel==='normalDamage')this.fields.danger.values[i]=Math.min(30,this.fields.danger.values[i]+8);}
        else if(channel==='nutrient'){for(const key of ['oxygen','glucose'])this.fields[key].values[i]=clamp(this.fields[key].values[i]+.35);}
        else if(channel==='hostile'){this.fields.oxygen.values[i]=clamp(this.fields.oxygen.values[i]-.35);this.fields.acid.values[i]=clamp(this.fields.acid.values[i]+.35);}
        else this.fields[channel].values[i]=clamp(this.fields[channel].values[i]+.35);
      }
    }
    mechanicalStep(){
      if(this.patrol.needsSeed){for(const i of this.positions){const m=this.cells[this.C.pixti(i)];if(m?.kind===IMMUNE&&!m.dying)this.patrol.visited[i]=1;}this.patrol.needsSeed=false;}
      this.trackPatrol=true;try{if(this.C.borderpixels.length)this.C.timeStep();else this.C.time++;}finally{this.trackPatrol=false;}
      this.cleanup();this.refreshPositions();this.scanContacts();
      if(this.section)this.section.update(1);
      this.vascular.tick(1);
    }
    biologicalStep(){
      if(this.C.time%4===0)this.updateMetabolism(4);
      if(this.C.time%16===0)this.immunity.tick(16);
      this.immunity.contactLearning(1);this.immuneInteractions(1);this.biology(1);
      if(this.C.time%4===0){this.updateSignals(4);this.updatePolarity(4);}
      this.updateScenarioState();
      if(this.C.time%30===0)this.record();
    }
    advance(steps){for(let n=0;n<steps;n++){this.mechanicalStep();if(this.C.time%4===0)this.updateEnvironment(4);this.biologicalStep();}}
    async advanceAsync(steps,backend){for(let n=0;n<steps;n++){this.mechanicalStep();if(this.C.time%4===0){this.prepareEnvironment();await backend.step(this,4);}this.biologicalStep();}}
    initializeScenario(){
      if(!['oncogenesis','random','cold','hot'].includes(this.scene))return;
      const live=this.live(),tumors=live.filter(m=>m.kind===TUMOR);
      this.scenarioState={initial:{normal:live.filter(m=>m.kind===NORMAL&&!m.vesselID).length,endothelial:live.filter(m=>m.vesselID).length,tumor:tumors.length,immune:live.filter(m=>m.kind===IMMUNE).length,antigenPositive:tumors.filter(m=>m.antigen).length,clones:tumors.map(m=>m.clone)},tumorDivisions:0,distalDivisions:0,peakTumor:tumors.length,everTumor:tumors.length>0,clearanceAt:null};
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
      if(this.scene==='oncogenesis'||this.scene==='random'){
        achieved=active.length>0&&state.tumorDivisions>0;
        phase=achieved?'新生肿瘤克隆扩增':active.length?'肿瘤已发生':c.malignantTransitions?'肿瘤已出现，当前无存活肿瘤':c.abnormalInitiations?'已发生癌前细胞':maxAdversity>.08?'环境压力累积':'局部资源消耗';
      }else if(this.scene==='cold'){
        achieved=far>0&&state.distalDivisions>0&&active.length>state.initial.tumor;
        phase=achieved?'原灶外播散并增殖':far?'肿瘤向原灶外扩散':state.tumorDivisions?'原发灶扩增':'低免疫浸润的原发灶';
        if(!tumors.length)phase='当前区域肿瘤已消失';
      }else{
        achieved=state.everTumor&&!tumors.length&&elapsed>=150&&c.kills>0;
        phase=achieved?'当前区域持续清除':!tumors.length&&state.everTumor?'清除后继续观察':!active.length&&tumors.length?'靶细胞凋亡清除中':c.kills?'免疫清除进行中':c.recognitions?'接触识别与招募':'浸润与接触扫描';
      }
      if(c.bloodstreamExports>0&&!tumors.length){phase='局部肿瘤已清除，曾发生入血播散';achieved=false;}
      const preset=PRESETS[this.scene],baseline={...DEFAULTS,...(this.scene==='random'?randomSettings(this.seedValue):preset.settings)};
      return {label:preset.label,description:preset.description,profile:{environment:preset.environmentProfile||'uniform',founderTolerance:preset.founderTolerance||1,...(this.ecology?{niches:this.ecology.niches.map(n=>({...n}))}:{})},phase,achieved,initial:{...state.initial,clones:[...state.initial.clones]},tumor:active.length,tumorBodies:tumors.length,abnormal,farTumor:far,distalRadius:55,tumorDivisions:state.tumorDivisions,distalDivisions:state.distalDivisions,peakTumor:state.peakTumor,clearanceAt:state.clearanceAt,clearanceElapsed:elapsed,maxAdversity,customized:Object.keys(DEFAULTS).some(k=>this.settings[k]!==baseline[k])};
    }
    populationRow(){const counts=[0,0,0,0],states=Object.fromEntries(POPULATION_STATES.map(k=>[k,0]));let px=0,py=0,n=0,abnormal=0,endothelial=0;
      for(const m of this.live()){counts[m.kind]++;if(m.vesselID)endothelial++;if(m.state==='abnormal')abnormal++;if(!m.dying){px+=m.px;py+=m.py;n++;}
        const type=m.vesselID?'endothelial':m.kind===IMMUNE?'immune':m.kind===TUMOR?'tumor':m.state==='abnormal'?'abnormal':'normal';
        const state=m.dying?'Dying':type==='immune'?(m.immunePhenotype==='suppressive'?'Suppressive':m.activation>0?'Active':'Resting'):type==='normal'||type==='endothelial'?'Living':m.antigen?'Positive':'Negative';states[type+state]++;
      }
      return {time:this.C.time,normal:counts[1]-abnormal-endothelial,abnormal,tumor:counts[2],immune:counts[3],endothelial,...states,order:n?Math.hypot(px,py)/n:0,...this.counters};
    }
    record(){const row=this.populationRow();if(!sameHistoryRow(this.history.at(-1),row))this.history.push(row);this.immunity.record();}
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
    snapshotRaster(){
      if(this.kernel==='wasm'){const raster=this.wasm.raster();if(raster)return raster;}
      const grid=new Uint16Array(this.width*this.height),activity=new Uint8Array(grid.length),walls=new Uint8Array(grid.length);let orphans=0,visitedPixels=0,freePixels=0;
      // Artistoo stores columns; display textures store rows. Tiled transposition
      // keeps both working sets in cache instead of striding across the entire
      // high-resolution lattice. No cell or field sample is omitted.
      const pixels=this.C.grid._pixels,act=this.act.cellpixelsact,visited=this.patrol.visited,bits=this.C.grid.Y_BITS,w=this.width,h=this.height;
      const present=this.rasterPresent??=new Uint8Array(65536),maxAct=this.rasterMaxAct??=new Uint8Array(65536);present.fill(0);
      for(const m of this.live()){present[m.id]=1;maxAct[m.id]=this.C.conf.MAX_ACT[m.kind];}
      for(const id of Object.keys(this.C.t2k))if(this.C.t2k[id]===WALL)present[id]=2;
      for(let by=0;by<h;by+=32)for(let bx=0;bx<w;bx+=32){const ey=Math.min(h,by+32),ex=Math.min(w,bx+32);
        for(let x=bx;x<ex;x++){let i=(x<<bits)+by,q=by*w+x;for(let y=by;y<ey;y++,i++,q+=w){
          const id=pixels[i],kind=present[id];grid[q]=id;
          if(kind===1)activity[q]=Math.min(255,Math.round((act[i]||0)/maxAct[id]*255));
          else if(kind===2)walls[q]=1;else if(id)orphans++;
          if(kind!==2){freePixels++;visitedPixels+=visited[i];}
        }}
      }
      return {grid,activity,walls,orphans,visitedPixels,freePixels};
    }
    snapshot(){
      this.refreshPositions();const {grid,activity,walls,orphans,visitedPixels,freePixels}=this.snapshotRaster();
      const cells=this.live().map(m=>({id:m.id,kind:m.kind,x:m.x,y:m.y,px:m.px,py:m.py,area:this.C.getVolume(m.id),target:m.target,antigen:m.antigen,antigenLevel:m.antigenLevel,damage:m.damage,dying:m.dying,deathCause:m.deathCause,phase:m.phase,targetID:m.targetID,age:m.age,genome:m.genome?{...m.genome}:null,clone:m.clone,generation:m.generation,divisionsLeft:m.divisionsLeft,activation:m.activation,recruitment:m.recruitment,oxygen:m.oxygen,glucose:m.glucose,acid:m.acid,stress:m.stress,fitness:m.fitness,confinement:m.confinement}));
      for(const c of cells){const m=this.cells[c.id];for(const key of ['sectionFraction','sectionPressure','planarTarget','offPlaneTarget','hasNucleus','nucleusX','nucleusY','nucleusRadius','birth','nucleusStrainX','nucleusStrainY','state','origin','abnormalSince','abnormalAge','transformedAt','adversity','immuneCue','inflammatorySignal','inflammatoryExposure','morphologyMode','branchCount','networkDegree','deathStartedAt','deathPhase','deathProgress','deathIntact','vesselID','vascularID','vascularPhase','bloodstreamEnteredAt','endothelialInjury','lifespanScale'])c[key]=m[key];if(c.kind===IMMUNE){c.patrolChecked=m.patrolCheckedBirth===m.birth?m.patrolChecked||0:0;c.patrolScanning=!!m.patrolScanning;c.patrolTurning=!!m.patrolMotion?.turnTime;}}
      for(const c of cells){const m=this.cells[c.id];c.cycle={...m.cycle};c.resources={...m.resources};c.traitEconomy=this.traitEconomy(m);c.freeFraction=m.freeFraction;for(const key of ['isStem','stemNiche','tumorDivisionsLeft','antigenMemory','il2','il2Response','il2Production','chronicStimulation','exhaustion','normalTolerance','mutationPressure','immuneEncounters','immuneContactMemory','recruitmentExposure','lastAntigenChange','immunePhenotype','normalDamageExposure','inhibition','immuneRefractory','tumorKills'])c[key]=m[key];}
      for(const c of cells){const m=this.cells[c.id];Object.assign(c,{geneClone:m.geneClone,expression:structuredClone(m.expression),primed:m.primed,primingProgress:m.primingProgress,recognition:{...m.recognition},...(m.kind===IMMUNE?{learnedReceptors:structuredClone(m.learnedReceptors||[]),antigenCargo:structuredClone(m.antigenCargo||[])}:{})});}
      const fields={};for(const [key,f] of Object.entries(this.fields))fields[key]={width:f.width,height:f.height,values:f.values.slice()};
      const history=this.populationHistory(true),historySamples=this.history.length+(history.at(-1)===this.history.at(-1)?0:1);
      const maze=this.maze?{...this.maze,racers:this.maze.racers.map(r=>({...r,alive:this.cells[r.id]?.birth===r.birth&&!this.cells[r.id].dying})),arrivals:this.maze.arrivals.map(a=>({...a}))}:null;
      const observation=this.observationReport(),normalSupport=this.normalSupportReport();
      return {immunity:this.immunity.report(),initialCells:this.initialCells,modelRevision:MODEL_REVISION,warmup:this.initialWarmup,kernel:this.kernel,width:this.width,height:this.height,worldWidth:this.worldWidth,worldHeight:this.worldHeight,refinement:this.scale,fieldScale:this.fieldScale,fieldMask:this.fields.oxygen.blocked.slice(),scene:this.scene,scenario:this.scenarioReport(),vascular:this.vascular.report(),observation,normalSupport,cycles:this.cycleReport(),patrol:this.patrolReport({visitedPixels,freePixels}),maze,sources:this.sources.map(s=>({...s})),boundary:this.boundary,time:this.C.time,seed:this.seedValue,settings:{...this.settings},counters:{...this.counters},manualDeathRemovals:{...this.manualDeathRemovals},deaths:this.deathSummary(),recentDeaths:this.deathHistory.slice(-8).map(d=>({...d})),recentClearances:this.recentClearances.map(d=>({...d})),deathEffects:this.deathEffects.map(e=>({...e})),grid,activity,walls,orphans,cells,fields,history,historySamples,events:this.events.slice(-12)};
    }
  }
  globalThis.CellLab={MODEL_REVISION,Simulation,SignalField,StepClock,DEFAULTS,PRESETS,BODY_COLORS,TYPE_NAMES,NORMAL,TUMOR,IMMUNE,WALL,sampleHistory,randomSettings,RANDOM_RANGES};
})();
