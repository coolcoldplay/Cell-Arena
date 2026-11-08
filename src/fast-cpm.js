/* Algebraically equivalent specializations of Artistoo constraints.
 * Portions adapted from Artistoo, copyright (c) 2019 Johannes Textor & Inge Wortel.
 * MIT notice: ../vendor/LICENSE; exact upstream revision: ../THIRD_PARTY_NOTICES.md.
 * The official bundle stays unchanged. The reference kernel is retained for
 * energy/trajectory comparison; no copy attempts or biological steps are skipped. */
(() => {
  'use strict';
  function install(sim){
    const C=sim.C,grid=C.grid._pixels,neighbors=sim.neighbors,cells=sim.cells;
    C.neighi=i=>neighbors[i]; // GridBasedModel bound the original method at construction.
    const perimeter=C.getConstraint('PerimeterConstraint'),adhesion=C.getConstraint('Adhesion'),act=sim.act;
    perimeter.deltaH=(src,tgt,a,b)=>{
      if(a===b)return 0;const ca=cells[a],cb=cells[b],la=ca?.lambdaP||0,lb=cb?.lambdaP||0;if(!la&&!lb)return 0;
      let da=0,db=0;const ns=neighbors[tgt];
      for(let k=0;k<ns.length;k++){const n=grid[ns[k]];da+=n===a?-1:1;db+=n===b?1:-1;}
      let energy=0;
      if(la){const p=perimeter.cellperimeters[a],hnew=(p+da)-ca.perimeter,hold=p-ca.perimeter;energy+=la*(hnew*hnew-hold*hold);}
      if(lb){const p=perimeter.cellperimeters[b],hnew=(p+db)-cb.perimeter,hold=p-cb.perimeter;energy+=lb*(hnew*hnew-hold*hold);}
      return energy;
    };
    adhesion.deltaH=(src,tgt,a,b)=>{
      let hs=0,ht=0;const ns=neighbors[tgt];for(let k=0;k<ns.length;k++){const n=grid[ns[k]];if(n!==a)hs+=adhesion.J(n,a);if(n!==b)ht+=adhesion.J(n,b);}return hs-ht;
    };
    const values=new Uint8Array(grid.length),active=new Uint32Array(grid.length),where=new Int32Array(grid.length);where.fill(-1);let count=0;
    for(const key in act.cellpixelsact){const i=Number(key),a=act.cellpixelsact[i];if(a){values[i]=a;where[i]=count;active[count++]=i;}}
    act.cellpixelsact=values;act.pxact=i=>values[i];
    act.setActivity=(i,value)=>{
      values[i]=value;
      if(value&&where[i]<0){where[i]=count;active[count++]=i;}
      else if(!value&&where[i]>=0){const slot=where[i],last=active[--count];active[slot]=last;where[last]=slot;where[i]=-1;}
    };
    const setListeners=C.soft_constraints.filter(c=>typeof c.postSetpixListener==='function');
    const mcsListeners=C.soft_constraints.filter(c=>typeof c.postMCSListener==='function');
    C.post_setpix_listeners[setListeners.indexOf(act)]=(i,old,id)=>act.setActivity(i,C.conf.MAX_ACT[C.cellKind(id)]||0);
    C.post_mcs_listeners[mcsListeners.indexOf(act)]=()=>{
      let n=0;while(n<count){const i=active[n];if(values[i]>1){values[i]--;n++;}else{values[i]=0;const last=active[--count];active[n]=last;where[last]=n;where[i]=-1;}}
    };
    act.activityAt=i=>{
      const id=grid[i];let product=values[i];if(!id||!product)return 0;let n=1;const ns=neighbors[i];
      for(let k=0;k<ns.length;k++){const j=ns[k];if(grid[j]===id){const a=values[j];if(!a)return 0;product*=a;n++;}}
      return Math.pow(product,1/n);
    };
    act.deltaH=(src,tgt,a,b)=>{const m=cells[a||b];if(!m?.activity)return 0;return m.activity*(act.activityAt(tgt)-act.activityAt(src))/C.conf.MAX_ACT[m.kind];};
    sim.kernel='fast';
  }
  globalThis.CellLabFast={install};
})();
