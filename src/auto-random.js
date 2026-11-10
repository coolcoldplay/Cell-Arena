/* Wall-clock exhibition control, outside the seeded simulation. Only discrete
 * biology and population events reset the idle timer; motion/shape, concentration
 * noise, numerical damage and cycle progress are deliberately not activity. */
(() => {
  'use strict';
  const phases={G0:0,G1:1,S:2,G2:3,M:4};
  const events=['divisions','immuneDivisions','manualRemoved','kills','apoptosis','environment','apoptosisStarted','killStarted','environmentStarted','mutations','normalTraitMutations','abnormalInitiations','malignantTransitions','antigenExposures','antigenEscapes','suppressiveTransitions','suppressiveRecoveries','injuryDeactivations','signalDeactivations'];
  function state(c){return (c.kind||0)|(c.state==='abnormal'?4:0)|(c.immunePhenotype==='suppressive'?8:0)|(c.activation>0?16:0)|(c.antigen?32:0)|(c.dying?64:0)|(({spontaneous:1,kill:2,environment:3}[c.deathCause]||0)<<7)|((phases[c.cycle?.phase]||0)<<9)|(c.cycle?.arrest?4096:0);}
  class Controller {
    constructor(){this.minutes=0;this.reset();}
    configure(value,now=0){this.minutes=Number.isFinite(value)&&value>=0&&value<=1440?value:0;this.reset(now);}
    reset(now=0){this.elapsed=0;this.lastTick=now;this.active=false;this.fired=false;this.observed=null;this.members=new Map();this.eventStamp='';this.epoch=null;this.count=0;}
    observe(s,now){
      if(!s||s===this.observed)return;
      const epoch=s.revision+':'+s.seed;
      if(epoch!==this.epoch||s.time<this.time){this.reset(now);this.epoch=epoch;}
      let changed=false,count=0;
      for(const c of s.cells)if(c.kind>0&&c.kind<4){
        count++;const key=c.birth??c.id,code=state(c);if(this.members.get(key)!==code)changed=true;
      }
      const stamp=events.map(k=>s.counters?.[k]||0).join(',');
      if(count!==this.count||stamp!==this.eventStamp)changed=true;
      if(changed){this.elapsed=0;this.lastTick=now;this.members.clear();for(const c of s.cells)if(c.kind>0&&c.kind<4)this.members.set(c.birth??c.id,state(c));}
      this.count=count;this.eventStamp=stamp;this.time=s.time;this.observed=s;
      // Pause/resume messages arrive independently of animation frames. Never
      // charge a paused interval when a frame was delayed or the tab was hidden.
      if(!s.playing){this.active=false;this.lastTick=now;}
    }
    tick(s,now,allowed=true){
      this.observe(s,now);const delta=Math.max(0,now-this.lastTick);this.lastTick=now;
      if(!this.minutes||!s?.playing||!allowed||this.fired){this.active=false;return null;}
      if(this.active)this.elapsed+=delta;this.active=true;
      const reason=this.count===0?'empty':this.elapsed>=this.minutes*60000?'idle':null;
      if(reason){this.fired=true;this.active=false;}return reason;
    }
    suspend(now){this.active=false;this.lastTick=now;}
    status(){return {minutes:this.minutes,elapsedMs:this.elapsed,remainingMs:Math.max(0,this.minutes*60000-this.elapsed),count:this.count,fired:this.fired};}
  }
  globalThis.CellLabAutoRandom={Controller};
})();
