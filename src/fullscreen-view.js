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
    }
    enable(active,mobile=false){
      this.mobile=active&&mobile;
      document.body.classList.toggle('mobile-arena-fullscreen',this.mobile);
      this.panel.hidden=!this.mobile;
    }
    frame(ratio){
      return this.mobile?layout(this.stage.clientWidth,this.stage.clientHeight,ratio):null;
    }
    update(s){
      if(!this.mobile||!s)return;
      const state=CellLabI18n.translate(s.playing?'运行中':'已暂停',document.documentElement.lang.startsWith('en')?'en':'zh');
      if(this.heading.textContent!==state)this.heading.textContent=state;
      const population=CellLabRounds.population(s);
      for(const field of this.fields){
        const key=field.dataset.stat;
        const value=(key==='time'?s.time:population[key]).toLocaleString();
        if(field.textContent!==value)field.textContent=value;
      }
    }
  }
  globalThis.CellLabFullscreen={layout,coordinates,View};
})();
