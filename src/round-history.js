/* Experiment controls and compact round records, never part of the model RNG. */
(() => {
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  class Locks {
    constructor(keys,saved={}){this.keys=[...keys];this.values={};this.restore(saved);}
    restore(saved={}){for(const key of this.keys)this.values[key]=saved?.[key]===true;}
    toggle(key){if(this.keys.includes(key))this.values[key]=!this.values[key];}
    all(value){for(const key of this.keys)this.values[key]=!!value;}
    pick(settings){return Object.fromEntries(this.keys.filter(k=>this.values[k]&&settings[k]!==undefined).map(k=>[k,settings[k]]));}
    toJSON(){return {...this.values};}
  }
  function randomGeometry(seed,current,locks){
    // Setup-only sampling never consumes the simulation's biological RNG.
    let n=seed>>>0;const pick=values=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return values[Math.floor(n/4294967296*values.length)];};
    const widths=[192,240,256,320,384].filter(w=>!locks.refinement||(w*current.refinement<=1024&&w*.75*current.refinement<=768));
    const worldWidth=locks['world-size']?current.worldWidth:pick(widths),worldHeight=locks['world-size']?current.worldHeight:worldWidth*.75;
    const refinements=[1,1.5,2].filter(r=>worldWidth*r<=1024&&worldHeight*r<=768);
    return {worldWidth,worldHeight,refinement:locks.refinement?current.refinement:pick(refinements),boundary:locks.boundary?current.boundary:pick(['wrap','solid'])};
  }
  function population(s){
    const p={total:0,normal:0,abnormal:0,tumor:0,immune:0,tumorStem:0,tumorDifferentiated:0,tumorAntigenPositive:0,tumorAntigenNegative:0,immuneResting:0,immuneActive:0,immuneSuppressive:0,clearing:0,spontaneousClearing:0,environmentClearing:0,killClearing:0,lifespanClearing:0};
    for(const c of s.cells||[])if(c.kind>0&&c.kind<4){
      if(c.dying){p.clearing++;const key=c.deathCause+'Clearing';if(key in p)p[key]++;continue;}
      p.total++;if(c.kind===1)p[c.state==='abnormal'?'abnormal':'normal']++;
      else if(c.kind===2){p.tumor++;p[c.isStem?'tumorStem':'tumorDifferentiated']++;p[c.antigen?'tumorAntigenPositive':'tumorAntigenNegative']++;}
      else{p.immune++;p[c.immunePhenotype==='suppressive'?'immuneSuppressive':c.activation>0?'immuneActive':'immuneResting']++;}
    }return p;
  }
  class Journal {
    constructor(){this.active=null;this.serial=0;}
    begin(s,now,iso=new Date().toISOString(),locks={},display={},replayOf=null){
      this.active={id:iso+'-'+s.seed+'-'+(++this.serial),scene:s.scene,seed:s.seed,startedAt:iso,endedAt:null,lastSeenAt:iso,reason:'running',worldWidth:s.worldWidth,worldHeight:s.worldHeight,refinement:s.refinement,boundary:s.boundary,initialMCS:s.time,simulatedMCS:s.time,runningMs:0,initialSettings:{...s.settings},finalSettings:{...s.settings},initialLocks:{...locks},finalLocks:{...locks},parameterChanges:[],population:population(s),initialPopulation:population(s),cycles:copy(s.cycles||{}),sources:copy(s.sources||[]),counters:{...s.counters}};
      Object.assign(this.active,{modelRevision:s.modelRevision||null,initialWarmup:s.warmup,initialKernel:s.kernel,initialCompute:s.compute?.active,initialSpeed:s.speed||1,initialDisplay:copy(display),initialSources:(s.sources||[]).map(v=>({type:v.type,x:v.x/s.refinement,y:v.y/s.refinement,radius:v.radius/s.refinement})),initialMaze:s.maze?{signalThroughWalls:!!s.maze.signalThroughWalls}:null,replayOf});
      this.epoch=s.revision+':'+s.seed;this.lastTick=now;this.running=!!s.playing;return this.current();
    }
    observe(s,now,running=true){
      const a=this.active;if(!a||s.revision+':'+s.seed!==this.epoch)return;
      if(this.running&&running&&s.playing)a.runningMs+=Math.max(0,now-this.lastTick);this.lastTick=now;this.running=running&&!!s.playing;
      for(const [key,value]of Object.entries(s.settings))if(a.finalSettings[key]!==value)a.parameterChanges.push({mcs:s.time,key,value});
      a.finalSettings={...s.settings};a.simulatedMCS=s.time;a.population=population(s);a.counters={...s.counters};a.cycles=copy(s.cycles||{});a.sources=copy(s.sources||[]);a.lastSeenAt=new Date().toISOString();
    }
    finish(reason,now,iso=new Date().toISOString(),locks={},display={}){
      if(!this.active)return null;const a=this.active;a.reason=reason;a.endedAt=iso;a.finalLocks={...locks};a.display=copy(display);this.active=null;this.running=false;return copy(a);
    }
    current(){return this.active?copy(this.active):null;}
  }
  const reasons={'history-replay':'重新模拟历史局',empty:'全部细胞消失','tumor-only':'仅剩肿瘤细胞','no-immune':'免疫细胞为 0','no-normal':'正常细胞为 0',idle:'数量与生物状态长时间不变','manual-random':'手动随机生成','manual-restart':'手动重来','scene-change':'切换情境','preset-reset':'恢复情境','import':'导入参数','external-reset':'重新开局',interrupted:'页面关闭／重新载入',running:'进行中'};
  const reasonLabel=reason=>reasons[String(reason).replace(/^auto-/,'')]||reason;
  function numbered(records){return records.slice().sort((a,b)=>a.startedAt.localeCompare(b.startedAt)||a.id.localeCompare(b.id)).map((r,i)=>({...r,roundNumber:i+1}));}
  function replayExperiment(r){
    return copy({format:'cell-arena-experiment',schemaVersion:1,version:'4.0.0',scene:r.scene,seed:r.seed,boundary:r.boundary,worldWidth:r.worldWidth,worldHeight:r.worldHeight,refinement:r.refinement,settings:r.initialSettings,warmup:r.initialWarmup,sources:r.initialSources,maze:r.initialMaze,speed:r.initialSpeed||1,display:{...(r.initialDisplay||{}),autoRandomMinutes:0}});
  }
  function csv(records){
    records=numbered(records);
    const params=[...new Set(records.flatMap(r=>[...Object.keys(r.initialSettings),...Object.keys(r.finalSettings)]))].sort();
    const events=[...new Set(records.flatMap(r=>Object.keys(r.counters)))].sort(),states=Object.keys(population({cells:[]}));
    const columns=['round_number','model_revision','replay_of','initial_sources','run_id','started_at','ended_at','reason','reason_label','scene','seed','simulated_MCS','running_seconds','world_width','world_height','refinement','boundary',...states.map(k=>'end.'+k),...params.map(k=>'initial.'+k),...params.map(k=>'final.'+k),...events.map(k=>'event.'+k),'initial_locks','final_locks','parameter_changes','display','cycle_states','field_sources'];
    const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
    return '\uFEFF'+[columns,...records.map(r=>[r.roundNumber,r.modelRevision,r.replayOf,JSON.stringify(r.initialSources??null),r.id,r.startedAt,r.endedAt,r.reason,reasonLabel(r.reason),r.scene,r.seed,r.simulatedMCS,(r.runningMs/1000).toFixed(3),r.worldWidth,r.worldHeight,r.refinement,r.boundary,...states.map(k=>r.population[k]||0),...params.map(k=>r.initialSettings[k]),...params.map(k=>r.finalSettings[k]),...events.map(k=>r.counters[k]||0),JSON.stringify(r.initialLocks),JSON.stringify(r.finalLocks),JSON.stringify(r.parameterChanges),JSON.stringify(r.display||{}),JSON.stringify(r.cycles||{}),JSON.stringify(r.sources||[])])].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  }
  // Store compact records, not grids or movies. Completed rounds are never
  // truncated to a display buffer; pagination only limits rendered rows.
  function openStore(){
    let tabKey;try{tabKey=sessionStorage.getItem('cell-arena-round-tab');if(!tabKey){tabKey=crypto.randomUUID();sessionStorage.setItem('cell-arena-round-tab',tabKey);}}catch{tabKey='tab-'+Date.now()+'-'+Math.random();}
    const database=new Promise((resolve,reject)=>{const request=indexedDB.open('cell-arena-rounds',1);request.onupgradeneeded=()=>{request.result.createObjectStore('rounds',{keyPath:'id'});request.result.createObjectStore('active');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    async function transaction(action){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction(['rounds','active'],'readwrite');let result;action(tx,value=>result=value);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
    return {
      load:()=>transaction((tx,done)=>{const all=tx.objectStore('rounds').getAll();all.onsuccess=()=>{const active=tx.objectStore('active').get(tabKey);active.onsuccess=()=>{const records=all.result;if(active.result&&!records.some(r=>r.id===active.result.id)){const r={...active.result,reason:'interrupted',endedAt:active.result.lastSeenAt};tx.objectStore('rounds').put(r);records.push(r);}tx.objectStore('active').delete(tabKey);done(records);};};}),
      checkpoint:r=>transaction(tx=>{if(r)tx.objectStore('active').put(r,tabKey);}),
      archive:r=>transaction(tx=>{tx.objectStore('rounds').put(r);tx.objectStore('active').delete(tabKey);})
    };
  }
  globalThis.CellLabRounds={Locks,Journal,randomGeometry,population,csv,reasonLabel,openStore,numbered,replayExperiment};
})();
