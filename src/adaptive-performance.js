/* Presentation-only feedback controller. It never owns model state or RNGs.
 * CPU/GPU biological backends remain fixed until explicitly reconfigured. */
(() => {
  'use strict';
  const profiles={
    auto:{fps:60,dpr:2,pixels:3000000,uiHz:8,workMs:6,idleMs:0},
    power:{fps:30,dpr:1.25,pixels:1200000,uiHz:4,workMs:4,idleMs:4},
    smooth:{fps:60,dpr:1.5,pixels:2000000,uiHz:5,workMs:4,idleMs:0},
    quality:{fps:60,dpr:3,pixels:6000000,uiHz:8,workMs:8,idleMs:0}
  };
  const scales=[1,.85,.7,.55],rates=[60,45,30,20];
  const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
  const percentile=(values,p=.9)=>{if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];};
  class Controller {
    constructor({mode,preferences,now=0}={}){
      this.mode=Object.hasOwn(profiles,mode)?mode:preferences?.version===1&&Object.hasOwn(profiles,preferences.mode)?preferences.mode:'auto';
      this.resolutionLevel=0;this.publicationLevel=0;this.uiLevel=0;this.changes=0;
      this.state={playing:true,hidden:false,recording:false,mobile:false,preview:false,manual:false};
      this.metrics={};this.bottleneck='warming';this.reset(now);
    }
    reset(now=0){this.lastWindow=now;this.warmUntil=now+3000;this.badSince=null;this.goodSince=null;this.lastReason='';this.samples=[];this.gaps=[];this.inputs=[];}
    setMode(mode,now=0){this.mode=Object.hasOwn(profiles,mode)?mode:'auto';this.resolutionLevel=0;this.publicationLevel=0;this.uiLevel=0;this.reset(now);}
    context(update,now=0){
      let changed=false;for(const key of Object.keys(this.state))if(key in update&&this.state[key]!==!!update[key]){this.state[key]=!!update[key];changed=true;}
      if(changed)this.reset(now);return changed;
    }
    sample(value){this.samples.push(value);if(this.samples.length>120)this.samples.shift();}
    frameGap(ms){if(ms>0&&ms<1000){this.gaps.push(ms);if(this.gaps.length>120)this.gaps.shift();}}
    inputDelay(ms){if(ms>=0&&ms<2000)this.inputs.push(ms);}
    tick(now){
      if(now-this.lastWindow<1000)return false;this.lastWindow=now;
      const s=this.state,samples=this.samples.splice(0),gaps=this.gaps.splice(0),inputs=this.inputs.splice(0);
      if(!s.playing||s.hidden||s.recording){this.bottleneck=s.hidden?'hidden':s.recording?'recording':'paused';this.badSince=this.goodSince=null;return false;}
      if(now<this.warmUntil||samples.length<3){this.bottleneck=now<this.warmUntil?'warming':'simulation';return false;}
      const p=profiles[this.mode],fps=this.status().fps,budget=1000/fps;
      const m=this.metrics={renderMs:percentile(samples.map(v=>finite(v.renderMs))),snapshotMs:percentile(samples.map(v=>finite(v.snapshotMs))),stepMs:percentile(samples.map(v=>finite(v.stepMs))),gapMs:percentile(gaps),inputMs:percentile(inputs),rate:finite(samples.at(-1).rate),targetRate:finite(samples.at(-1).targetRate)};
      const snapshotHz=Math.min(fps,m.targetRate||fps,1000/Math.max(1,m.stepMs+m.snapshotMs));
      const snapshotPressure=m.snapshotMs>6&&m.snapshotMs*snapshotHz>250;
      const reason=m.renderMs>budget*.65?'render':snapshotPressure?'snapshot':m.inputMs>80||m.gapMs>Math.max(42,budget*1.7)?'interaction':m.targetRate>0&&m.rate<m.targetRate*.8?'simulation':'balanced';
      this.bottleneck=reason;
      // Missing simulation frames are not evidence of a slow renderer.
      const overloaded=['render','snapshot','interaction'].includes(reason);
      if(overloaded){
        this.goodSince=null;if(this.lastReason!==reason){this.badSince=now;this.lastReason=reason;}
        if(this.badSince===null)this.badSince=now;
        if(now-this.badSince<2000)return false;
        this.badSince=now;
        if(reason==='render'&&!s.manual&&this.resolutionLevel<3)this.resolutionLevel++;
        else if(reason==='interaction'&&this.uiLevel<2)this.uiLevel++;
        else if(this.publicationLevel<3)this.publicationLevel++;
        else return false;
        this.changes++;return true;
      }
      this.badSince=null;this.lastReason='';
      // Recover conservatively, against the original target, not the relaxed one.
      const room=m.renderMs<1000/p.fps*.35&&m.snapshotMs<3&&m.gapMs<Math.max(25,percentile(gaps,.2)*1.4)&&m.inputMs<40;
      if(!room){this.goodSince=null;return false;}
      if(this.goodSince===null)this.goodSince=now;
      if(now-this.goodSince<15000)return false;
      this.goodSince=now;
      if(this.uiLevel)this.uiLevel--;else if(this.publicationLevel)this.publicationLevel--;else if(this.resolutionLevel)this.resolutionLevel--;else return false;
      this.changes++;return true;
    }
    status(){
      const p=profiles[this.mode],s=this.state;
      let fps=Math.min(p.fps,rates[this.publicationLevel]);if(s.preview)fps=Math.min(fps,15);if(s.recording)fps=Math.max(fps,30);
      return {mode:this.mode,resolutionLevel:this.resolutionLevel,publicationLevel:this.publicationLevel,fps,uiMs:Math.round(1000/p.uiHz*(1+this.uiLevel)),workMs:p.workMs,idleMs:p.idleMs,scale:scales[this.resolutionLevel],bottleneck:this.bottleneck,changes:this.changes,metrics:{...this.metrics},...s};
    }
    display({cssWidth,ratio=4/3,dpr=1,manualWidth=0,recordingScale=0}){
      const p=profiles[this.mode],s=this.state,r=Math.max(.1,finite(ratio,4/3)),css=Math.max(1,finite(cssWidth,640));
      const cap=s.mobile&&this.mode==='auto'?1.5:p.dpr,preview=s.preview&&!s.recording;
      let width=manualWidth>0?manualWidth:Math.max(480,css*Math.min(Math.max(1,finite(dpr,1)),cap)*scales[this.resolutionLevel]);
      if(!manualWidth)width=Math.min(width,3840,Math.sqrt(p.pixels*r),preview?960:Infinity);
      // Recording owns its source resolution. Preview policy cannot lower it.
      if(recordingScale>0)width=Math.max(width,css*recordingScale);
      width=Math.max(4,Math.min(Math.floor(Math.min(8192,8192*r)/4)*4,Math.ceil(width/4)*4));
      return {width,height:Math.max(1,Math.round(width/r)),pixelRatio:width/css};
    }
    preferences(){return {version:1,mode:this.mode};}
  }
  globalThis.CellLabPerformance={Controller,profiles};
})();
