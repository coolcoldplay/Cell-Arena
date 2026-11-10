/* Entropy belongs at experiment creation, never in the seeded model loop. */
(() => {
  'use strict';
  const UINT32=4294967296;
  function mix(value){
    value^=value>>>16;value=Math.imul(value,0x7feb352d);
    value^=value>>>15;value=Math.imul(value,0x846ca68b);
    return (value^(value>>>16))>>>0;
  }
  function entropy(){
    try{if(globalThis.crypto?.getRandomValues)return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];}catch{}
    // Offline/restricted browsers still get time, sub-ms timing and a counter.
    return Math.floor(Math.random()*UINT32)>>>0;
  }
  function createGenerator({now=()=>Date.now(),precise=()=>globalThis.performance?.now()||0,random=entropy}={}){
    let serial=0;
    const recent=new Set();
    return ()=>{
      const time=now(),base=mix(time>>>0)^mix(Math.floor(time/UINT32))^mix(Math.floor(precise()*1000))^mix(random());
      let seed;
      do{seed=mix(base+Math.imul(++serial,0x9e3779b9));}while(recent.has(seed));
      recent.add(seed);if(recent.size>256)recent.delete(recent.values().next().value);
      return seed;
    };
  }
  globalThis.CellLabStartSeed={createGenerator};
})();
