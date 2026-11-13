/* Display-only traces use model time and birth identity, never animation time. */
(() => {
  class Trajectories {
    constructor(){this.paths=new Map();this.enabled=false;this.duration=400;this.revision=null;}
    configure(enabled,duration){if(!enabled)this.paths.clear();this.enabled=!!enabled;this.duration=Math.max(20,Math.min(2000,Number(duration)||400));}
    sample(s){
      if(this.revision!==s.revision){this.paths.clear();this.revision=s.revision;}
      if(this.refinement&&s.refinement&&this.refinement!==s.refinement){const q=s.refinement/this.refinement;for(const path of this.paths.values())for(const p of path.points){p.x*=q;p.y*=q;}}
      this.refinement=s.refinement;
      if(!this.enabled)return;
      const cutoff=s.time-this.duration;
      for(const c of s.cells){if(c.dying)continue;const key=c.birth??c.id;let path=this.paths.get(key);if(!path){path={id:c.id,kind:c.kind,points:[]};this.paths.set(key,path);}path.kind=c.kind;
        const last=path.points.at(-1),point={x:c.x,y:c.y,time:s.time,break:false};
        if(last?.time===s.time){if(Math.hypot(last.x-c.x,last.y-c.y)>.1){point.break=true;path.points[path.points.length-1]=point;}continue;}
        if(last&&s.boundary==='wrap'&&(Math.abs(last.x-c.x)>s.width/2||Math.abs(last.y-c.y)>s.height/2))point.break=true;
        path.points.push(point);
      }
      for(const [key,path]of this.paths){let start=0;while(start<path.points.length&&path.points[start].time<cutoff)start++;if(start)path.points.splice(0,start);if(!path.points.length)this.paths.delete(key);}
    }
  }
  globalThis.CellLabTrajectories=Trajectories;
})();
