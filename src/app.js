(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d',{alpha:false});
  const raster=document.createElement('canvas'),rctx=raster.getContext('2d',{alpha:false});
  const colors=CellLabDisplay.BODY_COLORS;
  let cellColors;try{cellColors=CellLabDisplay.normalizeColors(JSON.parse(localStorage.getItem('cell-arena-colors-v1')));}catch{cellColors=CellLabDisplay.normalizeColors();}
  const signalLayers=new Set(),displayCache=new CellLabDisplay.Cache();
  const opacity={adversity:.35,oxygen:.35,glucose:.35,acid:.35,density:.35,cohesion:.45,danger:.45,trail:.45};
  let hover=null,probeDirty=false;
  // The probe must remain in the fullscreen element's subtree as well.
  canvas.parentElement.append($('field-probe'));
  let gpuRenderer=null,rendererFailure='';try{gpuRenderer=new CellLabRenderer();}catch(e){rendererFailure=String(e);}
  const labels=['培养液','正常细胞','肿瘤细胞','免疫细胞','实体障碍'];
  const titles={ecosystem:'免疫共培养',collective:'群体迁移',invasion:'肿瘤扩张',maze:'通道搜索',stress:'密度与逃逸',surveillance:'异常监视',network:'胶质瘤样分枝成网'};
  const controls=[
    ['chemotaxis','趋化响应',0,3,.1,'局部信号梯度对肿瘤与免疫细胞方向的影响',''],
    ['alignment','正常／肿瘤方向协同',0,3,.1,'接触的同类细胞调整极性；免疫细胞不无条件跟随同类',''],
    ['cohesion','凝聚倾向',0,3,.1,'正常细胞的共吸引与同类黏附',''],
    ['repulsion','常规接触后转向',0,3,.1,'保留原有细胞接触规则；免疫之间另用下方独立分离参数',''],
    ['immuneSeparation','免疫同类分离',0,3,.1,'只影响免疫之间；有局部趋化梯度时减弱，扫描／杀伤靶细胞时不打断接触','×'],
    ['noise','方向随机性',0,2,.05,'调低保持方向，调高加强局部探索',''],
    ['halfLife','信号半衰期',20,400,10,'信号持续多久；墙阻断扩散',' MCS'],
    ['normalMotility','正常细胞运动性',0,1.5,.05,'低运动性、极性与聚集可以同时存在',''],
    ['tumorMotility','肿瘤细胞运动性',0,1.5,.05,'增强前缘活动和侵袭式游走',''],
    ['immuneMotility','免疫细胞运动性',0,1.5,.05,'小体积细胞通过形变和邻居重排穿行',''],
    ['growth','肿瘤生长速度',0,2,.05,'由实际空间、遗传增殖性状、营养和累积压力共同调制',''],
    ['apoptosis','肿瘤自发凋亡强度',0,30,1,'每颗存活肿瘤按模型时间抽样；每 1000 MCS 的风险强度，30% 约对应 26% 发生概率','%'],
    ['antigen','初始抗原阳性比例',0,100,5,'只影响新播种的肿瘤；已有克隆的表达通过遗传与突变改变','%'],
    ['kill','接触杀伤强度',0,2,.1,'只对已识别且仍接触的靶细胞递送损伤',''],
    ['temperature','膜形变波动',2,30,1,'CPM 温度，影响随机复制尝试的接受率',''],
    ['supply','氧糖补给与酸清除',0,3,.05,'培养液储库补给；调低后密集区域更容易恶化',''],
    ['metabolism','消耗与产酸强度',0,2,.05,'按实际细胞占据面积与邻域密度持续计算',''],
    ['escape','恶劣环境逃逸',0,5,.1,'沿局部氧糖上升、酸负荷下降的方向重新极化',''],
    ['recruitment','识别后招募信号',0,3,.1,'实际接触识别异常或肿瘤后分泌；仅被吸引者不自动接力',''],
    ['immuneGrowth','激活后免疫生长',0,1.5,.05,'接触识别后才有自动克隆扩增，受代谢状态限制',''],
    ['immuneDivisions','新免疫细胞分裂预算',0,6,1,'每次分裂，两颗子细胞均扣一次；只影响新播种的细胞',' 次'],
    ['mutation','每项性状突变概率',0,100,1,'肿瘤分裂时分别抽样耐受、增殖、侵袭和抗原表达','%'],
    ['mutationSize','突变幅度',0,.5,.01,'随机双向变异；环境选择存活者，不定向创造突变',''],
    ['stressMutation','正常 → 异常风险倍率',0,20,.1,'持续环境损伤提高随机风险；高倍率压缩演示等待时间，0 关闭新异常发生','×'],
    ['progression','异常 → 肿瘤风险倍率',0,20,.1,'异常至少保留 160 MCS；倍率调整后仍是随机事件，0 保留中间态','×'],
    ['sectionYield','切面让位上限',0,.5,.01,'受邻居推挤时减少可见目标面积，压力解除后逐步恢复；总生物量保留',''],
    ['branchLength','突起延伸范围',1.6,4,.1,'相对胞体等效半径的可达范围；真实长度仍取决于空间和胞质量','×'],
    ['branchStrength','分枝形态保持',0,12,.5,'局部骨架形变偏好，越强越保持分枝；不会越墙或跳过核区约束',''],
    ['branching','侧枝萌生倾向',0,3,.1,'在局部胞体或已有突起上形成新前缘；数量不固定，0 仍保留基础伸展与回缩',''],
    ['networkAdhesion','接触网络稳定性',0,2,.1,'只稳定持续接触的肿瘤对；0 关闭成网黏附，不产生隔空连接','']
  ];
  const modules={
    'mechanics-sliders':['sectionYield','temperature'],
    'branch-sliders':['branchLength','branchStrength','branching','networkAdhesion'],
    'communication-sliders':['chemotaxis','alignment','cohesion','repulsion','immuneSeparation','noise','halfLife','recruitment'],
    'biology-sliders':['normalMotility','tumorMotility','immuneMotility','growth','apoptosis','antigen','kill'],
    'environment-sliders':['supply','metabolism','escape','stressMutation','progression'],
    'lineage-sliders':['immuneGrowth','immuneDivisions','mutation','mutationSize']
  },moduleFor=Object.fromEntries(Object.entries(modules).flatMap(([id,names])=>names.map(name=>[name,id])));
  for(let i=0;i<controls.length;i++){
    const [name,label,min,max,step,hint,suffix]=controls[i],row=document.createElement('label');row.className='slider';
    row.innerHTML=`<span>${label}<output id="${name}-out" for="${name}">—</output></span><input id="${name}" type="range" min="${min}" max="${max}" step="${step}"><small>${hint}</small>`;
    $(moduleFor[name]).append(row);
    $(name).addEventListener('input',e=>{const value=Number(e.target.value);$(name+'-out').textContent=value+suffix;rpc('set',{name,value}).catch(fail);});
  }
  for(const [key,label] of [['environment','环境热图'],['cohesion','细胞凝聚因子'],['danger','损伤因子'],['trail','免疫招募因子']]){
    const row=document.createElement('label');row.className='slider';row.innerHTML=`<span id="opacity-label-${key}">${label}<output id="opacity-${key}-out" for="opacity-${key}"></output></span><input id="opacity-${key}" type="range" min="0" max="100" step="1" value="${(key==='environment'?.35:.45)*100}">`;
    $('opacity-sliders').append(row);
    $('opacity-'+key).addEventListener('input',e=>{const channel=key==='environment'?($('field-view').value==='none'?'adversity':$('field-view').value):key;opacity[channel]=Number(e.target.value)/100;syncOpacity();dirty=true;});
  }
  function syncOpacity(){for(const key of ['environment','cohesion','danger','trail']){const channel=key==='environment'?($('field-view').value==='none'?'adversity':$('field-view').value):key;const value=Math.round(opacity[channel]*100);$('opacity-'+key).value=value;$('opacity-'+key+'-out').textContent=value+'%';}const name=$('field-view').value;$('opacity-label-environment').firstChild.textContent=CellLabDisplay.FIELD_INFO[name]?.label||'环境热图';}
  syncOpacity();
  const blob=new Blob([$('worker-source').textContent],{type:'text/javascript'}),workerURL=URL.createObjectURL(blob),worker=new Worker(workerURL);
  let sequence=0,snapshot=null,selected=0,tool='move',image=null,dirty=false,toastTimer,lastRevision=-1;
  const colorTypes=[['normal','正常细胞'],['abnormal','异常中间态'],['tumor','肿瘤细胞'],['immune','未激活免疫'],['activated','已激活免疫']];
  for(const [id,preset] of Object.entries(CellLabDisplay.COLOR_PRESETS)){
    const button=document.createElement('button');button.type='button';button.className='color-preset';button.dataset.palette=id;button.setAttribute('aria-label','应用'+preset.name+'配色');
    const name=document.createElement('b');name.textContent=preset.name;button.append(name);
    const preview=document.createElement('span');preview.className='palette-preview';preview.setAttribute('aria-hidden','true');
    for(const [key] of colorTypes){const cell=document.createElement('i');cell.style.setProperty('--body',preset.colors[key].body);cell.style.setProperty('--nucleus',preset.colors[key].nucleus);preview.append(cell);}button.append(preview);
    const description=document.createElement('small');description.textContent=preset.description+(id==='slate'?' · 推荐':'');button.append(description);
    button.addEventListener('click',()=>applyColors(preset.colors));$('color-presets').append(button);
  }
  for(const [key,label] of colorTypes){const text=document.createElement('span');text.textContent=label;$('color-controls').append(text);for(const [part,name] of [['body','胞体'],['nucleus','胞核']]){const input=document.createElement('input');input.type='color';input.id='color-'+key+'-'+part;input.setAttribute('aria-label',label+name+'颜色');input.addEventListener('input',()=>applyColors({...cellColors,[key]:{...cellColors[key],[part]:input.value}}));$('color-controls').append(input);}}
  function syncColors(){
    const preset=CellLabDisplay.colorPresetID(cellColors);
    $('palette-status').textContent='当前：'+(CellLabDisplay.COLOR_PRESETS[preset]?.name||(preset==='original'?'原始配色':'自定义配色'));
    for(const button of $('color-presets').children){const active=button.dataset.palette===preset;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',active);}
    for(const [key] of colorTypes)for(const part of ['body','nucleus'])$('color-'+key+'-'+part).value=cellColors[key][part];
    $('proliferation-shading').checked=cellColors.proliferationShading;
    for(const [key,css] of [['normal','normal'],['abnormal','abnormal'],['tumor','tumor'],['immune','immune'],['activated','immune-active']])document.querySelector('.legend .'+css).style.background=cellColors[key].body;
    const ramp=document.querySelector('.proliferation-key'),low=CellLabDisplay.bodyColor({kind:2,genome:{proliferation:.25}},cellColors),high=cellColors.tumor.body;
    ramp.querySelector('i').style.background=`linear-gradient(90deg,rgb(${low.join(',')}),${high})`;
    ramp.lastChild.textContent=cellColors.proliferationShading?'肿瘤：浅 → 深，增殖能力低 → 高':'肿瘤：统一胞体色';
  }
  function applyColors(value){cellColors=CellLabDisplay.normalizeColors(value);try{localStorage.setItem('cell-arena-colors-v1',JSON.stringify(cellColors));}catch{/* Private/storage-disabled contexts still support this session. */}syncColors();dirty=true;}
  $('reset-colors').addEventListener('click',()=>applyColors(null));
  $('proliferation-shading').addEventListener('change',e=>applyColors({...cellColors,proliferationShading:e.target.checked}));syncColors();
  const pending=new Map(),errors=[];
  let resolveReady;const ready=new Promise(r=>resolveReady=r);
  function rpc(command,payload={}){
    return new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('操作超时：'+command));},60000);pending.set(id,{resolve,reject,timeout});worker.postMessage({id,command,payload});});
  }
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2200);}
  function fail(error){const message=String(error?.message||error);errors.push(message);$('run-state').textContent='发生错误';toast(message);}
  worker.onmessage=event=>{
    const m=event.data;
    if(m.type==='snapshot'){
      snapshot=m.data;if(snapshot.revision!==lastRevision){lastRevision=snapshot.revision;selected=0;}
      if(raster.width!==snapshot.width||raster.height!==snapshot.height){raster.width=snapshot.width;raster.height=snapshot.height;image=rctx.createImageData(snapshot.width,snapshot.height);}
      dirty=true;sync();resolveReady();
    }else if(m.type==='response'){
      const p=pending.get(m.id);if(p){clearTimeout(p.timeout);pending.delete(m.id);p.resolve(m.value);}
    }else if(m.type==='error'){
      const p=pending.get(m.id);if(p){clearTimeout(p.timeout);pending.delete(m.id);p.reject(Error(m.message));}else fail(m.message);
    }
  };
  worker.onerror=e=>fail(e.message);
  // Act palette adapted from Artistoo Canvas.drawActivityValues (MIT; Textor & Wortel,
  // 2019). Source revision and full notice: ../THIRD_PARTY_NOTICES.md. Zero is body color.
  const activityPalette=Array.from({length:256},(_,a)=>[Math.min(255,a*2),Math.min(255,(255-a)*2),0]);
  function updateOverlayButtons(){for(const button of document.querySelectorAll('[data-layer]')){const key=button.dataset.layer,on=key==='adversity'?$('field-view').value==='adversity':signalLayers.has(key);button.setAttribute('aria-pressed',on);button.classList.toggle('selected',on);}}
  function sync(){
    const s=snapshot;if(!s)return;
    $('play').textContent=s.playing?'Ⅱ 暂停':'▶ 继续';$('run-state').textContent=s.playing?'运行中':'已暂停';$('status-dot').style.background=s.playing?'var(--accent)':'#7b8d84';
    $('clock').textContent=s.time.toLocaleString();$('scene-title').textContent=s.scenario?.label||titles[s.scene]||s.scene;
    const scenario=s.scenario;$('scenario-guide').hidden=!scenario;
    if(scenario){
      $('scenario-phase').textContent=scenario.phase;$('scenario-phase').classList.toggle('achieved',scenario.achieved);
      $('scenario-description').textContent=scenario.description;
      $('scenario-configuration').textContent=scenario.customized?'参数已调整':'预设参数';
      const initial=scenario.initial;
      $('scenario-setup').textContent=`开局：正常 ${initial.normal} · 肿瘤 ${initial.tumor} · 免疫 ${initial.immune}${initial.tumor?' · 抗原阳性 '+initial.antigenPositive+'/'+initial.tumor:''}。种子 ${s.seed}；区域、参数和手动操作会改变演化。`;
      const values=s.scene==='oncogenesis'?[`异常发生 ${s.counters.abnormalInitiations}`,`恶性转变 ${s.counters.malignantTransitions}`,`肿瘤分裂 ${scenario.tumorDivisions}`]:s.scene==='cold'?[`存活肿瘤 ${scenario.tumor}`,`原灶外肿瘤 ${scenario.farTumor}`,`远端分裂 ${scenario.distalDivisions}`]:[`残留肿瘤胞体 ${scenario.tumorBodies}`,`免疫清除 ${s.counters.kills}`,`清除后观察 ${scenario.clearanceElapsed} MCS`];
      $('scenario-metrics').textContent=values.join('　·　');
    }
    $('seed-label').textContent='种子 '+s.seed;
    for(const b of document.querySelectorAll('[data-scene]')){const active=b.dataset.scene===s.scene;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);}
    for(const [name,,,,,,suffix] of controls){if(document.activeElement!==$(name))$(name).value=s.settings[name];$(name+'-out').textContent=Number($(name).value)+suffix;}
    if(document.activeElement!==$('speed'))$('speed').value=s.speed;$('speed-out').textContent=s.speed+'×';
    $('boundary').value=s.boundary;
    $('tumor-morphology').value=s.settings.tumorMorphology;$('branch-sliders').hidden=!s.settings.tumorMorphology;
    $('networkAdhesion').disabled=s.settings.tumorMorphology!==2;
    $('branching').disabled=s.settings.tumorMorphology!==2;
    $('network-status').textContent=s.settings.tumorMorphology===2?`当前稳定接触 ${s.cells.reduce((n,m)=>n+(m.networkDegree||0),0)/2} 对；各细胞保持独立胞体。`:'示例会重新播种一片肿瘤细胞，观察突起逐渐形成与连接。';
    const counts=[0,0,0,0];let abnormal=0,activated=0;for(const m of s.cells){counts[m.kind]++;if(m.state==='abnormal')abnormal++;if(CellLabDisplay.immuneActive(m))activated++;}
    $('normal-count').textContent=counts[1]-abnormal;$('abnormal-count').textContent=abnormal;$('tumor-count').textContent=counts[2];$('immune-count').textContent=counts[3];
    $('activated-immune-count').textContent=activated;
    $('seed-status').textContent=`当前 ${s.cells.length} 颗 · 按局部空间尝试加入`;
    $('division-count').textContent=s.counters.divisions;$('recognition-count').textContent=s.counters.recognitions;$('kill-count').textContent=s.counters.kills;$('death-count').textContent=s.counters.apoptosisStarted;
    $('death-progress').textContent=`清除中 ${s.deaths.spontaneous.clearing} · 已清除 ${s.deaths.spontaneous.cleared}`;
    const deathNames={spontaneous:'自发凋亡',kill:'免疫杀伤',environment:'环境死亡'},totals=Object.values(s.deaths);
    $('death-ledger-count').textContent=`已触发 ${totals.reduce((n,d)=>n+d.started,0)} · 清除中 ${totals.reduce((n,d)=>n+d.clearing,0)}`;
    $('death-summary').textContent=Object.entries(s.deaths).map(([cause,d])=>`${deathNames[cause]}：触发 ${d.started} · 清除中 ${d.clearing} · 已清除 ${d.cleared}`).join('\n');
    const deathText=JSON.stringify(s.recentDeaths);
    if($('recent-deaths').dataset.records!==deathText){
      $('recent-deaths').dataset.records=deathText;$('recent-deaths').replaceChildren();
      for(const death of s.recentDeaths.slice().reverse()){const li=document.createElement('li');li.textContent=`${death.startedAt} MCS · #${death.id} · ${deathNames[death.cause]||death.cause} · ${death.clearedAt===null?'清除中':death.clearedAt+' MCS 已清除'}`;$('recent-deaths').append(li);}
      if(!s.recentDeaths.length){const li=document.createElement('li');li.textContent='本局尚无死亡事件。';$('recent-deaths').append(li);}
    }
    $('environment-count').textContent=`环境死亡 ${s.counters.environment}（正常 ${s.counters.normalEnvironmentDeaths} · 异常 ${s.counters.abnormalEnvironmentDeaths}）`;$('immune-division-count').textContent='免疫分裂 '+s.counters.immuneDivisions;$('mutation-count').textContent='性状突变 '+s.counters.mutations;
    $('abnormal-events').textContent=`异常发生 ${s.counters.abnormalInitiations} · 恶性转变 ${s.counters.malignantTransitions} · 异常免疫清除 ${s.counters.abnormalKills}`;
    $('grid-info').textContent=`${s.width} × ${s.height} 格点 · ${s.refinement}× 精细度`;
    $('rate').textContent=s.playing?(Math.round(s.rate)||'—'):'0';
    $('performance').textContent=`目标 ${s.targetRate} MCS / 秒 · ${s.limited?'算力不足，实际推进较慢；生长与分裂继续计算':'固定模型步长'}`;
    $('performance').classList.toggle('limited',s.limited);
    $('population-load').textContent=`当前 ${s.cells.length} 颗 · ${s.width} × ${s.height} 格点。${s.cells.length>=1000?'细胞较多，计算和交互可能变慢。':''}不按细胞数量冻结生长或分裂。`;
    $('backend-status').textContent=`绘图：${gpuRenderer&&!gpuRenderer.lost?(gpuRenderer.hardware===false?'WebGL2 软件':gpuRenderer.hardware===true?'WebGL2 GPU':'WebGL2'):'Canvas2D'} · 形变：${s.kernel==='wasm'?'WebAssembly CPU':s.kernel==='fast'?'优化 JS CPU':'参考 JS CPU'} · 微环境：${s.compute?.active==='gpu'?'WebGPU':'CPU'}`;
    $('compute-note').textContent=(s.compute?.reason||'初始化计算后端…')+(s.kernelNote?' '+s.kernelNote:'');
    const cell=s.cells.find(c=>c.id===selected),phases={search:cell?.kind===3?(cell.immuneCue>.05?'局部趋化':'分散巡逻'):'探索',scan:'接触扫描',kill:'识别后递送损伤',dying:'凋亡缩小'};
    $('selection-label').textContent=cell?'#'+cell.id+' '+CellLabDisplay.cellName(cell):'未选中';
    $('divide').disabled=!cell||cell.dying||cell.state==='abnormal';
    if(cell){
      const lines=[`#${cell.id} ${CellLabDisplay.cellName(cell)} · 面积 ${(cell.area/s.refinement**2).toFixed(0)} · ${phases[cell.phase]}${cell.targetID?' · 接触 #'+cell.targetID:''}`,`氧 ${cell.oxygen.toFixed(2)} / 糖 ${cell.glucose.toFixed(2)} / 酸 ${cell.acid.toFixed(2)}`,`代谢效能 ${(cell.fitness*100).toFixed(0)}% · 累积压力 ${(cell.stress*100).toFixed(0)}% · 邻接拥挤 ${(cell.confinement*100).toFixed(0)}%`];
      if(cell.state==='abnormal')lines.push(`异常已持续 ${Math.floor(cell.abnormalAge)} MCS · 尚未获得肿瘤增殖／侵袭表型`,`抗原 ${cell.antigenLevel.toFixed(2)} · ${cell.antigen?'可被接触识别':'低于识别阈值'} · 杀伤损伤 ${(cell.damage*100).toFixed(0)}%`);
      if(cell.sectionFraction!==undefined)lines.push(`切面目标 ${(cell.sectionFraction*100).toFixed(0)}% · 切面外储量 ${(cell.offPlaneTarget/s.refinement**2).toFixed(1)} · 总目标量 ${(cell.target/s.refinement**2).toFixed(1)}`);
      if(cell.kind===2){const g=cell.genome;lines.push(`克隆 #${cell.clone} · 第 ${cell.generation} 代 · 杀伤损伤 ${(cell.damage*100).toFixed(0)}%`,`遗传：耐受 ${g.tolerance.toFixed(2)} / 增殖 ${g.proliferation.toFixed(2)} / 侵袭 ${g.invasion.toFixed(2)}`,`抗原表达 ${g.antigen.toFixed(2)} · ${cell.antigen?'可识别':'低于识别阈值'}`);}
      if(cell.kind===3)lines.push(`第 ${cell.generation} 代 · 剩余分裂 ${cell.divisionsLeft} 次`,`激活 ${Math.ceil(cell.activation)} MCS · 招募 ${Math.ceil(cell.recruitment)} MCS`);
      if(cell.kind===2&&cell.origin==='normal')lines.push(`源自正常细胞 · ${cell.transformedAt} MCS 恶性转变`);
      if(cell.kind===2&&cell.morphologyMode)lines.push(`${cell.morphologyMode===2?'动态分枝':'梭形双极'} · 伸展／回缩中的突起 ${cell.branchCount} 处 · 稳定接触 ${cell.networkDegree||0} 个邻居`);
      if(cell.dying)lines.push('死亡原因：'+({environment:'持续代谢压力',kill:'免疫递送损伤',spontaneous:'自发凋亡'}[cell.deathCause]||cell.deathCause),`开始凋亡：${cell.deathStartedAt} MCS · 清除中 ${s.time-cell.deathStartedAt} MCS`);
      $('inspection').textContent=lines.join('\n');
    }else{selected=0;$('inspection').textContent='点击细胞，查看局部代谢、活性、抗原、遗传性状与剩余分裂次数。';}
  }
  function resizeDisplay(){
    const cssWidth=Math.max(1,canvas.getBoundingClientRect().width),choice=$('render-resolution').value;
    const width=choice==='auto'?Math.min(3840,Math.ceil(Math.max(960,snapshot.width,cssWidth*(devicePixelRatio||1))/4)*4):Number(choice),height=width*.75;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    $('render-info').textContent=`当前显示／PNG：${width} × ${height} 像素；物理格点 ${snapshot.width} × ${snapshot.height}`;
    return width/cssWidth;
  }
  function render(){
    if(!snapshot||!image)return;const s=snapshot,w=s.width,h=s.height,grid=s.grid,data=image.data,meta=[];
    const pixelRatio=resizeDisplay(),bodies=[];for(const c of s.cells){meta[c.id]=c;bodies[c.id]=CellLabDisplay.bodyColor(c,cellColors);}
    const view=$('field-view').value,wrap=s.boundary==='wrap',seams=$('cell-seams').checked;
    const protect=$('protect-bodies').checked,{field,info,signal,bodySignal}=displayCache.get(s,view,signalLayers,opacity,protect),environmentOpacity=opacity[view]??0,bodyEnvironmentOpacity=CellLabDisplay.bodyOpacity(environmentOpacity,protect);
    const actFlags=[0,...['normal-activity','tumor-activity','immune-activity'].map(id=>$('edge-activity').checked&&$(id).checked?1:0)];
    const legend=[];if(info)legend.push(info.label+' · '+info.description);
    if(signal)legend.push([...signalLayers].map(k=>CellLabDisplay.SIGNALS[k].label).join('、')+'：增强低浓度显示，非线性固定色标；重叠混色，原始浓度见悬停。');
    if(!legend.length)legend.push(actFlags.some(Boolean)?'Act：红＝新生突起 → 黄 → 绿＝活性衰减；零活性恢复胞体色。':'胞体与胞核颜色可在「细胞配色」调整；免疫激活由真实接触识别触发。'+(cellColors.proliferationShading?'肿瘤增殖性状越高，胞体越接近所选深色（0.25–3 固定色标）。':''));
    $('field-legend').textContent=legend.join(' ｜ ');$('heat-key').hidden=!info;
    if(info){$('heat-ramp').style.background='linear-gradient(90deg,'+[info.low,info.middle,info.high].filter(Boolean).map(c=>'rgb('+c.join(',')+')').join(',')+')';$('heat-scale').textContent=view==='adversity'?'友好 0 → 1 恶劣':'0 → 1';}
    updateOverlayButtons();syncOpacity();
    document.querySelector('.edge-key').hidden=!actFlags.some(Boolean);
    document.querySelector('.antigen-key').hidden=!$('antigen-marks').checked;
    let gpu=false;if(gpuRenderer)try{gpu=gpuRenderer.draw(ctx,s,{actFlags,seams,selected,field,info,signal,bodySignal,environmentOpacity,bodyEnvironmentOpacity,pixelRatio,cellColors});}catch(e){rendererFailure=String(e);gpuRenderer.lost=true;}
    if(!gpu){
    for(let q=0;q<grid.length;q++){
      const x=q%w,y=(q/w)|0,id=grid[q],m=meta[id];let rgb;
      const kind=CellLabDisplay.displayKind(m),base=m?bodies[id]:colors[0];rgb=base;
      if(field){const value=field.values[Math.floor(y/s.fieldScale)*field.width+Math.floor(x/s.fieldScale)];
        const heat=info.palette[kind][Math.min(255,Math.max(0,Math.round(value*255)))],alpha=m?bodyEnvironmentOpacity:environmentOpacity;rgb=base.map((v,k)=>v+(heat[k]-v)*alpha);
      }
      if(signal){const layer=m?bodySignal:signal,p=(Math.floor(y/s.fieldScale)*layer.width+Math.floor(x/s.fieldScale))*4,a=layer.rgba[p+3]/255;rgb=rgb.map((v,k)=>v+(layer.rgba[p+k]-v)*a);}
      if(s.walls[q]){const hatch=(x+y)%7<2;rgb=hatch?[66,83,87]:colors[4];}
      if(m){
        if(m.dying)rgb=rgb.map(c=>c*.55+110);
        else if(actFlags[m.kind]&&s.activity[q]>0)rgb=activityPalette[s.activity[q]];
      }
      const k=q*4;data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
    }
    rctx.putImageData(image,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(raster,0,0,canvas.width,canvas.height);
    }
    const scale=canvas.width/w;
    // Optional subpixel display seams; these never enter the lattice mechanics.
    if(!gpu&&(seams||selected)){const paths=[new Path2D(),new Path2D(),new Path2D()];ctx.lineWidth=.55*pixelRatio;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const q=y*w+x,id=grid[q];if(!meta[id]||(!seams&&id!==selected))continue;
        const path=paths[meta[id].kind===1?0:meta[id].kind===3&&!CellLabDisplay.immuneActive(meta[id])?2:1];
        const right=x<w-1?grid[q+1]:(wrap?grid[q-w+1]:0),down=y<h-1?grid[q+w]:(wrap?grid[x]:0);
        if(right!==id){path.moveTo((x+1)*scale,y*scale);path.lineTo((x+1)*scale,(y+1)*scale);}if(down!==id){path.moveTo(x*scale,(y+1)*scale);path.lineTo((x+1)*scale,(y+1)*scale);}}
      ctx.strokeStyle='#626e6de6';ctx.stroke(paths[0]);ctx.strokeStyle='#e1e6e1e6';ctx.stroke(paths[1]);
      ctx.strokeStyle='#803d46e6';ctx.stroke(paths[2]);
    }
    if(selected){const m=meta[selected];if(m){ctx.strokeStyle='#daae35';ctx.lineWidth=1.2*pixelRatio;ctx.beginPath();ctx.arc(m.x*scale,m.y*scale,5*pixelRatio,0,2*Math.PI);ctx.stroke();}}
    if($('nuclei').checked){ctx.lineWidth=1.5*pixelRatio;for(const m of s.cells)if(m.hasNucleus&&!m.dying){const style=CellLabDisplay.nucleusStyle(m,cellColors);ctx.strokeStyle=style.stroke;ctx.fillStyle=style.fill;const offsetsX=wrap?[-w,0,w]:[0],offsetsY=wrap?[-h,0,h]:[0];for(const dx of offsetsX)for(const dy of offsetsY){const x=(m.nucleusX+dx+.5)*scale,y=(m.nucleusY+dy+.5)*scale;ctx.beginPath();ctx.arc(x,y,m.nucleusRadius*scale,0,2*Math.PI);ctx.fill();ctx.stroke();}}}
    if($('antigen-marks').checked){ctx.font=`bold ${13*pixelRatio}px Consolas, monospace`;ctx.textAlign='center';ctx.fillStyle='#f4e7b2';for(const m of s.cells)if((m.kind===2||m.state==='abnormal')&&m.antigen&&!m.dying)ctx.fillText('+',m.x*scale,m.y*scale+4*pixelRatio);}
    if($('arrows').checked){ctx.strokeStyle='#203731a6';ctx.lineWidth=1.6*pixelRatio;for(const m of s.cells)if(!m.dying){const x=m.x*scale,y=m.y*scale,dx=m.px*14*pixelRatio,dy=m.py*14*pixelRatio;ctx.beginPath();ctx.moveTo(x-dx*.35,y-dy*.35);ctx.lineTo(x+dx,y+dy);ctx.lineTo(x+dx*.6-dy*.22,y+dy*.6+dx*.22);ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx*.6+dy*.22,y+dy*.6-dx*.22);ctx.stroke();}}
    if(s.boundary==='solid'){const edge=5*pixelRatio;ctx.strokeStyle='#546668';ctx.lineWidth=edge;ctx.strokeRect(edge/2,edge/2,canvas.width-edge,canvas.height-edge);}
    drawHistory();dirty=false;probeDirty=true;
  }
  function drawHistory(){
    const chart=$('history'),c=chart.getContext('2d'),rows=snapshot.history;c.clearRect(0,0,chart.width,chart.height);if(!rows.length)return;
    let max=10;for(const row of rows)for(const key of ['normal','abnormal','tumor','immune'])max=Math.max(max,row[key]||0);
    const last=rows.at(-1),end=snapshot.time,span=Math.max(1,end);
    c.strokeStyle='#35483f';c.lineWidth=1;c.beginPath();c.moveTo(30,104);c.lineTo(945,104);c.stroke();
    for(const [key,color] of [['normal','#ccc'],['abnormal','#a08b66'],['tumor','#ddb774'],['immune','#df7883']]){c.beginPath();c.lineWidth=2;c.strokeStyle=color;rows.forEach((r,i)=>{const x=30+r.time/span*915,y=100-(r[key]||0)/max*80;i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();}
    c.fillStyle='#91a79b';c.font='11px Consolas';c.fillText(String(max),2,22);c.fillText('0 MCS',30,121);c.textAlign='right';c.fillText(end+' MCS',945,121);c.textAlign='left';
    $('history-range').textContent=`全程 0 — ${end.toLocaleString()} MCS`;
    chart.setAttribute('aria-label',`正常、异常、肿瘤和免疫细胞数量：从 0 到 ${end} MCS 的完整过程`);
    $('order').textContent='极性一致度 '+last.order.toFixed(2);
  }
  const hints={move:'拖动真实细胞轮廓，遇到其他细胞或墙会停下。拖动期间暂停，松手后恢复。',seed:'单击加入一颗细胞；已有细胞处会尝试局部挤入，让邻居变形和有限切面让位。实体障碍仍阻挡。',signal:'点击释放所选因子，拖动画出信号带。信号影响方向，不会直接触发识别或杀伤。',wall:'在空白处按住拖动画墙。墙同时阻断细胞运动与信号扩散，不覆盖已有细胞。',erase:'按住拖动擦除实体障碍，打开通路。',inspect:'点击细胞查看类型、抗原、受损程度与当前接触状态。'};
  function setTool(value){
    tool=value;for(const b of document.querySelectorAll('[data-tool]')){const on=b.dataset.tool===tool;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);}
    $('tool-hint').textContent=hints[tool];$('canvas-note').textContent=hints[tool];
    $('seed-options').hidden=tool!=='seed';$('signal-options').hidden=tool!=='signal';$('wall-options').hidden=!['wall','erase'].includes(tool);
    canvas.style.cursor=tool==='move'?'grab':tool==='inspect'?'pointer':'crosshair';
  }
  function point(e){const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(snapshot.width-1,Math.floor((e.clientX-r.left)/r.width*snapshot.width))),Math.max(0,Math.min(snapshot.height-1,Math.floor((e.clientY-r.top)/r.height*snapshot.height)))];}
  function updateProbe(){
    probeDirty=false;const box=$('field-probe');if(!hover||!snapshot||stroke){box.hidden=true;return;}
    const r=canvas.getBoundingClientRect(),v=document.querySelector('.viewport').getBoundingClientRect(),{clientX,clientY}=hover;
    if(clientX<Math.max(r.left,v.left)||clientX>=Math.min(r.right,v.right)||clientY<Math.max(r.top,v.top)||clientY>=Math.min(r.bottom,v.bottom)){box.hidden=true;return;}
    const [x,y]=point(hover),sample=CellLabDisplay.sample(snapshot,x,y);if(!sample){box.hidden=true;return;}
    $('probe-position').textContent=`位置 ${x}, ${y} · ${sample.time} MCS`;
    $('probe-cell').textContent=sample.wall?'实体障碍':sample.cell?`#${sample.cell.id} ${CellLabDisplay.cellName(sample.cell)}${sample.cell.dying?' · 正在凋亡':''}`:'培养液';
    for(const key of ['oxygen','glucose','acid','cohesion','danger','trail'])$('probe-'+key).textContent=sample.blocked?'—':sample.values[key].toFixed(3);
    $('probe-note').textContent=sample.blocked?'该环境格被实体障碍阻断，暂无有效浓度。':'氧／糖／酸为 0–1 模型量；因子为模型浓度，无实验单位。读数来自当前位置的环境网格。';
    box.hidden=false;const rect=box.getBoundingClientRect();box.style.left=Math.max(8,Math.min(innerWidth-rect.width-8,clientX+15))+'px';box.style.top=Math.max(8,Math.min(innerHeight-rect.height-8,clientY+15))+'px';
  }
  let stroke=null,queuedPoint=null,flushTimer=0,lastAction=Promise.resolve();
  function seedFeedback(result){
    const reasons={occupied:'此处完整胞体会碰到已有细胞',crowded:'局部挤入失败：核区或切面让位额度不足，周围细胞保持原状',wall:'此处被实体障碍挡住',edge:'胞体会超出实体边界，请向内移动',nucleus:'这处空间放不下完整核区',invalid:'新增参数无效',space:'随机尝试未找到足够空隙，可在画布上单击尝试挤入'};
    const added=result.added??(result.id?1:0),message=added?(result.id?'加入了细胞 #'+result.id:`加入了 ${added} / ${result.requested} 颗细胞`):'未加入细胞';
    toast(message+(result.inserted?`；已挤入，${result.displaced} 颗邻居让位`:'')+(result.reason?'；'+(reasons[result.reason]||result.reason):''));
  }
  function applyPointer(p,first=false){
    if(!stroke||!snapshot)return;
    if(tool==='move'){
      if(stroke.id){lastAction=rpc('move',{id:stroke.id,x:p[0]+stroke.offset[0],y:p[1]+stroke.offset[1]}).then(r=>{if(r.blocked&&!stroke?.warned){toast('前方被细胞或实体边界挡住了');if(stroke)stroke.warned=true;}}).catch(fail);}
    }else if(tool==='wall'||tool==='erase'){
      const before=stroke.previous||p,n=Math.max(Math.abs(p[0]-before[0]),Math.abs(p[1]-before[1]),1),points=[];
      for(let i=0;i<=n;i++)points.push([Math.round(before[0]+(p[0]-before[0])*i/n),Math.round(before[1]+(p[1]-before[1])*i/n)]);
      lastAction=rpc('stroke',{points,erase:tool==='erase'}).catch(fail);
    }else if(tool==='signal'){
      const channel=$('signal-kind').value;signalLayers.add(channel);updateOverlayButtons();dirty=true;
      lastAction=rpc('pulse',{x:p[0],y:p[1],channel}).catch(fail);
    }else if(tool==='seed'&&first){lastAction=rpc('seed',{kind:Number($('seed-kind').value),x:p[0],y:p[1],manual:true,push:true}).then(seedFeedback).catch(fail);}
    stroke.previous=p;
  }
  function flush(){clearTimeout(flushTimer);flushTimer=0;if(queuedPoint){const p=queuedPoint;queuedPoint=null;applyPointer(p);}return lastAction;}
  canvas.addEventListener('pointerdown',e=>{
    if(!snapshot||e.button!==0)return;e.preventDefault();$('field-probe').hidden=true;const p=point(e),id=snapshot.grid[p[1]*snapshot.width+p[0]],m=snapshot.cells.find(c=>c.id===id);
    canvas.setPointerCapture(e.pointerId);stroke={previous:p,id:m?.id||0,resume:false,offset:[0,0],warned:false};
    if(tool==='move'||tool==='inspect'){selected=m?.id||0;sync();dirty=true;}
    if(tool==='inspect')$('cell-inspector').open=true;
    if(tool==='move'){
      if(!m||m.dying){stroke=null;toast('请在一个存活的细胞上按住拖动');return;}
      stroke.offset=[m.x-p[0],m.y-p[1]];stroke.resume=snapshot.playing;canvas.style.cursor='grabbing';rpc('playing',{value:false}).catch(fail);
    }else applyPointer(p,true);
  });
  canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'){hover={clientX:e.clientX,clientY:e.clientY};probeDirty=true;}if(!stroke||!snapshot||tool==='inspect'||tool==='seed')return;queuedPoint=point(e);if(!flushTimer)flushTimer=setTimeout(flush,25);});
  canvas.addEventListener('pointerleave',()=>{hover=null;probeDirty=true;});
  window.addEventListener('blur',()=>{hover=null;probeDirty=true;});document.addEventListener('scroll',()=>probeDirty=true,true);window.addEventListener('resize',()=>{probeDirty=true;dirty=true;});
  new ResizeObserver(()=>dirty=true).observe(canvas);document.addEventListener('fullscreenchange',()=>dirty=true);
  async function endStroke(){if(!stroke||stroke.ending)return;const current=stroke;current.ending=true;const resume=current.resume;await flush();if(stroke===current)stroke=null;canvas.style.cursor=tool==='move'?'grab':tool==='inspect'?'pointer':'crosshair';if(resume&&!stroke)rpc('playing',{value:true}).catch(fail);}
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endStroke);
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  function gridPreview(){
    const width=Number($('world-size').value),refine=$('refinement');
    for(const option of refine.options)option.disabled=width*Number(option.value)>1024;
    if(refine.selectedOptions[0].disabled)refine.value=[...refine.options].filter(o=>!o.disabled).at(-1).value;
    const r=Number(refine.value);$('grid-preview').textContent=`应用后：${width*r} × ${width*.75*r} 真实格点（${width} × ${width*.75} 区域，${r}× 精细度）`;
  }
  for(const id of ['world-size','refinement'])$(id).addEventListener('change',gridPreview);gridPreview();
  async function start(scene=snapshot?.scene||'oncogenesis',{preserve=false,shuffle=false,preset=false}={}){
    selected=0;const seed=preset?17:shuffle?crypto.getRandomValues(new Uint32Array(1))[0]%1000000:snapshot?.seed??17;
    const worldWidth=Number($('world-size').value),refinement=Number($('refinement').value);
    if(preset&&snapshot)await rpc('playing',{value:false});
    await rpc('start',{scene,seed,worldWidth,worldHeight:worldWidth*.75,refinement,boundary:$('boundary').value,settings:preserve?snapshot?.settings||{}:{}});
    if(preset){signalLayers.clear();$('field-view').value=scene==='oncogenesis'?'adversity':'none';if(scene==='hot')signalLayers.add('trail');updateOverlayButtons();dirty=true;await rpc('speed',{value:scene==='oncogenesis'?4:scene==='network'?3:1});await rpc('playing',{value:true});}
    else if(scene==='stress'||scene==='surveillance'){$('field-view').value='adversity';dirty=true;}
  }
  document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>start(b.dataset.scene,{preset:true}).catch(fail)));
  $('restore-scenario').addEventListener('click',()=>start(undefined,{preset:true}).then(()=>toast('已恢复当前情境的参数、种子与初始细胞')).catch(fail));
  $('boundary').addEventListener('change',()=>start(undefined,{preserve:true}).then(()=>toast('已按新的边界条件重新开始')).catch(fail));
  $('apply-grid').addEventListener('click',async()=>{const b=$('apply-grid'),label=b.textContent;b.disabled=true;b.textContent='正在创建格点与细胞…';try{await start(undefined,{preserve:true});toast('计算区域与真实格点精细度已更新');}catch(e){fail(e);}finally{b.disabled=false;b.textContent=label;}});
  $('zoom').addEventListener('change',()=>{canvas.style.width=$('zoom').value+'%';dirty=true;});
  $('render-resolution').addEventListener('change',()=>dirty=true);
  $('tumor-morphology').addEventListener('change',e=>rpc('set',{name:'tumorMorphology',value:Number(e.target.value)}).then(()=>toast('肿瘤形态偏好已更新，胞体将逐步重塑')).catch(fail));
  $('network-demo').addEventListener('click',()=>start('network',{preset:true}).catch(fail));
  $('fullscreen').addEventListener('click',()=>{const viewport=document.querySelector('.viewport');(document.fullscreenElement?document.exitFullscreen():viewport.requestFullscreen()).catch(fail);});
  $('reset').addEventListener('click',()=>start(undefined,{preserve:true}).catch(fail));$('shuffle').addEventListener('click',()=>start(undefined,{preserve:true,shuffle:true}).catch(fail));
  $('play').addEventListener('click',()=>rpc('playing',{value:!snapshot?.playing}).catch(fail));$('step').addEventListener('click',()=>rpc('advance',{steps:1}).catch(fail));
  $('speed').addEventListener('input',e=>{$('speed-out').textContent=e.target.value+'×';rpc('speed',{value:Number(e.target.value)}).catch(fail);});
  $('sprinkle').addEventListener('click',()=>rpc('sprinkle',{kind:Number($('seed-kind').value),manual:true}).then(seedFeedback).catch(fail));
  $('clear-walls').addEventListener('click',()=>rpc('clearWalls').then(()=>toast('障碍已清除')).catch(fail));
  $('divide').addEventListener('click',()=>{if(!selected){toast('请先点击选中一颗细胞');return;}rpc('divide',{id:selected}).then(id=>toast(id?'已分裂出细胞 #'+id:'面积不足、分裂预算耗尽、轮廓受限或已达计算上限')).catch(fail);});
  for(const id of ['field-view','edge-activity','normal-activity','tumor-activity','immune-activity','cell-seams','arrows','antigen-marks','nuclei','protect-bodies'])$(id).addEventListener('change',()=>dirty=true);
  document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.layer;if(key==='adversity')$('field-view').value=$('field-view').value==='adversity'?'none':'adversity';else if(signalLayers.has(key))signalLayers.delete(key);else signalLayers.add(key);updateOverlayButtons();dirty=true;}));
  $('clear-overlays').addEventListener('click',()=>{signalLayers.clear();$('field-view').value='none';updateOverlayButtons();dirty=true;});
  const sections=[...document.querySelectorAll('aside details.section')];
  for(const section of sections)section.addEventListener('toggle',()=>{if(section.open)for(const other of sections)if(other!==section)other.open=false;});
  $('collapse-modules').addEventListener('click',()=>sections.forEach(section=>section.open=false));
  $('compute-backend').addEventListener('change',()=>rpc('backend',{mode:$('compute-backend').value}).catch(fail));
  const modes={wander:{alignment:0,cohesion:0,repulsion:1.2,noise:1.2,normalMotility:.9},cluster:{alignment:.4,cohesion:2.6,repulsion:.3,noise:.4,normalMotility:.45},flock:{alignment:2.7,cohesion:1.1,repulsion:.5,noise:.25,normalMotility:1}};
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',async()=>{for(const [name,value] of Object.entries(modes[b.dataset.mode]))await rpc('set',{name,value});toast('局部规则已更新；变化会逐步形成');}));
  function download(url,name){const a=document.createElement('a');a.href=url;a.download=name;a.click();}
  $('snapshot').addEventListener('click',()=>{render();download(canvas.toDataURL('image/png'),`cell-arena-${snapshot.scene}-${snapshot.time}.png`);});
  async function exportData(){return {...await rpc('export'),display:{cellColors:CellLabDisplay.normalizeColors(cellColors)}};}
  $('export-data').addEventListener('click',async()=>{try{const data=await exportData(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));download(url,`cell-arena-experiment-${data.time}.json`);setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(e){fail(e);}});
  $('about').addEventListener('click',()=>$('about-dialog').showModal());$('close-about').addEventListener('click',()=>$('about-dialog').close());
  document.addEventListener('visibilitychange',()=>rpc('visible',{value:!document.hidden}).catch(fail));
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON','SUMMARY'].includes(document.activeElement.tagName)&&!$('about-dialog').open){e.preventDefault();rpc('playing',{value:!snapshot?.playing}).catch(fail);}});
  function frame(){if(dirty)render();if(probeDirty)updateProbe();requestAnimationFrame(frame);}requestAnimationFrame(frame);
  window.artistooLab={rpc,ready,get snapshot(){return snapshot;},get errors(){return errors;},get selected(){return selected;},get colors(){return CellLabDisplay.normalizeColors(cellColors);},get renderer(){return {gpu:!!gpuRenderer&&!gpuRenderer.lost,device:gpuRenderer?.device,error:rendererFailure,ms:gpuRenderer?.lastMs};},setTool,render,exportData};
  start('oncogenesis',{preset:true}).then(()=>rpc('visible',{value:!document.hidden})).catch(fail);
})();
