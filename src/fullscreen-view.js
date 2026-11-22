/* The stage occupies the arena column in mobile fullscreen. */
(() => {
  function layout(width,height,ratio){
    const boardWidth=Math.min(width,height*ratio);
    return {boardWidth,boardHeight:boardWidth/ratio};
  }
  function coordinates(rect,x,y){
    return [(x-rect.left)/rect.width,(y-rect.top)/rect.height];
  }
  class View {
    constructor(stage,panel){
      this.stage=stage;
      this.panel=panel;
      this.mobile=false;
      this.heading=panel.querySelector('h2');
      this.fields=panel.querySelectorAll('[data-stat]');
      this.desktop=document.querySelector('#statistics-panel .tumor-assessment');
      this.mobileAssessment=panel.querySelector('.tumor-assessment');
      this.line=panel.querySelector('polyline');
      this.dot=panel.querySelector('circle');
      this.delta=panel.querySelector('[data-trend=delta]');
      this.range=panel.querySelector('[data-trend=range]');
    }
    enable(active,mobile=false){
      this.mobile=active&&mobile;
      document.body.classList.toggle('mobile-arena-fullscreen',this.mobile);
      this.panel.hidden=!this.mobile;
    }
    frame(ratio){
      return this.mobile?layout(this.stage.clientWidth,this.stage.clientHeight,ratio):null;
    }
    update(s,desktopVisible=false){
      if(!s||(!this.mobile&&!desktopVisible))return;
      const en=document.documentElement.lang.startsWith('en');
      const {assess,names,live}=CellLabTumorState;
      const {phase,signals,recent,delta}=assess(s.history);
      const first=recent[0],last=recent.at(-1);
      if(!last)return;
      const label=id=>names[id][en?1:0];
      const times=first.time+'–'+last.time+' MCS';
      const evidence=[times+' · '+(en?'Live tumor':'存活肿瘤')+' '+live(first)+' → '+live(last)];
      if(live(last))evidence.push('G0 '+last.tumorG0+'/'+live(last)+' · '+(en?'Low presentation':'低呈递')+' '+last.tumorNegative+'/'+live(last));
      const immune=last.immune-last.immuneDying;
      if(immune)evidence.push((en?'Exhaustion > 0.5':'耗竭值 > 0.5')+' · '+last.immuneExhausted+'/'+immune);
      if(phase==='onset'||phase==='redetected')evidence.push((en?'Malignant transitions in window':'窗口内癌变')+' +'+(last.malignantTransitions-first.malignantTransitions));
      if(signals.includes('distal'))evidence.push((en?'Distal divisions':'原灶外分裂')+' +'+(last.distalTumorDivisions-first.distalTumorDivisions));
      if(signals.includes('export'))evidence.push((en?'Bloodstream entries':'入血事件')+' +'+(last.intravasations-first.intravasations));
      if(signals.includes('escapeHint'))evidence.push((en?'Low-presentation cells':'低呈递细胞')+' '+first.tumorNegative+' → '+last.tumorNegative+' · '+(en?'recognitions':'识别事件')+' +'+(last.recognitions-first.recognitions));
      if(signals.includes('immuneActive'))evidence.push((en?'Immune clearances':'免疫清除')+' +'+(last.kills-first.kills));
      const updateText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
      for(const view of [this.mobile&&this.mobileAssessment,desktopVisible&&this.desktop]){
        if(!view)continue;
        updateText(view.querySelector('[data-state-phase]'),label(phase));
        const badges=view.querySelector('[data-state-signals]'),stamp=signals.map(label).join('|');
        if(badges.dataset.stamp!==stamp){
          badges.dataset.stamp=stamp;
          badges.replaceChildren(...signals.map(id=>{const badge=document.createElement('span');badge.textContent=label(id);return badge;}));
        }
        updateText(view.querySelector('[data-state-evidence]'),evidence.join('\n'));
      }
      if(!this.mobile)return;
      updateText(this.heading,CellLabI18n.translate(s.playing?'运行中':'已暂停',en?'en':'zh'));
      const values=CellLabRounds.population(s);
      Object.assign(values,{time:s.time,divisions:s.counters.divisions,clearances:s.deaths.kill.cleared});
      for(const field of this.fields)updateText(field,values[field.dataset.stat].toLocaleString());
      const counts=recent.map(live),low=Math.min(...counts),high=Math.max(...counts);
      const points=recent.map((r,i)=>{
        const x=first.time===last.time?118:2+116*(r.time-first.time)/(last.time-first.time);
        const y=high===low?15:27-24*(counts[i]-low)/(high-low);
        return [x.toFixed(1),y.toFixed(1)];
      });
      this.line.setAttribute('points',points.map(point=>point.join(',')).join(' '));
      this.dot.setAttribute('cx',points.at(-1)[0]);this.dot.setAttribute('cy',points.at(-1)[1]);
      updateText(this.delta,recent.length>1?(delta>0?'+':'')+delta:'—');
      updateText(this.range,times);
    }
  }
  globalThis.CellLabFullscreen={layout,coordinates,View};
})();
