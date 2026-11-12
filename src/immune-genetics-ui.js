/* Observer-only summaries: no access to model RNG or mechanics. */
(() => {
  const reasonLabels={'no-contact':['没有实际膜接触','No membrane contact'],'no-receptor':['无识别码','No receptor'],mismatch:['识别码不匹配','Receptor mismatch'],'antigen-loss':['非自身抗原缺失','Non-self antigen absent'],'low-expression':['表达偏低','Low expression'],presentation:['呈递不足／缺失','Presentation limited / lost'],'weak-stimulus':['匹配抗原的有效刺激不足','Insufficient effective matched stimulus'],unprimed:['尚未启动','Not primed'],suppression:['受到抑制','Suppressed'],nutrition:['营养不足','Nutrient limitation'],exhaustion:['耗竭','Exhausted'],checkpoint:['免疫刹车','Checkpoint brake']};
  const english=()=>document.documentElement.lang.startsWith('en'),t=(a,b)=>english()?b:a,percent=x=>Math.round((x||0)*100)+'%';
  const executionLimits=['suppression','nutrition','exhaustion','checkpoint'];
  function assessment(r){
    if(r.reasons.includes('mismatch'))return {symbol:'×',label:t('不匹配','Mismatch'),color:'#8d6354'};
    if(r.reasons.length)return {symbol:'!',label:t('受限','Limited'),color:'#a77720'};
    return r.recognized?{symbol:'✓',label:t('已识别','Recognized'),color:'#357965'}:{symbol:'≈',label:t('接触扫描','Scanning'),color:'#557c98'};
  }
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  function bar(label,value,cls=''){
    const row=node('div','immune-meter '+cls),name=node('span','',label),number=node('b','',percent(value)),track=node('span','immune-track'),fill=node('i');
    fill.style.width=Math.max(0,Math.min(100,(value||0)*100))+'%';track.append(fill);row.append(name,number,track);return row;
  }
  function sequence(code){const el=node('code','immune-sequence');for(const base of code||'')el.append(node('span','base-'+base,base));return el;}
  function profileChip(key,count){
    const style=CellLabDisplay.antigenProfileStyle(key),chip=node('span','antigen-profile-chip'),swatch=node('i');swatch.style.borderColor=style.color;
    chip.title=key.split('|').map(p=>{const [channel,sequence]=p.split(':');return 'C'+(+channel+1)+' '+sequence;}).join(' / ');
    chip.append(swatch,node('span','',style.label+(count===undefined?'':' · '+count)));return chip;
  }
  function legend(s,visible=true){
    const root=document.getElementById('antigen-lineage-legend');if(!root)return;root.hidden=!visible;if(!visible)return;
    const profiles=s.immunity?.visuals?.profiles||[],stamp=JSON.stringify([english(),profiles.map(p=>[p.key,p.count])]);if(root.dataset.stamp===stamp)return;root.dataset.stamp=stamp;root.replaceChildren();
    root.append(node('p','immune-note',t('同一抗原序列与通道保持同色；多抗原肿瘤的外轮廓分段。免疫核弧等分显示可匹配的抗原；仍需呈递、启动与接触才能激活。','The same antigen sequence and channel keep one color; tumors with several antigens have segmented outlines. Equal nuclear arcs show compatible antigens; activation still requires presentation, priming and contact.')));
    if(!profiles.length){root.append(node('p','immune-note',t('尚无非自身抗原谱。癌前或肿瘤产生抗原变异后显示谱系颜色。','No non-self antigen profile yet. Colors appear after antigen variation in precancer or tumor cells.')));return;}
    const row=node('div','antigen-profile-list');for(const p of [...profiles].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key)).slice(0,8))row.append(profileChip(p.key,p.count));root.append(row);
    if(profiles.length>8)root.append(node('p','immune-note',t('另有 '+(profiles.length-8)+' 种抗原谱；追踪细胞查看对应颜色。',(profiles.length-8)+' more profiles; select a cell to inspect its color.')));
  }
  function eventLabel(event='founder'){
    if(english())return event;
    return event.replace(/^founder$/,'创始基因').replace(/^precancer alteration$/,'癌前局部改变').replace(/^malignant transition$/,'恶性转变').replace(/^intervention$/,'实验干预').replace(/^division mutation$/,'分裂突变').replace(/^peptide loss (\d+)/,'P$1 遗传缺失').replace(/^presentation loss (\d+)/,'C$1 遗传失效').replace(/^expression regulation (\d+)/,'P$1 表达调控改变').replace(/^checkpoint regulation$/,'免疫刹车改变').replace(/^surface target (\d+)/,'S$1 表面靶标改变').replace(/^peptide (\d+) /,'P$1 ').replace('>',' → ').replace(/^trait tolerance$/,'耐受性状改变').replace(/^trait proliferation$/,'增殖性状改变').replace(/^trait invasion$/,'侵袭性状改变').replace(/^trait repair$/,'修复性状改变');
  }
  function selection(cell,s){
    const root=document.getElementById('immune-system-inspector'),a=s.immunity,g=cell&&a?.selectedGene?.id===cell.geneClone?a.selectedGene.genes:null;
    root.hidden=!cell||!g;if(root.hidden){root.replaceChildren();return;}
    // This is an observer. It never queries distant pairs or changes model RNG.
    const profileKeys=cell.kind===3?(a.visuals?.immuneMatches[cell.geneClone]||[]):(a.visuals?.cloneProfiles[cell.geneClone]||[]);
    const stamp=JSON.stringify([english(),cell.id,cell.geneClone,cell.expression,cell.primed,cell.primingProgress,cell.antigenMemory,cell.exhaustion,a.contacts,profileKeys]);
    if(root.dataset.stamp===stamp)return;root.dataset.stamp=stamp;
    const openSurface=!!root.querySelector('.immune-surface')?.open;root.replaceChildren();
    const clone=a.clones.find(c=>c.id===cell.geneClone),header=node('div','immune-genotype-head');
    header.append(node('b','',t('抗原—免疫','Antigen & immunity')),node('span','','G'+cell.geneClone+(clone?.parent?' ← G'+clone.parent:' · '+t('独立起源','Founder'))));root.append(header);
    if(clone)root.append(node('p','immune-note',eventLabel(clone.event)+' · '+clone.time+' MCS · '+t('第 ','Generation ')+clone.generation+(english()?'':' 代')));
    if(profileKeys.length){const row=node('div','antigen-profile-list');for(const key of profileKeys)row.append(profileChip(key));root.append(node('p','immune-note',cell.kind===3?t('核轮廓等分显示可匹配的当前抗原；不代表已激活。','Equal nuclear arcs show compatible current antigens, not activation.'):t('每种遗传抗原对应一种颜色；表达变化只改变深浅，序列改变换色，遗传缺失移除该色段。','Each inherited antigen has one color. Expression changes intensity, sequence mutations change color, and genetic loss removes that segment.')),row);}
    else if(cell.kind===3)root.append(node('p','immune-note',t('当前没有可匹配的非自身抗原谱，胞核保持状态配色。','No compatible current non-self profile; the nucleus keeps its state color.')));
    if(cell.kind===3){
      const receptor=node('div','immune-receptor');receptor.append(node('span','',t('稳定识别码','Stable receptor')),sequence(g.receptor?.sequence),node('b','','C'+((g.receptor?.channel??0)+1)));root.append(receptor);
      root.append(node('p','immune-status',cell.primed?t('✓ 已具备响应资格；仍需匹配并实际接触','✓ Response competent; still requires a matching contact'):t('等待抗原特异性启动','Awaiting antigen-specific priming')));
      const meters=node('div','immune-meter-grid');meters.append(bar(t('启动进度','Priming'),cell.primed?1:cell.primingProgress),bar(t('刺激记忆','Memory'),cell.antigenMemory),bar(t('耗竭','Exhaustion'),cell.exhaustion,'brake'));root.append(meters);
    }else{
      const slots=node('div','immune-slots');
      g.peptides.forEach((p,i)=>{
        const self=a.self.includes(p.sequence),amount=cell.expression.peptides[i],shown=amount*cell.expression.presentation[p.channel],slot=node('div','immune-slot'+(!p.present?' lost':self?' self':''));
        const head=node('div','immune-slot-head');head.append(node('b','','P'+(i+1)),node('span','','C'+(p.channel+1)));slot.append(head,sequence(p.sequence));
        slot.append(node('small','immune-slot-status',!p.present?t('遗传缺失','Genetic loss'):self?t('自身参考 · 耐受','Self · tolerated'):amount<.18?t('基因存在 · 低表达','Gene present · low expression'):t('非自身特征','Non-self feature')));
        slot.append(bar(t('表达','Expression'),amount),bar(t('呈递','Presented'),shown,'presentation'));slots.append(slot);
      });root.append(slots);
      const channels=node('div','immune-meter-grid');g.presentation.forEach((p,i)=>{const row=bar('C'+(i+1)+' '+t('通道能力','channel'),cell.expression.presentation[i],'presentation');if(p===0)row.append(node('small','',t('遗传失效','Genetically lost')));channels.append(row);});channels.append(bar(t('免疫刹车','Checkpoint brake'),cell.expression.checkpoint,'brake'));root.append(channels);
      const details=node('details','immune-surface');details.open=openSurface;details.append(node('summary','',t('独立表面靶标 · 预留','Surface targets · reserved')));g.surface.forEach((p,i)=>{const row=node('div','immune-receptor');row.append(node('b','','S'+(i+1)),sequence(p.sequence),node('span','',p.present?percent(p.base):t('遗传缺失','Genetic loss')));details.append(row);});root.append(details);
      root.append(node('p','immune-note',t('轮廓深浅表示当前非自身抗原呈递强度；浅色仍保留遗传身份，不保证足够刺激。','Outline intensity shows current non-self presentation. Dim profiles retain their genetic identity but may provide insufficient stimulus.')));
    }
    const heading=node('h3','',t('实际接触中的识别','Recognition at actual contacts'));root.append(heading);
    const contacts=a.selectedID===cell.id?a.contacts:[];
    if(!contacts.length)root.append(node('p','immune-note',t('当前没有免疫—肿瘤／癌前膜接触；核弧仅表示受体潜力，尚无实际识别刺激。','No current immune–tumor/precancer contact; nuclear arcs indicate receptor potential, not actual stimulation.')));
    for(const r of contacts){
      const card=node('div','immune-contact'),status=assessment(r),head=node('div','immune-contact-head');head.style.color=status.color;
      head.append(node('b','',status.symbol+' '+status.label),node('span','','#'+r.immune+' → #'+r.target));card.append(head);
      const gates=[['抗原','Antigen',['antigen-loss']],['表达','Expr.',['low-expression']],['呈递','Present.',['presentation']],['匹配','Match',['mismatch','weak-stimulus']],['启动','Primed',['unprimed']],['接触','Contact',['no-contact']],['执行','Execute',executionLimits]];
      const pipeline=node('div','immune-pipeline');for(const [zh,en,limits]of gates){const limited=limits.some(k=>r.reasons.includes(k)),pending=zh==='执行'&&!r.recognized;pipeline.append(node('span',limited?'limited':pending?'pending':'',t(zh,en)+(limited?' !':pending?' …':'')));}card.append(pipeline);
      card.append(node('p','immune-contact-detail',t('亲和力 ','Affinity ')+percent(r.score)+' / '+t('门槛 ','threshold ')+percent(a.threshold)+' · '+t('有效接触 ','Effective dwell ')+Math.round(r.dwell)+' MCS'));
      const affinities=node('div','immune-affinities');r.slots.forEach((p,i)=>{const label='P'+(i+1)+' '+percent(p.affinity),tag=node('span',!p.present||p.self?'irrelevant':p.affinity>=a.threshold?'match':'',label);tag.title=p.sequence+' · C'+(p.channel+1)+(p.self?' · '+t('自身耐受','Self-tolerated'):!p.present?' · '+t('遗传缺失','Genetic loss'):'');affinities.append(tag);});card.append(affinities);
      card.append(node('p','immune-note',r.reasons.length?r.reasons.map(k=>reasonLabels[k]?.[english()?1:0]||k).join(' · '):r.recognized?t('已识别，按接触与执行能力递送损伤','Recognized; damage follows contact and execution capacity'):t('匹配成立，正在累积有效刺激','Matching; accumulating effective stimulation')));root.append(card);
    }
  }
  function links(ctx,s,selected,scale,pixelRatio){
    if(s.immunity?.selectedID!==selected)return;
    const byID=new Map(s.cells.map(c=>[c.id,c])),wrap=s.boundary==='wrap';ctx.save();ctx.font='bold '+12*pixelRatio+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=1.5*pixelRatio;
    for(const r of s.immunity.contacts){const a=byID.get(r.immune),b=byID.get(r.target);if(!a||!b)continue;let dx=b.x-a.x,dy=b.y-a.y;if(wrap){dx-=Math.round(dx/s.width)*s.width;dy-=Math.round(dy/s.height)*s.height;}const style=assessment(r);ctx.strokeStyle=style.color;
      for(const ox of wrap?[-s.width,0,s.width]:[0])for(const oy of wrap?[-s.height,0,s.height]:[0]){const ax=(a.x+ox+.5)*scale,ay=(a.y+oy+.5)*scale,bx=ax+dx*scale,by=ay+dy*scale,x=(ax+bx)/2,y=(ay+by)/2;if(x<-15||y<-15||x>s.width*scale+15||y>s.height*scale+15)continue;
        ctx.setLineDash([3*pixelRatio,3*pixelRatio]);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fff7e6';ctx.fillRect(x-8*pixelRatio,y-8*pixelRatio,16*pixelRatio,16*pixelRatio);ctx.strokeRect(x-8*pixelRatio,y-8*pixelRatio,16*pixelRatio,16*pixelRatio);ctx.fillStyle=style.color;ctx.fillText(style.symbol,x,y);
      }
    }ctx.restore();
  }
  function inspect(cell,s){
    const info=s.immunity,clone=info?.clones.find(c=>c.id===cell.geneClone),g=info?.selectedGene?.id===cell.geneClone?info.selectedGene.genes:null;
    if(!clone)return [];
    const out=[t('遗传克隆','Genetic clone')+' G'+clone.id+' ← '+(clone.parent?'G'+clone.parent:t('独立起源','independent founder'))+' · '+clone.time+' MCS',t('最近遗传事件：','Latest genetic event: ')+clone.event];
    if(!g)return out;
    if(cell.kind===3){
      out.push(t('识别码：','Receptor: ')+(g.receptor?.sequence||'—')+' · '+t('通道','channel')+' '+((g.receptor?.channel??0)+1),cell.primed?t('已有响应资格','Response competent'):t('等待后台启动','Awaiting background priming'),t('启动进度 ','Priming progress ')+percent(cell.primingProgress));
      const r=cell.recognition;out.push(t('实际接触评估：','Contact assessment: ')+(r?.target?'#'+r.target:'—')+' · '+t('亲和力 ','affinity ')+percent(r?.score),t('当前限制：','Current limits: ')+(r?.reasons?.length?r.reasons.map(k=>reasonLabels[k]?.[english()?1:0]||k).join(' / '):t('无已检出的限制','No detected limit')));
    }else{
      g.peptides.forEach((p,i)=>out.push('P'+(i+1)+' '+p.sequence+' · '+t('通道','channel')+' '+(p.channel+1)+' · '+(!p.present?t('遗传缺失','Genetic loss'):t('表达 ','Expression ')+percent(cell.expression.peptides[i])+(cell.expression.peptides[i]<.08?t('（暂时低表达）',' (low expression)'):''))));
      out.push(t('呈递通道：','Presentation: ')+g.presentation.map((v,i)=>'C'+(i+1)+' '+(v===0?t('遗传缺失','Genetic loss'):percent(cell.expression.presentation[i]))).join(' / '),t('免疫刹车：','Checkpoint brake: ')+percent(cell.expression.checkpoint));
      out.push(t('独立表面靶标：','Independent surface targets: ')+g.surface.map((p,i)=>'S'+(i+1)+' '+p.sequence+' '+(p.present?percent(p.base):t('缺失','absent'))).join(' / '));
      out.push(t('外轮廓颜色表示遗传抗原谱，深浅表示当前呈递；同色免疫核弧表示受体匹配潜力，不保证激活。','Outline color marks the inherited antigen profile and intensity marks presentation; matching nuclear arcs show receptor potential, not guaranteed activation.'));
    }
    return out;
  }
  function stats(s){
    const el=document.getElementById('genetics-summary'),canvas=document.getElementById('clone-history');if(!el||!s.immunity)return;
    const a=s.immunity,type=Number(document.getElementById('clone-history-type').value),living=s.cells.filter(c=>!c.dying&&c.kind===type),counts=new Map();for(const c of living)counts.set(c.geneClone,(counts.get(c.geneClone)||0)+1);
    const scores=new Map();for(const r of a.history)for(const [id,n]of Object.entries(r.counts))if(+id>0&&r.states[id]===type)scores.set(+id,Math.max(scores.get(+id)||0,n));
    const ids=[...scores].sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]),colors=['#785d3c','#587b80','#9b7956','#ad6373'];
    const root=document.getElementById('clone-legend');root.replaceChildren();ids.forEach((id,i)=>{const span=document.createElement('span');span.style.color=colors[i];span.textContent='G'+id+' '+(counts.get(id)||0)+' ('+percent((counts.get(id)||0)/Math.max(1,living.length))+')';root.append(span);});
    const encounters=a.encounters,matched=encounters.filter(e=>e.matched).length,stimulated=encounters.filter(e=>e.stimulated).length;
    el.textContent=t('抗原变体 / 当前呈递 / 活跃识别码：','Antigen variants / presented / living receptors: ')+a.coverage.variants+' / '+a.coverage.presented+' / '+a.coverage.receptors+'\n'+t('近期实际相遇组合：','Recent encountered pairs: ')+encounters.length+' · '+t('匹配 ','matched ')+matched+' · '+t('有效刺激 ','stimulated ')+stimulated+'\n'+t('有限候选谱：','Finite candidate repertoire: ')+a.repertoire.length+' · '+t('已完成启动 ','primed ')+a.metrics.primed+' · '+t('血管应答增援 ','vascular responders ')+a.metrics.reinforcements+'\n'+t('分裂遗传事件 ','Division genetic events ')+a.metrics.geneticChanges+' · '+t('替换 ','substitutions ')+a.metrics.substitutions+' · '+t('功能丢失 ','losses ')+a.metrics.losses;
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,left=28,right=w-8,top=8,bottom=h-19;
    ctx.clearRect(0,0,w,h);ctx.font='10px monospace';ctx.fillStyle='#6f624d';ctx.strokeStyle='#c8b999';ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();ctx.fillText('100%',0,top+5);ctx.fillText('0',12,bottom);ctx.fillText('0 MCS',left,h-3);ctx.textAlign='right';ctx.fillText(s.time+' MCS',right,h-3);ctx.textAlign='left';
    for(let k=0;k<ids.length;k++){ctx.strokeStyle=colors[k];ctx.lineWidth=1.6;ctx.beginPath();a.history.forEach((r,i)=>{let total=0;for(const [id,n]of Object.entries(r.counts))if(r.states[id]===type)total+=n;const x=left+(right-left)*r.time/Math.max(1,s.time),y=bottom-(bottom-top)*(r.counts[ids[k]]||0)/Math.max(1,total);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();}
  }
  globalThis.CellLabImmuneUI={inspect,stats,selection,links,assessment,legend};
})();
