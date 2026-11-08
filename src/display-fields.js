/* Read-only display transforms on the coarse environmental grid. */
(() => {
  'use strict';
  const clamp=x=>Math.max(0,Math.min(1,x));
  const BODY_COLORS=[[243,245,241],[204,204,204],[0,0,0],[233,154,154],[93,108,111],[160,139,102],[153,0,0]];
  const immuneActive=m=>m?.kind===3&&m.activation>0;
  const displayKind=m=>m?.state==='abnormal'?5:immuneActive(m)?6:m?.kind||0;
  // Fixed scale across scenes and generations, using the heritable trait,
  // not transient nutrient suppression or a population-relative ranking.
  const gray=Array.from({length:89},(_,v)=>[v,v,v]);
  const tumorShade=m=>Math.round(88*(1-clamp(((m?.genome?.proliferation??1)-.25)/2.75)));
  const bodyColor=m=>m?.kind===2?gray[tumorShade(m)]:BODY_COLORS[displayKind(m)];
  const cellName=m=>m?.state==='abnormal'?'异常中间态':m?.kind===3?(immuneActive(m)?'已激活免疫细胞':'未激活免疫细胞'):['培养液','正常细胞','肿瘤细胞','免疫细胞','实体障碍'][m?.kind||0];
  const nucleusStyles={normal:{stroke:'#243b53',fill:'#243b531a'},patrol:{stroke:'#8f3548',fill:'#8f35481a'},dark:{stroke:'#f2d38a',fill:'#f2d38a1a'}};
  const nucleusStyle=m=>m.kind===1?nucleusStyles.normal:m.kind===3&&!immuneActive(m)?nucleusStyles.patrol:nucleusStyles.dark;
  // At ordinary opacity keep bodies legible; the upper half of each slider
  // deliberately releases that protection. 100% means a full-strength layer.
  const bodyOpacity=(u,protect=true)=>clamp(u)*(protect?.28+.72*clamp((u-.5)*2):1);
  const SIGNALS={cohesion:{label:'细胞凝聚因子',color:[36,171,132]},danger:{label:'损伤趋化因子',color:[239,140,42]},trail:{label:'免疫招募因子',color:[157,100,219]}};
  const FIELD_INFO={
    adversity:{label:'环境恶劣度',low:[213,237,222],middle:[238,185,73],high:[147,40,71],description:'0 友好 → 1 恶劣；综合低氧、低糖与高酸，不是细胞累计损伤'},
    oxygen:{label:'氧可用量',low:[142,67,96],high:[95,186,184],description:'0 低氧 → 1 补给浓度'},
    glucose:{label:'葡萄糖可用量',low:[128,76,126],high:[204,181,77],description:'0 耗尽 → 1 补给浓度'},
    acid:{label:'酸负荷',low:[228,234,221],high:[184,79,109],description:'0 低 → 1 高；不是实验 pH'},
    density:{label:'局部细胞密度',low:[232,237,224],high:[68,112,126],description:'0 稀疏 → 1 密集；近邻平滑占据率'}
  };
  for(const info of Object.values(FIELD_INFO))info.palette=BODY_COLORS.map((body,kind)=>Array.from({length:256},(_,n)=>{
    const value=n/255,lo=info.middle&&value>.5?info.middle:info.low,hi=info.middle&&value<=.5?info.middle:info.high,t=info.middle?(value<=.5?value*2:(value-.5)*2):value;
    return lo.map((v,k)=>Math.round(v+(hi[k]-v)*t));
  }));
  function adversity(fields){
    const {oxygen,glucose,acid}=fields,values=new Float32Array(oxygen.values.length);
    for(let i=0;i<values.length;i++)values[i]=.35*clamp((.45-oxygen.values[i])/.45)+.4*clamp((.5-glucose.values[i])/.5)+.25*clamp((acid.values[i]-.25)/.75);
    return {width:oxygen.width,height:oxygen.height,values};
  }
  function signals(fields,enabled,opacity={}){
    const keys=Object.keys(SIGNALS).filter(k=>enabled.has(k));if(!keys.length)return null;
    const f=fields[keys[0]],rgba=new Uint8Array(f.values.length*4);
    for(let i=0;i<f.values.length;i++){
      let total=0,r=0,g=0,b=0,transparent=1;
      for(const key of keys){const weight=(1-Math.exp(-Math.max(0,fields[key].values[i])/.35))*clamp(opacity[key]??1),c=SIGNALS[key].color;total+=weight;transparent*=1-weight;r+=weight*c[0];g+=weight*c[1];b+=weight*c[2];}
      if(total){const p=i*4;rgba[p]=Math.round(r/total);rgba[p+1]=Math.round(g/total);rgba[p+2]=Math.round(b/total);rgba[p+3]=Math.round(255*(1-transparent));}
    }
    return {width:f.width,height:f.height,rgba};
  }
  class Cache {
    get(s,view,enabled,opacity={},protect=true){
      if(this.snapshot!==s){this.snapshot=s;this.adverse=null;this.signalMask=null;this.signal=null;}
      if(view==='adversity'&&!this.adverse)this.adverse=adversity(s.fields);
      const mask=protect+':'+Object.keys(SIGNALS).map(k=>enabled.has(k)?'on:'+clamp(opacity[k]??1):'off').join(',');
      if(mask!==this.signalMask){this.signal=signals(s.fields,enabled,opacity);this.bodySignal=protect?signals(s.fields,enabled,Object.fromEntries(Object.keys(SIGNALS).map(k=>[k,bodyOpacity(opacity[k]??1,true)]))):this.signal;this.signalMask=mask;}
      return {field:view==='adversity'?this.adverse:s.fields[view],info:FIELD_INFO[view],signal:this.signal,bodySignal:this.bodySignal};
    }
  }
  function sample(s,x,y){
    if(x<0||y<0||x>=s.width||y>=s.height)return null;
    x=Math.floor(x);y=Math.floor(y);const q=y*s.width+x,bin=Math.floor(y/s.fieldScale)*s.fields.oxygen.width+Math.floor(x/s.fieldScale);
    const wall=!!s.walls[q],blocked=wall||!!s.fieldMask?.[bin];
    return {x,y,bin,time:s.time,cell:s.cells.find(m=>m.id===s.grid[q])||null,wall,blocked,values:blocked?null:Object.fromEntries(['oxygen','glucose','acid',...Object.keys(SIGNALS)].map(key=>[key,s.fields[key].values[bin]]))};
  }
  globalThis.CellLabDisplay={BODY_COLORS,SIGNALS,FIELD_INFO,immuneActive,displayKind,tumorShade,bodyColor,cellName,nucleusStyle,bodyOpacity,adversity,signals,sample,Cache};
})();
