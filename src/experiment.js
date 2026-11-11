/* Versioned parameter-file validation, shared by the UI and Worker. */
(() => {
  'use strict';
  const ranges={normalMotility:[0,1.5],tumorMotility:[0,1.5],immuneMotility:[0,1.5],chemotaxis:[0,3],alignment:[0,3],cohesion:[0,3],repulsion:[0,3],immuneSeparation:[0,3],noise:[0,2],halfLife:[20,400],growth:[0,2],apoptosis:[0,30],antigen:[0,100],kill:[0,2],temperature:[2,30],supply:[0,3],metabolism:[0,2],escape:[0,5],recruitment:[0,3],immuneGrowth:[0,1.5],immuneDivisions:[0,6],mutation:[0,100],mutationSize:[0,.5],sectionYield:[0,.5],stressMutation:[0,20],inflammation:[0,10],progression:[0,20],tumorMorphology:[0,2],branchLength:[1.6,4],branchStrength:[0,12],networkAdhesion:[0,2],branching:[0,3]};
  Object.assign(ranges,{tumorCycle:[80,1200],tumorQuiescence:[0,3],immuneCycle:[80,1200],antigenMemory:[100,6000],il2Secretion:[0,3],il2HalfLife:[20,800],exhaustionRate:[0,3]});
  Object.assign(ranges,{normalSupport:[0,100],immuneKillLimit:[0,100]});
  Object.assign(ranges,{normalMutationGain:[0,12],tumorMutationGain:[0,12],mutationBias:[-100,100],antigenStressGain:[0,5],contactEscape:[0,5],signalEscape:[0,5],evolutionMemory:[100,4000]});
  Object.assign(ranges,{damagePolarization:[0,5],damageDeactivation:[0,5],suppressiveSecretion:[0,5],suppressionStrength:[0,5],immuneRegulationMemory:[100,2000],suppressionRecovery:[0,5]});
  Object.assign(ranges,{cycleCoupling:[0,1],reserveCapacity:[10,240],replicationStress:[0,3],dnaRepair:[0,3],checkpointIntegrity:[0,1],traitCost:[0,3],normalRepair:[0,1],normalDivisions:[0,12]});
  Object.assign(ranges,{stemFraction:[0,100],stemSymmetry:[0,100],stemRenewal:[0,100],stemCycleSlowdown:[1,3],stemRepair:[1,3],stemPlasticity:[0,3],tumorProgenyLimit:[0,20]});
  Object.assign(ranges,{vesselCount:[0,6],vesselRadius:[8,20],vesselSupply:[0,3],vesselDependence:[0,100],vesselImmuneRate:[0,3],vesselImmuneHealth:[0,100],vesselPassage:[0,3],vesselRepair:[0,3],vesselDivisions:[0,12],vesselLifespan:[0,50000],vesselInflammation:[0,5],tumorIntravasation:[0,3]});
  const signals=['cohesion','danger','trail','il2','normalDamage','inhibition'];
  const scenes=['oncogenesis','cold','hot','empty','random','ecosystem','network','collective','invasion','maze','stress','surveillance'];
  const flags=['edge-activity','normal-activity','tumor-activity','immune-activity','cell-seams','arrows','antigen-marks','nuclei','cycle-marks','protect-bodies','show-tracks'];
  const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  function invalid(key){throw Error('实验文件参数无效：'+key);}
  function number(value,min,max,key){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)invalid(key);return value;}
  function choice(value,allowed,key){if(!allowed.includes(value))invalid(key);return value;}
  function parse(data){
    if(!object(data)||!object(data.settings)||!scenes.includes(data.scene))invalid('settings / scene');
    if(data.format!==undefined&&data.format!=='cell-arena-experiment')invalid('format');
    if(data.schemaVersion!==undefined&&data.schemaVersion!==1)throw Error('实验文件版本暂不支持');
    if(data.version!==undefined&&!/^[34]\.\d+/.test(String(data.version)))throw Error('实验文件版本暂不支持');
    const seed=number(data.seed,0,4294967295,'seed');if(!Number.isInteger(seed))invalid('seed');
    const boundary=choice(data.boundary,['solid','wrap'],'boundary'),refinement=choice(data.refinement,[1,1.5,2,3,4],'refinement');
    const worldWidth=number(data.worldWidth,1,1024,'worldWidth'),worldHeight=number(data.worldHeight,1,768,'worldHeight');
    const w=Math.round(worldWidth*refinement),h=Math.round(worldHeight*refinement);if(w<32||w>1024||h<24||h>768)invalid('grid dimensions');
    const settings={},ignored=[];
    for(const [key,value]of Object.entries(data.settings)){if(!Object.hasOwn(ranges,key)){ignored.push(key);continue;}settings[key]=number(value,...ranges[key],key);if(['immuneDivisions','immuneKillLimit','tumorMorphology','normalDivisions','tumorProgenyLimit','vesselCount','vesselDivisions'].includes(key)&&!Number.isInteger(value))invalid(key);}
    const sources=data.sources===undefined?undefined:data.sources;if(sources!==undefined){if(!Array.isArray(sources)||sources.length>4096)invalid('sources');for(const v of sources){if(!object(v))invalid('source');choice(v.type,[...signals,'oxygen','glucose','acid','nutrient','hostile'],'source.type');number(v.x,0,worldWidth,'source.x');number(v.y,0,worldHeight,'source.y');number(v.radius,2,40,'source.radius');}}
    const vessels=data.vessels;if(vessels!==undefined){if(!Array.isArray(vessels)||vessels.length>64)invalid('vessels');for(const v of vessels){if(!object(v))invalid('vessel');number(v.x,0,worldWidth,'vessel.x');number(v.y,0,worldHeight,'vessel.y');number(v.radius,8,20,'vessel.radius');}}
    if(data.maze?.signalThroughWalls!==undefined&&typeof data.maze.signalThroughWalls!=='boolean')invalid('maze.signalThroughWalls');
    const display={},input=data.display??{};if(!object(input))invalid('display');
    if(input.cellColors!==undefined){if(!object(input.cellColors))invalid('cellColors');const colors={};for(const kind of ['normal','abnormal','tumor','immune','activated','suppressive','endothelial'])if(input.cellColors[kind]!==undefined){if(!object(input.cellColors[kind]))invalid(kind);colors[kind]={};for(const part of ['body','nucleus'])if(input.cellColors[kind][part]!==undefined){const c=input.cellColors[kind][part];if(typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c))invalid(kind+'.'+part);colors[kind][part]=c.toLowerCase();}}if(input.cellColors.proliferationShading!==undefined){if(typeof input.cellColors.proliferationShading!=='boolean')invalid('proliferationShading');colors.proliferationShading=input.cellColors.proliferationShading;}display.cellColors=colors;}
    if(input.edgeFade!==undefined)display.edgeFade=number(input.edgeFade,0,100,'edgeFade');
    if(input.autoRandomMinutes!==undefined)display.autoRandomMinutes=number(input.autoRandomMinutes,0,1440,'autoRandomMinutes');
    if(input.parameterLocks!==undefined){if(!object(input.parameterLocks))invalid('parameterLocks');display.parameterLocks={};for(const [key,value]of Object.entries(input.parameterLocks)){if(!(key in ranges)&&!['boundary','world-size','refinement'].includes(key))continue;if(typeof value!=='boolean')invalid('parameterLocks.'+key);display.parameterLocks[key]=value;}}
    if(input.trackDuration!==undefined)display.trackDuration=number(input.trackDuration,20,2000,'trackDuration');
    if(input.cellMarker!==undefined)display.cellMarker=choice(input.cellMarker,['none','nucleus','antigen','cycle'],'cellMarker');
    if(input.fieldView!==undefined)display.fieldView=choice(input.fieldView,['none','adversity','oxygen','glucose','acid','density'],'fieldView');
    if(input.signalLayers!==undefined){if(!Array.isArray(input.signalLayers))invalid('signalLayers');display.signalLayers=[...new Set(input.signalLayers.map(k=>choice(k,signals,'signalLayers')))];}
    if(input.opacity!==undefined){if(!object(input.opacity))invalid('opacity');display.opacity={};for(const [k,v]of Object.entries(input.opacity))if(['adversity','oxygen','glucose','acid','density',...signals].includes(k))display.opacity[k]=number(v,0,1,'opacity.'+k);}
    if(input.flags!==undefined){if(!object(input.flags))invalid('flags');display.flags={};for(const [k,v]of Object.entries(input.flags))if(flags.includes(k)){if(typeof v!=='boolean')invalid(k);display.flags[k]=v;}}
    for(const [key,options]of [['zoom',['100','150','200','300']],['fit',['cover','contain']],['renderResolution',['auto','1920','2560','3840']]])if(input[key]!==undefined)display[key]=choice(input[key],options,key);
    return {mode:'parameters',config:{scene:data.scene,mazeSignalThroughWalls:!!data.maze?.signalThroughWalls,seed,boundary,worldWidth,worldHeight,refinement,settings,...(vessels?{vessels:vessels.map(v=>({x:v.x,y:v.y,radius:v.radius}))}:{}),...(sources?{sources:sources.map(s=>({type:s.type,x:s.x,y:s.y,radius:s.radius}))}:{}),warmup:data.warmup===undefined?(data.scene==='empty'?0:35):number(data.warmup,0,200,'warmup')},display,speed:data.speed===undefined?1:number(data.speed,.25,8,'speed'),sourceTime:Number.isFinite(data.time)?data.time:0,ignored};
  }
  globalThis.CellLabExperiment={parse,ranges,scenes,flags};
})();
