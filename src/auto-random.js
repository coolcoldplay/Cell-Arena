/* Wall-clock exhibition control, separate from the seeded biological model.
 * Both stagnation and extinction announce a cancellable ten-second notice. */
(() => {
  'use strict';
  const phases={G0:0,G1:1,S:2,G2:3,M:4},NOTICE_MS=10000;
  const events=['divisions','immuneDivisions','manualRemoved','kills','apoptosis','environment','lifespan','apoptosisStarted','killStarted','environmentStarted','lifespanStarted','mutations','normalTraitMutations','abnormalInitiations','malignantTransitions','antigenExposures','antigenEscapes','suppressiveTransitions','suppressiveRecoveries','injuryDeactivations','signalDeactivations'];
  function state(c){return (c.kind||0)|(c.state==='abnormal'?4:0)|(c.immunePhenotype==='suppressive'?8:0)|(c.activation>0?16:0)|(c.antigen?32:0)|(c.dying?64:0)|(({spontaneous:1,kill:2,environment:3,lifespan:4}[c.deathCause]||0)<<7)|((phases[c.cycle?.phase]||0)<<10)|(c.cycle?.arrest?16384:0);}
  class Controller {
    constructor(){this.minutes=0;this.reset();}
    configure(value,now=0){this.minutes=Number.isFinite(value)&&value>=0&&value<=1440?value:0;this.reset(now);}
    reset(now=0){this.elapsed=0;this.lastTick=now;this.lastActivity=now;this.active=false;this.fired=false;this.observed=null;this.members=new Map();this.eventStamp='';this.epoch=null;this.count=0;this.population={normal:0,abnormal:0,tumor:0,immune:0};this.pendingReason=null;this.noticeElapsed=0;}
    observe(s,now){
      if(!s||s===this.observed)return;
      const epoch=s.revision+':'+s.seed;if(epoch!==this.epoch||s.time<this.time){this.reset(now);this.epoch=epoch;}
      let changed=false,count=0;const population={normal:0,abnormal:0,tumor:0,immune:0};
      for(const c of s.cells)if(c.kind>0&&c.kind<4){
        count++;const key=c.birth??c.id,code=state(c);if(this.members.get(key)!==code)changed=true;
        if(!c.dying)population[c.kind===1?(c.state==='abnormal'?'abnormal':'normal'):c.kind===2?'tumor':'immune']++;
      }
      const stamp=events.map(k=>s.counters?.[k]||0).join(',');if(count!==this.count||stamp!==this.eventStamp)changed=true;
      if(changed){this.elapsed=0;this.lastActivity=now;this.members.clear();for(const c of s.cells)if(c.kind>0&&c.kind<4)this.members.set(c.birth??c.id,state(c));if(this.pendingReason==='idle'){this.pendingReason=null;this.noticeElapsed=0;}}
      this.count=count;this.population=population;this.eventStamp=stamp;this.time=s.time;this.observed=s;
      if(!s.playing)this.suspend(now);
    }
    reason(s){
      if(!this.count)return 'empty';
      const p=this.population;
      if(p.tumor&&!p.normal&&!p.abnormal&&!p.immune)return 'tumor-only';
      if(!p.immune)return 'no-immune';
      // Pure immune patrol is the explicit purpose of this preset.
      if(!p.normal&&s.scene!=='maze')return 'no-normal';
      return this.elapsed>=this.minutes*60000?'idle':null;
    }
    tick(s,now,allowed=true){
      this.observe(s,now);const previous=this.lastTick,delta=Math.max(0,now-previous);this.lastTick=now;
      if(!this.minutes||!s?.playing||!allowed||this.fired){this.active=false;return null;}
      if(this.active)this.elapsed+=Math.max(0,now-Math.max(previous,this.lastActivity));
      const reason=this.reason(s);
      if(reason!==this.pendingReason){this.pendingReason=reason;this.noticeElapsed=0;}
      else if(reason&&this.active)this.noticeElapsed+=delta;
      this.active=true;
      if(reason&&this.noticeElapsed>=NOTICE_MS){this.fired=true;this.active=false;return reason;}return null;
    }
    suspend(now){this.active=false;this.lastTick=now;}
    status(){return {minutes:this.minutes,elapsedMs:this.elapsed,remainingMs:Math.max(0,this.minutes*60000-this.elapsed),count:this.count,fired:this.fired,pendingReason:this.pendingReason,countdownMs:this.pendingReason?Math.max(0,NOTICE_MS-this.noticeElapsed):0};}
  }
  globalThis.CellLabAutoRandom={Controller};
})();
