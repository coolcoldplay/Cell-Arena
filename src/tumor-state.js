// Descriptive states for sampled simulation history. No model parameters or RNG are touched.
(() => {
  const names={
    absent:['未见存活肿瘤','No live tumor'],precancer:['癌前阶段','Precancerous population'],
    clearing:['肿瘤清除中','Tumor clearance underway'],undetected:['消退后未检出','Undetected after decline'],
    onset:['新近发生癌变','Recent malignant transition'],detected:['首次检出肿瘤','Tumor first detected'],
    redetected:['肿瘤再次检出','Tumor redetected'],rebound:['消退后再增长','Regrowth after decline'],
    growing:['肿瘤扩增','Tumor expanding'],declining:['肿瘤消退','Tumor declining'],
    fluctuating:['肿瘤数量波动','Tumor fluctuating'],stable:['肿瘤数量平稳','Stable tumor burden'],
    dormant:['休眠样状态','Dormancy-like state'],turnover:['动态平衡样','Turnover with stable burden'],
    observing:['积累观察中','Gathering observations'],scant:['近期采样不足','Sparse recent history'],
    immuneAbsent:['局部未见免疫细胞','No local immune cells'],immuneActive:['有免疫清除事件','Immune clearances recorded'],
    exhausted:['持续免疫耗竭信号','Persistent exhaustion signal'],suppressed:['抑制样免疫群体','Suppressive immune population'],
    escapeHint:['逃逸线索：低呈递群扩张','Escape clue: low-presentation cells expanding'],
    distal:['原灶外扩增','Distal growth in this field'],focalExhaustion:['部分免疫细胞持续耗竭','Persistent exhaustion in a subset'],
    export:['出现肿瘤入血','Tumor bloodstream entry'],manual:['近期有手动移除','Recent manual removal']
  };
  const live=r=>Math.max(0,r.tumor-(r.tumorDying||0));
  const immunity=r=>Math.max(0,r.immune-(r.immuneDying||0));
  const divisions=r=>r.divisions-r.normalDivisions-r.endothelialDivisions-r.immuneDivisions;
  function assess(rows){
    const last=rows.at(-1);
    if(!last)return {phase:'observing',signals:[],recent:[],delta:0};
    // Same-tick edits describe one instant. Use its final observation.
    const recent=[];
    for(let i=rows.length-1;i>=0&&rows[i].time>=last.time-180;i--){
      if(rows[i].time!==recent.at(-1)?.time)recent.push(rows[i]);
    }
    recent.reverse();
    const first=recent[0],n=live(last),counts=recent.map(live),delta=n-counts[0];
    const span=last.time-first.time,limit=Math.max(2,Math.ceil(.15*counts[0]));
    const dense=recent.length>=4&&span>=90&&recent.every((r,i)=>!i||r.time-recent[i-1].time<=60);
    let priorPeak=0,episodePeak=0,zeroAfterTumor=false,firstPositive=null,priorZero=null,redetected=false;
    for(let i=0;i<rows.length;i++){
      const r=rows[i];if(rows[i+1]?.time===r.time)continue;
      const v=live(r);
      if(!v){if(priorPeak)zeroAfterTumor=true;episodePeak=0;firstPositive=null;priorZero=r;}
      else{if(!firstPositive){firstPositive=r;redetected=zeroAfterTumor;}if(r.time<=first.time)episodePeak=Math.max(episodePeak,v);}
      priorPeak=Math.max(priorPeak,v);
    }
    const signals=[];
    if(n&&!immunity(last))signals.push('immuneAbsent');
    if(last.kills>first.kills)signals.push('immuneActive');
    if(last.distalTumorDivisions>first.distalTumorDivisions)signals.push('distal');
    if(last.intravasations>first.intravasations)signals.push('export');
    if(last.manualRemoved>first.manualRemoved)signals.push('manual');
    if(dense){
      if(recent.every(r=>r.immuneExhausted>=2&&r.immuneExhausted>=immunity(r)/2))signals.push('exhausted');
      else if(recent.every(r=>r.immuneExhausted>=1))signals.push('focalExhaustion');
      if(recent.every(r=>r.immuneSuppressive>=2&&r.immuneSuppressive>=immunity(r)/2))signals.push('suppressed');
      if(n>0&&counts[0]>0&&recent.every(r=>immunity(r)>0)&&last.recognitions>first.recognitions&&
        last.tumorNegative>=first.tumorNegative+2&&last.tumorNegative/n>=first.tumorNegative/counts[0]+.15)signals.push('escapeHint');
    }
    const range=Math.max(...counts)-Math.min(...counts);
    let phase;
    if(!n)phase=last.tumorDying?'clearing':priorPeak?'undetected':last.abnormal>(last.abnormalDying||0)?'precancer':'absent';
    else if(priorZero&&firstPositive&&last.time-firstPositive.time<=90&&firstPositive.time-priorZero.time<=60){
      phase=redetected?'redetected':firstPositive.malignantTransitions>priorZero.malignantTransitions?'onset':'detected';
    }else if(!dense)phase=last.time-rows[0].time<90?'observing':'scant';
    else if(delta>=limit)phase=episodePeak>=counts[0]*2&&counts[0]>0?'rebound':'growing';
    else if(delta<=-limit)phase='declining';
    else if(range>=limit)phase='fluctuating';
    else if(divisions(last)-divisions(first)>Math.max(0,delta))phase='turnover';
    else if(recent.every(r=>live(r)>0&&r.tumorG0>=.8*live(r))&&divisions(last)===divisions(first))phase='dormant';
    else phase='stable';
    return {phase,signals,recent,delta};
  }
  globalThis.CellLabTumorState={assess,names,live};
})();
