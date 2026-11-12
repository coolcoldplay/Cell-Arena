/* Functional immune-genetics model. ATCG codes are abstract epitopes, not DNA.
 * Rates, channels and affinity weights are game parameters; see IMMUNE-GENETICS.md.
 * No geometry, motility or target search is implemented in this module. */
(() => {
  'use strict';
  const bases='ATCG',clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const compatibility=[[1,.15,.45,.25],[.15,1,.25,.45],[.45,.25,1,.15],[.25,.45,.15,1]];
  const threshold=.78;
  // Regulatory/trait fragments encode bounded scalars, not antigen affinity.
  // Each fragment is independent; an edit never re-hashes the whole genome.
  const code=(value,lo=0,hi=1)=>Math.round(clamp((value-lo)/(hi-lo))*255).toString(4).padStart(4,'0').replace(/[0-3]/g,x=>bases[+x]);
  const freeze=o=>{for(const v of Object.values(o))if(v&&typeof v==='object'&&!Object.isFrozen(v))freeze(v);return Object.freeze(o);};
  function affinity(a,b){
    if(a.length!==b.length)return 0;
    let sum=0,total=0;for(let i=0;i<a.length;i++){const w=i===0?3:i===1?2:1;sum+=w*compatibility[bases.indexOf(a[i])][bases.indexOf(b[i])];total+=w;}return sum/total;
  }
  class System {
    constructor(s){
      this.s=s;this.length=[4,6,8].includes(s.settings.antigenLength)?s.settings.antigenLength:6;
      // Same seeded MT19937 implementation as CPM, on an explicit substream so
      // adding epitopes does not redraw maze geometry or consume motility RNG.
      this.rng=new s.C.mt.constructor((s.seedValue^0x49b72d15)>>>0);
      this.clones=new Map();this.unarchived=new Set();this.serial=0;this.immuneSerial=0;this.cache=new Map();this.cacheLimit=8192;this.history=[];this.exposures=[];this.queue=[];this.encounters=new Map();
      this.metrics={geneticChanges:0,substitutions:0,losses:0,primed:0,reinforcements:0,exposureRecords:0,cacheMisses:0};
      this.self=Array.from({length:4},()=>this.sequence());
      // A finite repertoire is generated BEFORE targets. No encountered target
      // can overwrite a receptor, and self-reactive candidates are rejected.
      this.repertoire=[];
      for(let n=0;n<32;n++){
        let code=null;for(let attempt=0;attempt<128;attempt++){const candidate=n<12?this.substitute(this.self[n%4],0):this.sequence();if(this.self.every(x=>affinity(candidate,x)<threshold)){code=candidate;break;}}
        if(code)this.repertoire.push({id:n+1,sequence:code,channel:n%2,progress:0,readyAt:null,next:0});
      }
      this.families=this.repertoire.slice(0,4).map(r=>r.sequence);
    }
    random(){return this.rng.random();}
    sequence(){return Array.from({length:this.length},()=>bases[Math.floor(this.random()*4)]).join('');}
    substitute(seq,pos=Math.floor(this.random()*seq.length)){const i=bases.indexOf(seq[pos]),b=bases[(i+1+Math.floor(this.random()*3))%4];return seq.slice(0,pos)+b+seq.slice(pos+1);}
    score(receptor,peptide){
      const key=receptor.channel+':'+receptor.sequence+':'+peptide.channel+':'+peptide.sequence;
      if(this.cache.has(key))return this.cache.get(key);
      const value=receptor.channel===peptide.channel?affinity(receptor.sequence,peptide.sequence):0;
      if(this.cache.size>=this.cacheLimit)this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key,value);this.metrics.cacheMisses++;return value;
    }
    create(genes,parent=0,event='founder',generation=0){
      genes.traits.repair??=1;
      genes.fragments={expression:genes.peptides.map(p=>({base:code(p.base),stress:code(p.stress,-3,3),inflammation:code(p.inflammation,-3,3)})),presentation:genes.presentation.map(v=>code(v)),brake:{base:code(genes.brake.base),response:code(genes.brake.response,0,3)},traits:Object.fromEntries(['tolerance','proliferation','invasion','repair'].map(k=>[k,code(genes.traits[k],.25,3)]))};
      const id=++this.serial;this.clones.set(id,{id,parent,time:this.s.C.time,generation,event,genes:freeze(genes)});this.unarchived.add(id);return id;
    }
    genes(m){return this.clones.get(m.geneClone)?.genes;}
    bind(m,id,expression=null){
      m.geneClone=id;const g=this.genes(m);m.repairTrait=g.traits.repair;
      if(m.kind===2)m.genome=g.traits;
      if(m.kind===1)m.normalTolerance=g.traits.tolerance;
      m.expression=expression?{peptides:[...expression.peptides],presentation:[...expression.presentation],checkpoint:expression.checkpoint}:{peptides:g.peptides.map(p=>p.present?p.base:0),presentation:[...g.presentation],checkpoint:g.brake.base};
      for(let i=0;i<4;i++)if(!g.peptides[i].present)m.expression.peptides[i]=0;
      for(let i=0;i<2;i++)if(!g.presentation[i])m.expression.presentation[i]=0;
      m.primed??=false;m.primingProgress??=0;m.recognition={target:0,score:0,stimulus:0,execution:0,reasons:['no-contact']};
      this.summarize(m);
    }
    register(m){
      if(this.s.divisionParent){m.primed=this.s.divisionParent.primed;this.bind(m,this.s.divisionParent.geneClone,this.s.divisionParent.expression);return;}
      const tumor=m.kind===2,immune=m.kind===3,positive=tumor&&m.antigenRoll<this.s.settings.antigen/100;
      const peptides=Array.from({length:4},(_,i)=>({sequence:tumor&&i<3?(i<2?this.families[(i+Math.floor(m.antigenRoll*4))%Math.max(1,this.families.length)]||this.sequence():this.sequence()):this.self[i],present:true,base:tumor?(positive?.85:.09):.7,stress:(this.random()-.5)*1.6,inflammation:(this.random()-.5)*1.2,channel:tumor&&i<2?(i+Math.floor(m.antigenRoll*4))%2:i%2}));
      let receptor=null,candidate=0;
      if(immune){
        const cover=this.s.scene==='hot'?.85:this.s.scene==='cold'?.15:.5,preferred=this.random()<cover?this.repertoire.slice(0,12):this.repertoire.slice(12),pool=preferred.length?preferred:this.repertoire;
        // A hot lesion begins with a broader pre-existing response repertoire.
        // These candidates predate the targets; no contact reprograms a code.
        const index=this.immuneSerial++,r=this.s.scene==='hot'&&index<8?this.repertoire[index%4]:pool[Math.floor(this.random()*pool.length)];if(r){receptor={sequence:r.sequence,channel:r.channel};candidate=r.id;}
        m.primed=this.random()<this.s.settings.initialImmuneReady/100;
      }
      const genes={peptides,presentation:[1,1],brake:{base:tumor?.12:.04,response:.65},surface:[{sequence:this.self[0],present:true,base:.6},{sequence:this.self[1],present:true,base:tumor?.7:.2}],traits:{tolerance:1,proliferation:1,invasion:1,antigen:positive?.85:.09,...m.genome},receptor,candidate};
      this.bind(m,this.create(genes));
    }
    summarize(m){
      const g=this.genes(m);if(!g)return;
      let level=0;for(let i=0;i<4;i++)if(g.peptides[i].present&&!this.self.includes(g.peptides[i].sequence))level=Math.max(level,m.expression.peptides[i]*m.expression.presentation[g.peptides[i].channel]);
      const before=m.antigen;m.antigenLevel=level;m.antigen=(m.kind===2||m.state==='abnormal')&&level>=.18;
      if(before&&!m.antigen)this.s.releaseAntigenTarget(m);
    }
    express(m,dt){
      const g=this.genes(m);if(!g||m.kind===3)return;
      const k=-Math.expm1(-dt/180),pressure=clamp(m.mutationPressure||0),inflammation=clamp(m.inflammatoryExposure||0);
      for(let i=0;i<4;i++){
        const p=g.peptides[i],target=p.present?clamp(p.base*(1+p.stress*pressure*this.s.settings.antigenStressGain+p.inflammation*inflammation)):0;
        m.expression.peptides[i]+=k*(target-m.expression.peptides[i]);if(!p.present)m.expression.peptides[i]=0;
      }
      // Reversible regulation, separate from heritable channel loss. Historical
      // 'escape' sliders now regulate expression only, not directed mutations.
      const down=clamp(1-.5*this.s.settings.contactEscape*(m.immuneContactMemory||0)-.5*this.s.settings.signalEscape*(m.recruitmentExposure||0),.05,1);
      for(let c=0;c<2;c++)m.expression.presentation[c]+=k*(g.presentation[c]*down-m.expression.presentation[c]);
      m.expression.checkpoint+=k*(clamp(g.brake.base+g.brake.response*inflammation)-m.expression.checkpoint);
      this.summarize(m);
    }
    evaluate(ctl,target,contact=true,cache=true){
      const cg=this.genes(ctl),g=this.genes(target),reasons=[];
      if(!g||!cg?.receptor)return {target:target?.id||0,score:0,stimulus:0,execution:0,reasons:['no-receptor']};
      let present=false,expressed=false,presented=false,best=0,drive=0;
      for(let i=0;i<4;i++){
        const p=g.peptides[i];if(!p.present||this.self.includes(p.sequence))continue;present=true;
        const e=target.expression.peptides[i],channel=target.expression.presentation[p.channel],a=cache?this.score(cg.receptor,p):cg.receptor.channel===p.channel?affinity(cg.receptor.sequence,p.sequence):0;
        expressed||=e>=.18;presented||=e*channel>=.18;best=Math.max(best,a);
        if(a>=threshold)drive=Math.max(drive,e*channel*clamp((a-threshold)/(.94-threshold)));
      }
      if(!present)reasons.push('antigen-loss');if(present&&!expressed)reasons.push('low-expression');if(expressed&&!presented)reasons.push('presentation');if(best<threshold)reasons.push('mismatch');
      if(presented&&best>=threshold&&drive<.18)reasons.push('weak-stimulus');
      if(!contact)reasons.push('no-contact');if(!ctl.primed)reasons.push('unprimed');
      const inhibition=ctl.inhibition||0,brake=clamp(target.expression.checkpoint*this.s.settings.checkpointStrength),competence=ctl.fitness*(1-.8*ctl.exhaustion)/(1+this.s.settings.suppressionStrength*inhibition)*(1-brake);
      if(ctl.immunePhenotype==='suppressive'||ctl.immuneRefractory>0||inhibition>.2)reasons.push('suppression');
      if(ctl.fitness<.4)reasons.push('nutrition');if(ctl.exhaustion>.5)reasons.push('exhaustion');if(brake>.25)reasons.push('checkpoint');
      const permitted=contact&&ctl.primed&&ctl.immunePhenotype!=='suppressive'&&ctl.immuneRefractory<=0;
      return {target:target.id,score:best,stimulus:permitted&&drive>=.18?drive*ctl.fitness:0,execution:permitted&&drive>=.18?drive*competence:0,reasons};
    }
    alter(m,edit,event='intervention'){
      const parent=m.geneClone,original=this.genes(m),g=structuredClone(original);edit(g);
      // A lost slot hit again, a clamped scalar, or a zero-amplitude edit is not
      // a new genetic branch. Neutral SEQUENCE substitutions still are.
      if(JSON.stringify(g)===JSON.stringify(original))return parent;
      const id=this.create(g,parent,event,m.generation);this.bind(m,id,m.expression);this.express(m,0);return id;
    }
    abnormal(m){
      this.alter(m,g=>{if(this.random()<.6){const i=Math.floor(this.random()*4);g.peptides[i].sequence=this.substitute(g.peptides[i].sequence);}},'precancer alteration');
    }
    malignant(m){const traits={...m.genome};this.alter(m,g=>{g.traits={...g.traits,...traits};},'malignant transition');}
    inherit(c,parentId,parentExpression){
      this.bind(c,parentId,parentExpression);
      if(c.kind===3)return; // Stable receptor; no antigen-driven retargeting.
      const s=this.s.settings,pressure=c.mutationPressure||0,dna=c.resources?.dnaDamage||0,repair=Math.max(.25,s.dnaRepair*(c.repairTrait||1)*(c.isStem?s.stemRepair:1));
      // ONE mutation opportunity per daughter, independent of sequence length.
      const chance=clamp(s.mutation/100*(1+(c.kind===1?s.normalMutationGain:s.tumorMutationGain)*pressure)*(1+2*dna)/(1+.25*repair));
      if(this.random()>=chance)return;
      const category=this.random(),i=Math.floor(this.random()*4),previous=c.geneClone;let event;
      this.alter(c,g=>{
        if(category<.5){const p=g.peptides[i],before=p.sequence;p.sequence=this.substitute(before);event='peptide '+(i+1)+' '+before+'>'+p.sequence;}
        else if(category<.55){g.peptides[i].present=false;event='peptide loss '+(i+1);}
        else if(category<.60){g.presentation[i%2]=0;event='presentation loss '+(i%2+1);}
        else if(category<.72){g.peptides[i].base=clamp(g.peptides[i].base+(this.random()-.5)*2*s.mutationSize);event='expression regulation '+(i+1);}
        else if(category<.79){g.brake.base=clamp(g.brake.base+(this.random()-.5)*2*s.mutationSize);event='checkpoint regulation';}
        else if(category<.84){g.surface[i%2].sequence=this.substitute(g.surface[i%2].sequence);event='surface target '+(i%2+1);}
        else{const key=['tolerance','proliferation','invasion','repair'][i];g.traits[key]=clamp(g.traits[key]*Math.exp(this.s.mutationStep(key,c)),.25,3);event='trait '+key;}
      },'division mutation');
      if(c.geneClone===previous)return;
      if(category<.5)this.metrics.substitutions++;else if(category<.6)this.metrics.losses++;
      this.clones.get(c.geneClone).event=event;this.metrics.geneticChanges++;this.s.counters.mutations++;
    }
    expose(m,amount=1){
      if(m.kind!==2&&m.state!=='abnormal')return;
      if(amount<1&&this.s.C.time-(m.lastExposureAt??-Infinity)<120)return;m.lastExposureAt=this.s.C.time;
      const g=this.genes(m),danger=this.s.fieldOnCell(m,'danger'),inhibition=this.s.fieldOnCell(m,'inhibition');
      for(let i=0;i<4;i++)if(g.peptides[i].present&&m.expression.peptides[i]>.08&&!this.self.includes(g.peptides[i].sequence)){
        this.exposures.push({clone:m.geneClone,birth:m.birth,slot:i,sequence:g.peptides[i].sequence,channel:g.peptides[i].channel,time:this.s.C.time,strength:amount*m.expression.peptides[i]*(.35+danger/(.2+danger))/(1+inhibition)});this.metrics.exposureRecords++;
      }
      if(this.exposures.length>128)this.exposures.splice(0,this.exposures.length-128);
    }
    tick(dt){
      const now=this.s.C.time,health=this.s.normalSupportReport().retained,rate=this.s.settings.primingRate;
      const responders=new Map();for(const m of this.s.live())if(m.kind===3&&!m.dying){const id=this.genes(m).candidate,list=responders.get(id)||[];list.push(m);responders.set(id,list);}
      this.exposures=this.exposures.filter(e=>now-e.time<2400);
      for(const r of this.repertoire){
        let signal=0;for(const e of this.exposures){const a=this.score(r,e);if(a>=threshold)signal=Math.max(signal,e.strength*Math.exp(-(now-e.time)/1000)*a);}
        r.progress=clamp(r.progress+dt*rate*signal*(.2+.8*health)/450-dt*.00004);
        if(r.progress>=1&&r.readyAt===null){r.readyAt=now;this.metrics.primed++;}
        if(r.readyAt!==null&&now-r.readyAt>=160&&signal>.03){
          for(const m of responders.get(r.id)||[]){m.primed=true;m.primingProgress=1;if(!m.primingBoosted){m.antigenMemory=Math.max(m.antigenMemory,.45);m.primingBoosted=true;}}
          if(rate>0&&now>=r.next&&this.queue.length<8&&this.random()<Math.min(1,health*rate*.15)){this.queue.push(r.id);r.next=now+1200;}
        }
        for(const m of responders.get(r.id)||[])m.primingProgress=r.progress;
      }
    }
    arrival(m){
      if(!this.queue.length)return;
      const r=this.repertoire.find(r=>r.id===this.queue.shift());if(!r)return;
      // A new cell arriving THROUGH a vessel receives a pre-existing receptor.
      this.alter(m,g=>{g.receptor={sequence:r.sequence,channel:r.channel};g.candidate=r.id;},'primed vascular reinforcement');m.primed=true;m.antigenMemory=.45;this.metrics.reinforcements++;
    }
    record(){
      const counts={},states={};for(const m of this.s.live())if(!m.dying&&(m.kind===2||m.state==='abnormal'||m.kind===3)){counts[m.geneClone]=(counts[m.geneClone]||0)+1;states[m.geneClone]=m.kind;}
      const row={time:this.s.C.time,counts,states};if(this.history.at(-1)?.time===row.time)this.history[this.history.length-1]=row;else this.history.push(row);
      this.historyView=null;
      // Time-bin compression retains the entire time span; no simulation state
      // or mutation sampling depends on this bounded observer history.
      if(this.history.length>512)this.history=this.history.filter((_,i)=>i%2===0||i===this.history.length-1);
      const alive=new Set(this.s.live().map(m=>m.geneClone));for(const id of this.unarchived)if(!alive.has(id)){const c=this.clones.get(id);c.archivedGenes=JSON.stringify(c.genes);c.genes=null;this.unarchived.delete(id);}
    }
    compactHistory(){
      if(this.historyView)return this.historyView;
      const peaks=new Map(),kinds=new Map();for(const r of this.history)for(const [id,n]of Object.entries(r.counts)){peaks.set(id,Math.max(peaks.get(id)||0,n));kinds.set(id,r.states[id]);}
      const keep=new Set();for(const kind of [1,2,3])for(const [id]of [...peaks].filter(([id])=>kinds.get(id)===kind).sort((a,b)=>b[1]-a[1]).slice(0,8))keep.add(id);
      // UI snapshots retain major clones plus an 'other' total per kind. Full
      // analytic export retains all recorded clones; this never changes biology.
      return this.historyView=this.history.map(r=>{const counts={},states={};for(const [id,n]of Object.entries(r.counts)){const kind=r.states[id],key=keep.has(id)?id:-kind;counts[key]=(counts[key]||0)+n;states[key]=kind;}return {time:r.time,counts,states};});
    }
    contactReport(selected){
      if(!selected||selected.dying)return [];
      const result=[];
      for(const edge of this.s.contacts.get(selected.id)?.values()||[]){
        const other=this.s.cells[edge.id];if(!other||other.dying||edge.length<1)continue;
        const ctl=selected.kind===3?selected:other,target=selected.kind===3?other:selected;
        if(ctl.kind!==3||!(target.kind===2||target.state==='abnormal'))continue;
        const receptor=this.genes(ctl).receptor,g=this.genes(target),r=this.evaluate(ctl,target,true,false),h=this.s.histories.get(ctl.id+':'+target.id);
        result.push({...r,immune:ctl.id,immuneClone:ctl.geneClone,targetClone:target.geneClone,receptor,primed:ctl.primed,contactLength:edge.length/this.s.scale,dwell:h?.dwell||0,recognized:!!h?.recognized&&r.stimulus>0,slots:g.peptides.map((p,i)=>({sequence:p.sequence,channel:p.channel,present:p.present,self:this.self.includes(p.sequence),expression:target.expression.peptides[i],presentation:target.expression.presentation[p.channel],affinity:receptor&&receptor.channel===p.channel?affinity(receptor.sequence,p.sequence):0}))});
      }return result;
    }
    visualReport(){
      // Observer-only genotype groups. Expression, cell IDs and non-antigen
      // mutations never recolor a profile; no receptor or model RNG is changed.
      const live=this.s.live().filter(m=>!m.dying),profiles=new Map(),cloneProfiles={},immuneMatches={},presentation={};
      for(const m of live)if(m.kind===2||m.state==='abnormal'){
        const peptides=[...new Map(this.genes(m).peptides.filter(p=>p.present&&!this.self.includes(p.sequence)).map(p=>[p.channel+':'+p.sequence,{channel:p.channel,sequence:p.sequence}])).values()].sort((a,b)=>a.channel-b.channel||a.sequence.localeCompare(b.sequence));
        if(!peptides.length)continue;
        const levels=presentation[m.id]={};this.genes(m).peptides.forEach((p,i)=>{if(p.present&&!this.self.includes(p.sequence)){const key=p.channel+':'+p.sequence;levels[key]=Math.max(levels[key]||0,m.expression.peptides[i]*m.expression.presentation[p.channel]);}});
        cloneProfiles[m.geneClone]=peptides.map(p=>p.channel+':'+p.sequence);
        for(const peptide of peptides){const key=peptide.channel+':'+peptide.sequence;let profile=profiles.get(key);if(!profile){profile={key,peptides:[peptide],count:0,clones:[]};profiles.set(key,profile);}profile.count++;if(!profile.clones.includes(m.geneClone))profile.clones.push(m.geneClone);}
      }
      const receptors=new Map();
      for(const m of live)if(m.kind===3&&!Object.hasOwn(immuneMatches,m.geneClone)){
        const r=this.genes(m).receptor,key=r?r.channel+':'+r.sequence:'';
        if(!receptors.has(key))receptors.set(key,r?[...profiles.values()].filter(p=>p.peptides.some(p=>r.channel===p.channel&&affinity(r.sequence,p.sequence)>=threshold)).map(p=>p.key).sort():[]);
        immuneMatches[m.geneClone]=receptors.get(key);
      }
      return {profiles:[...profiles.values()].sort((a,b)=>a.key.localeCompare(b.key)),cloneProfiles,immuneMatches,presentation};
    }
    report(full=false){
      const counts={};for(const m of this.s.live())if(!m.dying)counts[m.geneClone]=(counts[m.geneClone]||0)+1;
      const selected=this.s.cells[this.s.observation?.rootID],selectedGene=selected?{id:selected.geneClone,genes:this.genes(selected)}:null;
      const visible=full?null:new Set(this.s.live().filter(m=>m.kind===2||m.kind===3||m.state==='abnormal'||m===selected).map(m=>m.geneClone));
      const clones=Object.keys(counts).filter(id=>!visible||visible.has(+id)).map(id=>{const {genes,...c}=this.clones.get(+id);return {...c,live:counts[id],...(full?{genes}:{})};});
      const variants=new Set(),presented=new Set(),receptors=new Set();let primedCells=0;
      for(const m of this.s.live())if(!m.dying){const g=this.genes(m);if(m.kind===3){if(g.receptor)receptors.add(g.receptor.channel+':'+g.receptor.sequence);primedCells+=Number(m.primed);}else if(m.kind===2||m.state==='abnormal')g.peptides.forEach((p,i)=>{if(p.present&&!this.self.includes(p.sequence)){const k=p.channel+':'+p.sequence;variants.add(k);if(m.expression.peptides[i]*m.expression.presentation[p.channel]>=.18)presented.add(k);}});}
      return {length:this.length,threshold,self:this.self,clones,selectedGene,visuals:this.visualReport(),contacts:this.contactReport(selected),selectedID:selected?.id||0,history:full?this.history:this.compactHistory(),coverage:{variants:variants.size,presented:presented.size,receptors:receptors.size,primedCells},metrics:{...this.metrics,cacheEntries:this.cache.size},repertoire:this.repertoire.map(r=>({...r})),queue:this.queue.length,exposures:this.exposures.slice(-16),encounters:[...this.encounters.values()].slice(-64),...(full?{lineage:[...this.clones.values()].map(({archivedGenes,...c})=>({...c,genes:c.genes||(archivedGenes?JSON.parse(archivedGenes):null)}))}:{})};
    }
    definitions(m){const g=this.genes(m);return {kind:m.kind,x:m.x/this.s.scale,y:m.y/this.s.scale,radius:Math.sqrt(this.s.C.getVolume(m.id)/Math.PI)/this.s.scale,genes:structuredClone(g),primed:m.primed,state:m.state};}
    initialize(definitions){
      const ids=new Map();
      for(const d of definitions){
        const id=this.s.seed(d.kind,d.x*this.s.scale,d.y*this.s.scale,d.radius*this.s.scale);if(!id)throw Error('Initial cell cannot fit at '+d.x+', '+d.y);const m=this.s.cells[id];
        if(d.genes){const g=structuredClone(d.genes);g.candidate=this.repertoire.find(r=>r.sequence===g.receptor?.sequence&&r.channel===g.receptor?.channel)?.id||0;
          let clone=ids.get(d.cloneKey);if(!clone){const parent=ids.get(d.parentKey)||0;clone=this.create(g,parent,parent?'imported descendant variant':'imported founder',parent?(this.clones.get(parent).generation+1):0);if(d.cloneKey)ids.set(d.cloneKey,clone);}
          this.bind(m,clone,d.expression||null);
        }
        if(d.state==='abnormal'){m.state='abnormal';m.name='癌前细胞';}if(d.primed!==undefined)m.primed=d.primed;this.summarize(m);
      }
    }
  }
  globalThis.CellLabImmunity={System,affinity,threshold,bases,freeze};
})();
