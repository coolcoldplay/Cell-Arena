/* Read-only display transforms on the coarse environmental grid. */
(() => {
  'use strict';
  const clamp=x=>Math.max(0,Math.min(1,x));
  const BODY_COLORS=[[246,240,226],[204,204,204],[0,0,0],[233,154,154],[93,108,111],[160,139,102],[153,0,0],[99,152,210]];
  const immuneSuppressive=m=>m?.kind===3&&m.immunePhenotype==='suppressive';
  const immuneActive=m=>m?.kind===3&&!immuneSuppressive(m)&&m.activation>0;
  const displayKind=m=>m?.state==='abnormal'?5:immuneSuppressive(m)?7:immuneActive(m)?6:m?.kind||0;
  const COLOR_DEFAULTS={normal:{body:'#cccccc',nucleus:'#243b53'},abnormal:{body:'#a08b66',nucleus:'#243b53'},tumor:{body:'#000000',nucleus:'#f2d38a'},immune:{body:'#e99a9a',nucleus:'#8f3548'},activated:{body:'#990000',nucleus:'#f2d38a'},proliferationShading:true};
  const COLOR_PRESETS={
    slate:{name:'岩灰 · 珊瑚',description:'冷灰胞体，珊瑚免疫',colors:{normal:{body:'#aebfc6',nucleus:'#36515f'},abnormal:{body:'#d5ac78',nucleus:'#76512d'},tumor:{body:'#202b33',nucleus:'#d9e4e9'},immune:{body:'#efb1ad',nucleus:'#9b4e53'},activated:{body:'#aa3449',nucleus:'#ffe0d9'},proliferationShading:true}},
    porcelain:{name:'瓷白 · 朱砂',description:'暖灰组织，朱砂激活',colors:{normal:{body:'#c9c2b8',nucleus:'#655c55'},abnormal:{body:'#cbb070',nucleus:'#6d5228'},tumor:{body:'#302a2a',nucleus:'#f1dfbd'},immune:{body:'#efb8ab',nucleus:'#944d47'},activated:{body:'#b13b36',nucleus:'#ffe2d4'},proliferationShading:true}},
    lagoon:{name:'雾青 · 胭脂',description:'青灰基调，胭脂点缀',colors:{normal:{body:'#a8c2bb',nucleus:'#3d6058'},abnormal:{body:'#c4aa79',nucleus:'#695330'},tumor:{body:'#173b3b',nucleus:'#d7ede5'},immune:{body:'#edb5c3',nucleus:'#9a5268'},activated:{body:'#a33153',nucleus:'#ffe0e7'},proliferationShading:true}},
    violet:{name:'雾紫 · 玫瑰',description:'灰紫组织，玫瑰免疫',colors:{normal:{body:'#c1bacf',nucleus:'#625574'},abnormal:{body:'#cbb18c',nucleus:'#725836'},tumor:{body:'#30253d',nucleus:'#e5d9f2'},immune:{body:'#efb6c4',nucleus:'#9b5067'},activated:{body:'#a03260',nucleus:'#ffe2eb'},proliferationShading:true}}
  };
  COLOR_DEFAULTS.suppressive={body:'#6398d2',nucleus:'#173d69'};
  for(const preset of Object.values(COLOR_PRESETS))preset.colors.suppressive={...COLOR_DEFAULTS.suppressive};
  const colorKey=m=>m?.state==='abnormal'?'abnormal':m?.kind===3?(immuneSuppressive(m)?'suppressive':immuneActive(m)?'activated':'immune'):m?.kind===2?'tumor':'normal';
  const hexRGB=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  function normalizeColors(value){
    const result={proliferationShading:value?.proliferationShading!==false};
    for(const key of ['normal','abnormal','tumor','immune','activated','suppressive']){result[key]={};for(const part of ['body','nucleus']){const c=value?.[key]?.[part];result[key][part]=typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c.toLowerCase():COLOR_DEFAULTS[key][part];}}
    return result;
  }
  function colorPresetID(value){
    const normalized=normalizeColors(value),same=colors=>JSON.stringify(normalizeColors(colors))===JSON.stringify(normalized);
    for(const [id,preset] of Object.entries(COLOR_PRESETS))if(same(preset.colors))return id;
    return same(COLOR_DEFAULTS)?'original':'custom';
  }
  const paletteBodies=palette=>{const colors=BODY_COLORS.map(c=>c.slice());for(const [i,key] of [[1,'normal'],[2,'tumor'],[3,'immune'],[5,'abnormal'],[6,'activated'],[7,'suppressive']])colors[i]=hexRGB(palette[key].body);return colors;};
  // Fixed scale across scenes and generations, using the heritable trait,
  // not transient nutrient suppression or a population-relative ranking.
  const gray=Array.from({length:89},(_,v)=>[v,v,v]);
  const tumorShade=m=>Math.round(88*(1-clamp(((m?.genome?.proliferation??1)-.25)/2.75)));
  const bodyColor=(m,palette)=>{
    if(!palette)return m?.kind===2?gray[tumorShade(m)]:BODY_COLORS[displayKind(m)];
    if(!m||m.kind===0||m.kind===4)return BODY_COLORS[m?.kind||0];
    const base=hexRGB(palette[colorKey(m)].body),t=m.kind===2&&palette.proliferationShading?tumorShade(m)/255:0;
    return base.map(v=>Math.round(v+(255-v)*t));
  };
  const cellName=m=>m?.state==='abnormal'?'异常中间态':m?.kind===3?(immuneSuppressive(m)?'免疫抑制样细胞':immuneActive(m)?'已激活免疫细胞':'未激活免疫细胞'):['培养液','正常细胞','肿瘤细胞','免疫细胞','实体障碍'][m?.kind||0];
  const deathCode=m=>m?.dying?({spontaneous:1,kill:2,environment:3}[m.deathCause]||1):0;
  function deathColor(rgb,m){
    if(!m?.dying)return rgb;
    const p=Math.round(clamp(m.deathProgress||0)*255)/255,code=deathCode(m);
    const tint=code===2?[248,177,48]:code===3?[158,145,112]:[75,78,86];
    const weight=code===2?.15+.85*p:code===3?.4+.45*p:.2+.65*p;
    return rgb.map((v,i)=>v+(tint[i]-v)*weight);
  }
  const deathPhaseLabel=m=>({rounding:'免疫杀伤 · 圆化',swelling:'免疫杀伤 · 肿胀待裂解',rupture:'免疫杀伤 · 破裂',shrinking:'自发凋亡 · 皱缩',withering:'环境死亡 · 萎缩'}[m?.deathPhase]||'死亡清除中');
  const nucleusStyles={normal:{stroke:'#243b53',fill:'#243b531a'},patrol:{stroke:'#8f3548',fill:'#8f35481a'},dark:{stroke:'#f2d38a',fill:'#f2d38a1a'}};
  const nucleusStyle=(m,palette)=>{if(palette||immuneSuppressive(m)){const stroke=(palette||COLOR_DEFAULTS)[colorKey(m)].nucleus;return {stroke,fill:stroke+'1a'};}return m.kind===1?nucleusStyles.normal:m.kind===3&&!immuneActive(m)?nucleusStyles.patrol:nucleusStyles.dark;};
  const nuclearAngles=Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return [Math.cos(a),Math.sin(a),Math.cos(3*a),Math.sin(3*a),Math.cos(4*a),Math.sin(4*a)];});
  function nucleusContour(m,snapshot){
    const phase=2*Math.PI*(((m.birth||m.id||1)*.61803398875+(m.kind||1)*.137)%1),rest=.10+.08*(.5+.5*Math.sin(phase*1.7));
    const recovery=m.dying?1-clamp(m.deathProgress||0):1,qx=((m.nucleusStrainX||0)+rest*Math.cos(2*phase))*recovery,qy=((m.nucleusStrainY||0)+rest*Math.sin(2*phase))*recovery;
    const angle=.5*Math.atan2(qy,qx),ratio=1+1.12*Math.min(.34,Math.hypot(qx,qy)),a=.82*m.nucleusRadius*Math.sqrt(ratio),b=.82*m.nucleusRadius/Math.sqrt(ratio),c=Math.cos(angle),s=Math.sin(angle),cp=Math.cos(phase),sp=Math.sin(phase);
    // A small, static per-cell asymmetry; no wall-clock noise or simulation RNG.
    const points=nuclearAngles.map(([ux,uy,c3,s3,c4,s4])=>{const r=1+recovery*(.015*(c3*cp-s3*sp)+.009*(s4*cp-c4*sp)),x=a*ux*r,y=b*uy*r;return [x*c-y*s,x*s+y*c];});
    // This is a visible phenotype, not a change to the mechanical nuclear core.
    // Without occupancy data, retain the conservative protected-envelope view.
    if(!snapshot?.grid)return points;
    const phaseGrowth=m.dying?0:m.cycle?.phase==='M'?1:m.cycle?.phase==='G2'?clamp(m.cycle.progress||0):0;
    let gain=(m.kind===2?1.38:1)*(1+.12*phaseGrowth);
    if(gain===1)return points;
    const {width,height,grid,boundary}=snapshot,wrap=boundary==='wrap';
    const inside=(dx,dy)=>{let x=Math.floor(m.nucleusX+.5+dx),y=Math.floor(m.nucleusY+.5+dy);if(wrap){x=(x%width+width)%width;y=(y%height+height)%height;}return x>=0&&y>=0&&x<width&&y<height&&grid[y*width+x]===m.id;};
    // Check radial spokes and edge midpoints, including a membrane margin.
    // Uniformly limiting the expansion preserves a smooth deformed contour.
    const fits=factor=>{
      for(let i=0;i<points.length;i++)for(const mid of [false,true]){
        const p=points[i],q=points[(i+1)%points.length],x=(mid?(p[0]+q[0])*.5:p[0])*factor,y=(mid?(p[1]+q[1])*.5:p[1])*factor,r=Math.hypot(x,y);
        for(let d=.5;d<r+.35;d+=.5)if(!inside(x*d/r,y*d/r))return false;
        if(!inside(x*(r+.35)/r,y*(r+.35)/r))return false;
      }return true;
    };
    while(gain>1&&!fits(gain))gain=Math.max(1,gain-.06);
    return points.map(([x,y])=>[x*gain,y*gain]);
  }
  function cycleText(m){
    if(m.dying)return '';
    return ['G0','G1','S','G2','M'].includes(m.cycle?.phase)?m.cycle.phase:'';
  }
  const antigenMarked=m=>!!m&&!m.dying&&(m.kind===2||m.state==='abnormal')&&m.antigen;
  // Smallest occupied interval on each periodic axis. A cell crossing a seam
  // gets a local box repeated at the edges, never a box spanning the dish.
  function occupiedInterval(axis,wrap){
    let first=-1,last=-1,start=0,gap=-1;
    for(let i=0;i<axis.length;i++)if(axis[i]){
      if(first<0)first=i;
      else if(i-last-1>gap){gap=i-last-1;start=i;}
      last=i;
    }
    if(first<0)return null;
    if(!wrap)return [first,last+1];
    if(first+axis.length-last-1>=gap){gap=first+axis.length-last-1;start=first;}
    return [start,start+axis.length-gap];
  }
  function selectionBounds(s,id){
    return selectionBoxes(s,[id]).get(id)||null;
  }
  function selectionBoxes(s,ids){
    const boxes=new Map(),wrap=s.boundary==='wrap';
    for(const id of ids)if(id)boxes.set(id,{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity,...(wrap?{xs:new Uint8Array(s.width),ys:new Uint8Array(s.height)}:{})});
    // One grid pass for the entire family, not a full-grid scan per descendant.
    for(let q=0;q<s.grid.length;q++){const b=boxes.get(s.grid[q]);if(!b)continue;const x=q%s.width,y=Math.floor(q/s.width);
      if(wrap){b.xs[x]=1;b.ys[y]=1;}else{b.left=Math.min(b.left,x);b.right=Math.max(b.right,x+1);b.top=Math.min(b.top,y);b.bottom=Math.max(b.bottom,y+1);}}
    for(const [id,b]of boxes){if(wrap){const x=occupiedInterval(b.xs,true),y=occupiedInterval(b.ys,true);if(x&&y){b.left=x[0];b.right=x[1];b.top=y[0];b.bottom=y[1];}delete b.xs;delete b.ys;}if(!Number.isFinite(b.left))boxes.delete(id);}
    return boxes;
  }
  // At ordinary opacity keep bodies legible; the upper half of each slider
  // deliberately releases that protection. 100% means a full-strength layer.
  const bodyOpacity=(u,protect=true)=>clamp(u)*(protect?.28+.72*clamp((u-.5)*2):1);
  const SIGNALS={cohesion:{label:'细胞凝聚因子',color:[36,171,132]},danger:{label:'损伤趋化因子',color:[239,140,42]},trail:{label:'免疫招募因子',color:[157,100,219]},il2:{label:'IL-2 扩增信号',color:[31,146,205]}};
  Object.assign(SIGNALS,{normalDamage:{label:'正常细胞损伤信号',color:[201,110,66]},inhibition:{label:'免疫抑制信号',color:[57,91,201]}});
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
  function signals(fields,enabled,opacity={},scales={}){
    const keys=Object.keys(SIGNALS).filter(k=>enabled.has(k)&&fields[k]);if(!keys.length)return null;
    const f=fields[keys[0]],rgba=new Uint8Array(f.values.length*4);
    for(let i=0;i<f.values.length;i++){
      let total=0,r=0,g=0,b=0,transparent=1;
      for(const key of keys){const weight=(1-Math.exp(-Math.max(0,fields[key].values[i])/(.35*(scales[key]??1))))*clamp(opacity[key]??1),c=SIGNALS[key].color;total+=weight;transparent*=1-weight;r+=weight*c[0];g+=weight*c[1];b+=weight*c[2];}
      if(total){const p=i*4;rgba[p]=Math.round(r/total);rgba[p+1]=Math.round(g/total);rgba[p+2]=Math.round(b/total);rgba[p+3]=Math.round(255*(1-transparent));}
    }
    return {width:f.width,height:f.height,rgba};
  }
  class Cache {
    nuclei(s){
      if(this.nuclearSnapshot!==s){this.nuclearSnapshot=s;this.nuclearContours=new Map();for(const m of s.cells)if(m.hasNucleus&&(!m.dying||m.deathIntact))this.nuclearContours.set(m.id,nucleusContour(m,s));}
      return this.nuclearContours;
    }
    nucleusBatches(s,palette){
      if(this.nuclearPathSnapshot===s&&this.nuclearPalette===palette)return this.nuclearPaths;
      const contours=this.nuclei(s),groups=new Map(),wrap=s.boundary==='wrap';
      for(const m of s.cells){const contour=contours.get(m.id);if(!contour)continue;
        const style=m.dying?{stroke:'#89531a',fill:'#ffe6a640'}:nucleusStyle(m,palette),key=style.stroke+style.fill;
        if(!groups.has(key))groups.set(key,{...style,path:new Path2D()});const path=groups.get(key).path;
        const cx=m.nucleusX+.5,cy=m.nucleusY+.5,r=Math.max(...contour.map(p=>Math.max(Math.abs(p[0]),Math.abs(p[1]))))+1;
        const xs=[0],ys=[0];if(wrap){if(cx-r<0)xs.push(s.width);if(cx+r>s.width)xs.push(-s.width);if(cy-r<0)ys.push(s.height);if(cy+r>s.height)ys.push(-s.height);}
        for(const dx of xs)for(const dy of ys){contour.forEach(([x,y],i)=>{i?path.lineTo(cx+dx+x,cy+dy+y):path.moveTo(cx+dx+x,cy+dy+y);});path.closePath();}
      }
      this.nuclearPathSnapshot=s;this.nuclearPalette=palette;return this.nuclearPaths=[...groups.values()];
    }
    selections(s,ids){
      const key=ids.join(',');if(this.boxSnapshot!==s||this.boxKey!==key){this.boxSnapshot=s;this.boxKey=key;this.boxes=selectionBoxes(s,ids);}return this.boxes;
    }
    selection(s,id){
      if(this.selectionSnapshot!==s||this.selectionID!==id){this.selectionSnapshot=s;this.selectionID=id;this.selectionBox=selectionBounds(s,id);}
      return this.selectionBox;
    }
    get(s,view,enabled,opacity={},protect=true){
      if(this.snapshot!==s){this.snapshot=s;this.adverse=null;this.signalMask=null;this.signal=null;}
      if(view==='adversity'&&!this.adverse)this.adverse=adversity(s.fields);
      const mask=protect+':'+Object.keys(SIGNALS).map(k=>enabled.has(k)?'on:'+clamp(opacity[k]??1):'off').join(',');
      if(mask!==this.signalMask){this.signal=signals(s.fields,enabled,opacity,s.maze?{trail:30}:{});this.bodySignal=protect?signals(s.fields,enabled,Object.fromEntries(Object.keys(SIGNALS).map(k=>[k,bodyOpacity(opacity[k]??1,true)])),s.maze?{trail:30}:{}):this.signal;this.signalMask=mask;}
      return {field:view==='adversity'?this.adverse:s.fields[view],info:FIELD_INFO[view],signal:this.signal,bodySignal:this.bodySignal};
    }
  }
  function sample(s,x,y){
    if(x<0||y<0||x>=s.width||y>=s.height)return null;
    x=Math.floor(x);y=Math.floor(y);const q=y*s.width+x,bin=Math.floor(y/s.fieldScale)*s.fields.oxygen.width+Math.floor(x/s.fieldScale);
    const wall=!!s.walls[q],blocked=wall||!!s.fieldMask?.[bin];
    return {x,y,bin,time:s.time,cell:s.cells.find(m=>m.id===s.grid[q])||null,wall,blocked,values:blocked?null:Object.fromEntries(['oxygen','glucose','acid',...Object.keys(SIGNALS)].map(key=>[key,s.fields[key]?.values[bin]??0]))};
  }
  globalThis.CellLabDisplay={BODY_COLORS,COLOR_DEFAULTS,COLOR_PRESETS,normalizeColors,colorPresetID,hexRGB,paletteBodies,SIGNALS,FIELD_INFO,immuneActive,immuneSuppressive,displayKind,tumorShade,bodyColor,cellName,deathCode,deathColor,deathPhaseLabel,nucleusStyle,nucleusContour,cycleText,antigenMarked,selectionBounds,selectionBoxes,bodyOpacity,adversity,signals,sample,Cache};
})();
