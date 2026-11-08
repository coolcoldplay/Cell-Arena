/* Versioned parameter-file validation, shared by the UI and Worker. */
(() => {
  'use strict';
  const ranges={normalMotility:[0,1.5],tumorMotility:[0,1.5],immuneMotility:[0,1.5],chemotaxis:[0,3],alignment:[0,3],cohesion:[0,3],repulsion:[0,3],immuneSeparation:[0,3],noise:[0,2],halfLife:[20,400],growth:[0,2],apoptosis:[0,30],antigen:[0,100],kill:[0,2],temperature:[2,30],supply:[0,3],metabolism:[0,2],escape:[0,5],recruitment:[0,3],immuneGrowth:[0,1.5],immuneDivisions:[0,6],mutation:[0,100],mutationSize:[0,.5],sectionYield:[0,.5],stressMutation:[0,20],inflammation:[0,10],progression:[0,20],tumorMorphology:[0,2],branchLength:[1.6,4],branchStrength:[0,12],networkAdhesion:[0,2],branching:[0,3]};
  const scenes=['oncogenesis','cold','hot','empty','random','ecosystem','network','collective','invasion','maze','stress','surveillance'];
  const flags=['edge-activity','normal-activity','tumor-activity','immune-activity','cell-seams','arrows','antigen-marks','nuclei','protect-bodies'];
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
    for(const [key,value]of Object.entries(data.settings)){if(!Object.hasOwn(ranges,key)){ignored.push(key);continue;}settings[key]=number(value,...ranges[key],key);if(['immuneDivisions','tumorMorphology'].includes(key)&&!Number.isInteger(value))invalid(key);}
    const display={},input=data.display??{};if(!object(input))invalid('display');
    if(input.cellColors!==undefined){if(!object(input.cellColors))invalid('cellColors');const colors={};for(const kind of ['normal','abnormal','tumor','immune','activated'])if(input.cellColors[kind]!==undefined){if(!object(input.cellColors[kind]))invalid(kind);colors[kind]={};for(const part of ['body','nucleus'])if(input.cellColors[kind][part]!==undefined){const c=input.cellColors[kind][part];if(typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c))invalid(kind+'.'+part);colors[kind][part]=c.toLowerCase();}}if(input.cellColors.proliferationShading!==undefined){if(typeof input.cellColors.proliferationShading!=='boolean')invalid('proliferationShading');colors.proliferationShading=input.cellColors.proliferationShading;}display.cellColors=colors;}
    if(input.fieldView!==undefined)display.fieldView=choice(input.fieldView,['none','adversity','oxygen','glucose','acid','density'],'fieldView');
    if(input.signalLayers!==undefined){if(!Array.isArray(input.signalLayers))invalid('signalLayers');display.signalLayers=[...new Set(input.signalLayers.map(k=>choice(k,['cohesion','danger','trail'],'signalLayers')))];}
    if(input.opacity!==undefined){if(!object(input.opacity))invalid('opacity');display.opacity={};for(const [k,v]of Object.entries(input.opacity))if(['adversity','oxygen','glucose','acid','density','cohesion','danger','trail'].includes(k))display.opacity[k]=number(v,0,1,'opacity.'+k);}
    if(input.flags!==undefined){if(!object(input.flags))invalid('flags');display.flags={};for(const [k,v]of Object.entries(input.flags))if(flags.includes(k)){if(typeof v!=='boolean')invalid(k);display.flags[k]=v;}}
    for(const [key,options]of [['zoom',['100','150','200','300']],['fit',['cover','contain']],['renderResolution',['auto','1920','2560','3840']]])if(input[key]!==undefined)display[key]=choice(input[key],options,key);
    return {mode:'parameters',config:{scene:data.scene,seed,boundary,worldWidth,worldHeight,refinement,settings,warmup:data.scene==='empty'?0:35},display,speed:data.speed===undefined?1:number(data.speed,.25,8,'speed'),sourceTime:Number.isFinite(data.time)?data.time:0,ignored};
  }
  globalThis.CellLabExperiment={parse,ranges,scenes,flags};
})();
