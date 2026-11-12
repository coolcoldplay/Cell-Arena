/* Display-only mobile framing. Rotation never changes the lattice or model. */
(() => {
  function layout(width,height,ratio){
    const rotated=height>width,w=rotated?height:width,h=rotated?width:height;
    const boardWidth=Math.min(w,h*ratio),boardHeight=boardWidth/ratio;
    return {rotated,width:w,height:h,boardWidth,boardHeight,rail:Math.max(0,(w-boardWidth)/2)};
  }
  function coordinates(rect,x,y,rotated){
    return rotated?[(y-rect.top)/rect.height,1-(x-rect.left)/rect.width]:[(x-rect.left)/rect.width,(y-rect.top)/rect.height];
  }
  class View {
    constructor(viewport,stage){this.viewport=viewport;this.stage=stage;this.active=false;this.mobile=false;this.rotated=false;this.lastSnapshot=null;}
    enable(active,mobile=false){
      this.active=active;this.mobile=active&&mobile;this.rotated=false;
      document.body.classList.toggle('mobile-arena-fullscreen',this.mobile);
      if(!this.mobile){this.stage.style.cssText='';delete this.stage.dataset.rotated;}
      for(const el of this.stage.querySelectorAll('.fullscreen-rail'))el.hidden=!this.mobile;
    }
    frame(ratio){
      if(!this.mobile)return null;
      const f=layout(this.viewport.clientWidth,this.viewport.clientHeight,ratio);this.rotated=f.rotated;
      Object.assign(this.stage.style,{width:f.width+'px',height:f.height+'px',left:'50%',top:'50%',transform:'translate(-50%,-50%)'+(f.rotated?' rotate(90deg)':'')});
      this.stage.dataset.rotated=String(f.rotated);this.stage.style.setProperty('--rail-space',f.rail+'px');
      for(const el of this.stage.querySelectorAll('.fullscreen-rail'))el.hidden=f.rail<82;
      return f;
    }
    update(s){
      if(!this.mobile||!s)return;this.lastSnapshot=s;
      const en=document.documentElement.lang.startsWith('en'),t=(a,b)=>en?b:a,p=CellLabRounds.population(s);
      const fill=(side,title,rows)=>{
        const root=this.stage.querySelector('[data-fullscreen-rail="'+side+'"]');
        const values=JSON.stringify([title,rows]);if(root.dataset.values===values)return;root.dataset.values=values;root.replaceChildren();
        const head=document.createElement('h2');head.textContent=title;root.append(head);
        for(const [label,value,kind]of rows){const item=document.createElement('div'),name=document.createElement('span'),n=document.createElement('b');item.className='fullscreen-stat '+(kind||'');name.textContent=label;n.textContent=typeof value==='number'?value.toLocaleString():value;item.append(name,n);root.append(item);}
      };
      fill('left',t('当前细胞','Population'),[[t('正常','Normal'),p.normal],[t('癌前','Precancer'),p.abnormal],[t('肿瘤','Tumor'),p.tumor,'tumor-text'],[t('免疫','Immune'),p.immune],[t('内皮','Endothelium'),p.endothelial]]);
      fill('right',s.playing?t('模拟中','Running'):t('已暂停','Paused'),[['MCS',s.time],[t('静息 / 激活 / 抑制','Rest / Active / Supp.'),p.immuneResting+' / '+p.immuneActive+' / '+p.immuneSuppressive],[t('免疫清除','Immune kills'),s.deaths?.kill?.cleared||0],[t('累计分裂','Divisions'),s.counters.divisions],[t('巡逻覆盖','Coverage'),Math.round(s.patrol.coverage*100)+'%']]);
    }
  }
  globalThis.CellLabFullscreen={layout,coordinates,View};
})();
