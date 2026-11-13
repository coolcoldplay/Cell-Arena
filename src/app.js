(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d',{alpha:false});
  const nextStartSeed=CellLabStartSeed.createGenerator(),openingSeed=nextStartSeed();
  const raster=document.createElement('canvas'),rctx=raster.getContext('2d',{alpha:false});
  const colors=CellLabDisplay.BODY_COLORS;
  let cellColors;try{cellColors=CellLabDisplay.normalizeColors(JSON.parse(localStorage.getItem('cell-arena-colors-v1')));}catch{cellColors=CellLabDisplay.normalizeColors();}
  const signalLayers=new Set(),displayCache=new CellLabDisplay.Cache(),surfaceCache=new CellLabAppearance.Surface();
  const autoRandom=new CellLabAutoRandom.Controller();let autoRandomBusy=false,setupBusy=0;
  const setupLocks={'world-size':true,refinement:true,boundary:true};let savedLocks=setupLocks;try{savedLocks={...setupLocks,...JSON.parse(localStorage.getItem('cell-arena-parameter-locks-v1'))};}catch{}
  const parameterLocks=new CellLabRounds.Locks([...Object.keys(CellLabExperiment.ranges),'boundary','world-size','refinement'],savedLocks);
  const journal=new CellLabRounds.Journal(),completedRounds=[],roundStore=CellLabRounds.openStore();let historyPage=0,historyVersion=0,lastCheckpoint=0,storageWarning=false,lastRoundNumber=0;
  const selectedRounds=new Set();let historyCleanup=false,cleanupBusy=false,pendingCleanup=[];
  function storageError(){if(!storageWarning){storageWarning=true;toast('历史记录暂时无法保存到本机，仍可导出本页 CSV');}}
  const historyReady=roundStore.load().then(records=>{completedRounds.push(...records);lastRoundNumber=roundStore.lastRoundNumber;historyVersion++;renderRoundHistory();}).catch(storageError);
  const opacity={angiogenicNormal:.5,angiogenicTumor:.5,adversity:.35,oxygen:.35,glucose:.35,acid:.35,density:.35,cohesion:.45,danger:.45,trail:.45,il2:.45,normalDamage:.45,inhibition:.45};
  let hover=null,hoverMovedAt=0,probeDirty=false,panGesture=null,recordingScale=0,eraseSource=false;
  const trajectories=new CellLabTrajectories();
  const historyChart=CellLabHistory.mount();
  const stage=$('arena-stage'),viewport=stage.parentElement,view={x:0,y:0},fullscreenView=new CellLabFullscreen.View(viewport,stage);
  let performancePreferences;try{performancePreferences=JSON.parse(localStorage.getItem('cell-arena-performance-v1'));}catch{}
  const adaptive=new CellLabPerformance.Controller({preferences:performancePreferences,now:performance.now()});
  const mobileQuery=matchMedia('(max-width:850px)');
  let performancePlan=adaptive.status(),presentationKey='',lastHeartbeat=0,lastAnimation=0,lastRender=0,latestInput=0,forceFrame=false;
  const lineageChart=new CellLabLineage.Chart();
  const visiblePanels=new Set(),visibilityTargets=['statistics-panel','cell-inspector','history','scenario-guide'];
  const panelObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)visiblePanels.add(entry.target.id);else visiblePanels.delete(entry.target.id);}uiPending=true;dirty=true;},{root:document.getElementById('sidebar-scroll')}):null;
  for(const id of visibilityTargets)panelObserver?.observe($(id));
  function panelVisible(id){const node=$(id);return (!node.matches('details')||node.open)&&(!panelObserver||visiblePanels.has(id));}
  function applyPerformance(){
    performancePlan=adaptive.status();const {fps,workMs,idleMs}=performancePlan,key=JSON.stringify([fps,workMs,idleMs]);
    if(key!==presentationKey){presentationKey=key;worker.postMessage({command:'presentation',payload:{fps,workMs,idleMs}});}
  }
  function performanceContext(){
    const changed=adaptive.context({mobile:mobileQuery.matches,preview:mobileQuery.matches&&document.body.classList.contains('panel-expanded'),recording:recordingScale>0,hidden:document.hidden,playing:snapshot?.playing??false,manual:$('render-resolution').value!=='auto'},performance.now());
    if(changed)applyPerformance();return changed;
  }
  function performanceReadout(){
    const p=performancePlan,reasons={warming:'预热测量',render:'绘图负荷',snapshot:'数据打包负荷',interaction:'交互负荷',simulation:'模拟计算受限',balanced:'运行平稳',paused:'已暂停',hidden:'后台暂停',recording:'录像质量锁定'};
    $('adaptive-status').textContent=`${reasons[p.bottleneck]} · 显示上限 ${p.fps} FPS · 显示比例 ${Math.round(p.scale*100)}%${p.manual?' · 手动画质':''}${p.preview?' · 小窗预览':''}`;
    $('adaptive-timing').textContent=`每步计算 ${(snapshot?.stepMs||0).toFixed(1)} ms · 实际 ${(snapshot?.rate||0).toFixed(1)} / 目标 ${snapshot?.targetRate||0} MCS/s`;
  }
  // The probe must remain in the fullscreen element's subtree as well.
  viewport.append($('field-probe'));
  let gpuRenderer=null,rendererFailure='';try{gpuRenderer=new CellLabRenderer();}catch(e){rendererFailure=String(e);}
  const labels=['培养液','正常细胞','肿瘤细胞','免疫细胞','实体障碍'];
  const titles={random:'随机生成',empty:'空白自建',ecosystem:'免疫共培养',collective:'群体迁移',invasion:'肿瘤扩张',maze:'免疫细胞迷宫',stress:'密度与逃逸',surveillance:'癌前监视',network:'胶质瘤样分枝成网'};
  const controls=[
    ['angiogenesis','血管生成速度',0,3,.1,'持续超过诱导阈值后促进实际内皮分裂和出芽；需要已有内皮、营养与空间','×'],
    ['angiogenicSecretion','缺氧诱导因子分泌',0,3,.1,'正常与肿瘤来源分别扩散和衰减；死亡细胞与内皮不分泌','×'],
    ['angiogenicThreshold','血管诱导阈值',.005,3,.001,'两种来源的局部浓度之和；超过阈值仍需持续刺激与真实分裂',''],
    ['angiogenicHalfLife','血管诱导因子半衰期',40,800,20,'仅作用于诱导因子，不改变免疫记忆',' MCS'],
    ['angiogenicHypoxia','诱导分泌的氧阈值',.2,.8,.05,'氧低于此值开始分泌；缺氧越重分泌越多',''],
    ['tumorVesselPenalty','肿瘤来源的血管功能折损',0,.95,.05,'按局部肿瘤来源占比降低氧糖交换与排酸；可调模型假设',''],
    ['immuneLearning','接触抗原传递与学习',0,3,.1,'抽象学习规则：实际接触、抗原取样与传递后增加识别能力；0 停止新学习','×'],
    ['immuneLearningTime','学习所需有效接触',20,400,20,'接触中断则重新累积；营养与接触长度影响速度',' MCS'],
    ['immuneLearningLimit','学得识别类型上限',0,8,1,'原受体另计；已学能力不自动衰减，子代继承；降低上限不删除已有能力',' 种'],
    ['vesselCount','初始血管数',0,6,1,'重开后生效；空白场景可在新增类型中选择血管，放到空隙中',''],
    ['vesselRadius','新血管管腔半径',8,20,1,'只影响新建血管；内皮是可形变的真实胞体，管腔不含组织细胞',''],
    ['vesselSupply','血管交换能力',0,3,.1,'有限速率补充氧糖与排酸；实际通量随灌注、管腔与正常组织保留率变化','×'],
    ['vesselDependence','供给的血管依赖程度',0,100,5,'越高越减少均匀背景供给；血管全部失效后不会自动恢复背景供给','%'],
    ['vesselImmuneRate','循环免疫补充速率',0,3,.1,'管腔内按模型时间概率到达；局部招募信号增强，实际空隙不足时不能生成','×'],
    ['vesselImmuneHealth','免疫补充与组织健康联动',0,100,5,'健康正常组织减少时，延迟下调循环免疫可用量；不把内皮计入正常组织基数','%'],
    ['vesselPassage','免疫跨内皮通行',0,3,.1,'必须接触内皮并持续黏附，随后沿真实胞体形变穿出；0 关闭跨出许可','×'],
    ['vesselRepair','内皮修复速度',0,3,.1,'局部缺口诱导迁移与有限增殖；营养不足或分裂额度耗尽可修复失败','×'],
    ['vesselDivisions','内皮修复谱系分裂上限',0,12,1,'每次分裂两个子代都扣一次；耗尽后仍可存活和有限迁移',' 次'],
    ['vesselLifespan','内皮参考寿命',0,50000,1000,'超过个体寿命后死亡风险逐渐上升；初始年龄有差异，0 关闭年龄凋亡',' MCS'],
    ['vesselInflammation','内皮慢性炎症损伤',0,5,.1,'持续招募信号与代谢压力累积损伤；短时招募不直接杀死内皮。为可调代理机制','×'],
    ['tumorIntravasation','肿瘤入血倾向',0,3,.1,'高侵袭肿瘤实际接触内皮后才可能穿入；整个核区和大部分胞体进入管腔后才可随血流离场','×'],
    ['cycleCoupling','周期—营养耦合',0,1,.05,'0 恢复旧周期门控；1 启用分阶段消耗、储备与复制损伤。依据：Colombo 2011；系数为模型假设',''],
    ['reserveCapacity','营养储备容量',10,240,10,'能量与合成原料的有限缓冲；分裂按实际胞体比例分配。依据：Colombo 2011；无量纲容量',''],
    ['replicationStress','复制压力敏感性',0,3,.1,'S 期缺氧、储备不足或高酸增加 DNA 损伤。依据：Foskolou 2017；速率未标定','×'],
    ['dnaRepair','DNA 修复速度',0,3,.1,'消耗储备修复复制损伤，不消除免疫杀伤损伤。依据：Foskolou 2017；速率未标定','×'],
    ['checkpointIntegrity','肿瘤 DNA 检查点强度',0,1,.05,'越高越早因 DNA 损伤阻滞；正常与免疫保持完整检查点。模型阈值未标定',''],
    ['traitCost','肿瘤性状代价',0,3,.05,'强增殖、侵袭与耐受增加资源成本，并有温和功能权衡；0 关闭。依据：Giese 1996；代价函数为假设','×'],
    ['normalRepair','正常组织修复速度',0,1,.05,'只有邻接真实空隙、营养足够且额度未耗尽才进入修复周期。依据：Gudipaty 2017；速度未标定',''],
    ['normalDivisions','正常修复谱系分裂上限',0,12,1,'每次分裂两个子代均扣一次；0 禁止修复分裂。依据：Hayflick 1961；次数为演示设置，非通用寿命',' 次'],
    ['stemFraction','新生肿瘤干性比例',0,100,5,'只影响初始、新增和新恶性转化的肿瘤；独立于抗原。依据：Chen 2012；比例未标定','%'],
    ['stemSymmetry','干细胞对称分裂概率',0,100,5,'其余为一干性、一分化的不对称分裂。依据：Driessens 2012；概率未标定','%'],
    ['stemRenewal','对称分裂中的自我更新',0,100,5,'对称分裂时产生两个干性子代的概率，其余产生两个分化子代。依据：Driessens 2012','%'],
    ['stemCycleSlowdown','干性细胞周期时长倍率',1,3,.05,'相对分化肿瘤的周期时长；1 无差别。胶质瘤慢周期亚群启发：Chen 2012，并非所有干细胞都慢','×'],
    ['stemRepair','干性 DNA 修复倍率',1,3,.1,'仅增强 DNA 修复，不降低免疫接触杀伤。依据：Bao 2006；倍率未标定','×'],
    ['stemPlasticity','环境诱导干性可塑性',0,3,.05,'存活分化肿瘤在持续局部低氧生态位中有概率重新获得干性；0 关闭。Li 2009／Chaffer 2013 启发的代理模型','×'],
    ['tumorProgenyLimit','分化肿瘤谱系分裂上限',0,20,1,'0 保持无限分裂；大于 0 启用有限扩增层级；干性自我更新不受此限。依据：Chen 2012',' 次'],
    ['chemotaxis','趋化响应',0,3,.1,'局部信号影响运动方向；肿瘤也趋向高氧、高糖',''],
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
    ['antigen','初始高抗原表达比例',0,100,5,'只影响新播种的肿瘤；已有克隆的表达通过遗传与突变改变','%'],
    ['kill','接触杀伤强度',0,2,.1,'只对已识别且仍接触的靶细胞递送损伤',''],
    ['temperature','膜形变波动',2,30,1,'CPM 温度，影响随机复制尝试的接受率',''],
    ['supply','氧糖补给与酸清除',0,3,.05,'培养液储库补给；调低后密集区域更容易恶化',''],
    ['normalSupport','正常细胞供给联动',0,100,1,'按本局健康正常细胞存活数的历史峰值计算保留比例；0% 无联动，100% 等比例影响全局氧糖补给和酸清除','%'],
    ['metabolism','消耗与产酸强度',0,2,.01,'按实际细胞占据面积与邻域密度持续计算',''],
    ['escape','恶劣环境逃逸',0,5,.1,'沿局部氧糖上升、酸负荷下降的方向重新极化',''],
    ['recruitment','识别后招募信号',0,3,.1,'实际接触识别癌前或肿瘤后分泌；仅被吸引者不自动接力',''],
    ['immuneGrowth','免疫扩增速度',0,1.5,.05,'抗原刺激记忆与 IL-2 共同支持；受营养、耗竭和实际空间限制',''],
    ['immuneDivisions','新免疫细胞谱系分裂上限',0,6,1,'实验性谱系上限；每次分裂，两颗子细胞均扣一次；只影响新播种',' 次'],
    ['immuneKillLimit','免疫寿命：杀伤上限',0,100,1,'累计致死指定数量的肿瘤后皱缩凋亡；0 关闭。只记实际致死接触，每颗肿瘤一次；分裂后两颗子代各自从 0 计数',' 颗'],
    ['tumorCycle','肿瘤基础周期',80,1200,20,'G1／S／G2／M 的基础总时长；实际由增殖性状、生长参数和环境调节',' MCS'],
    ['tumorQuiescence','肿瘤压缩静息敏感性',0,3,.1,'由实际面积相对切面目标的压缩触发；0 只关闭此生物学闸门，几何限制保留',''],
    ['immuneCycle','免疫基础周期',80,1200,20,'许可后的基础总时长；停止直接接触不会立即清空扩增记忆',' MCS'],
    ['antigenMemory','抗原刺激记忆半衰期',100,6000,100,'内部扩增许可逐渐衰减，子代继承并稀释；不是即时杀伤激活',' MCS'],
    ['il2Secretion','识别后 IL-2 分泌',0,3,.1,'真实抗原刺激后短时分泌；IL-2 支持扩增，不作为趋化或抗原替代',''],
    ['il2HalfLife','IL-2 半衰期',20,800,20,'独立扩散、衰减和摄取；可用持续场源外源补充',' MCS'],
    ['exhaustionRate','慢性刺激耗竭速率',0,3,.1,'持续抗原刺激逐渐降低扩增和杀伤；补足营养不会立即清空耗竭',''],
    ['damagePolarization','损伤暴露转抑制态',0,5,.1,'存活正常细胞的持续压力或损伤也可触发；不必先死亡。暴露越强、越久转蓝概率越高；0 关闭','×'],
    ['suppressionRecovery','抑制态恢复速度',0,5,.1,'当前正常损伤信号和累计暴露均降低后，蓝色细胞按概率恢复粉色；越大恢复越快，0 关闭恢复','×'],
    ['damageDeactivation','损伤暴露退激活',0,5,.1,'持续正常细胞损伤信号提高红色免疫细胞退回粉色的概率','×'],
    ['suppressiveSecretion','抑制态信号分泌',0,5,.1,'蓝色细胞沿自身胞体分泌独立免疫抑制信号，随局部代谢效能变化','×'],
    ['suppressionStrength','抑制信号退激活',0,5,.1,'局部抑制信号提高红色转粉色的概率；退激活后 240 MCS 内不能立即重新识别','×'],
    ['immuneRegulationMemory','正常损伤暴露记忆',100,2000,50,'暴露按胞体附近的正常损伤信号积累，离开后渐减；肿瘤报警与 IL-2 不直接触发',' MCS'],
    ['mutation','子代遗传突变机会',0,100,1,'肿瘤分裂时分别抽样耐受、增殖、侵袭和抗原表达','%'],
    ['mutationSize','突变幅度',0,.5,.01,'遗传性状变化幅度；默认双向随机，可用适应偏向进行对照实验',''],
    ['normalMutationGain','正常细胞压力致变',0,12,.25,'氧糖不足、高酸与持续炎症提高耐受性状变化及癌变风险；0 关闭额外放大','×'],
    ['tumorMutationGain','肿瘤压力致变',0,12,.25,'局部压力提高分裂时突变率，并允许存活肿瘤在两次分裂之间发生性状变化','×'],
    ['mutationBias','突变适应偏向',-100,100,5,'负值偏向不利、0 双向随机、正值偏向耐受与逃逸；这是实验偏置，不保证生存获益','%'],
    ['initialImmuneReady','新加入免疫细胞的响应资格',0,100,5,'只影响新加入的细胞；仍需匹配抗原并实际接触','%'],
    ['primingRate','后台抗原启动速度',0,3,.1,'有限候选谱、局部暴露、延迟和宿主支持；不改写已有识别码','×'],
    ['checkpointStrength','免疫刹车效力',0,3,.1,'独立于抗原与呈递的执行抑制','×'],
    ['antigenStressGain','环境表达响应',0,5,.05,'放大每个抗原自身的正或负环境响应；表达可恢复','×'],
    ['contactEscape','接触相关呈递下调',0,5,.05,'可逆调控，不再直接产生遗传抗原丢失','×'],
    ['signalEscape','炎性暴露呈递下调',0,5,.05,'可逆调控，遗传缺失独立记录','×'],
    ['evolutionMemory','选择压力记忆时长',100,4000,100,'接触记忆的半衰期与招募暴露的积累时间尺度；离开后衰减，分裂后稀释',' MCS'],
    ['stressMutation','环境损伤致癌前',0,20,.1,'持续代谢损伤提高正常 → 癌前风险；0 关闭此通路，炎性通路独立设置','×'],
    ['inflammation','炎性信号促癌',0,10,.1,'局部损伤／免疫招募信号持续累积后增加正常 → 癌前风险；0 关闭，仍经过癌前细胞。未标定的炎症代理','×'],
    ['progression','癌前 → 肿瘤风险倍率',0,20,.1,'癌前至少保留 160 MCS；倍率调整后仍是随机事件，0 保留中间态','×'],
    ['sectionYield','切面让位上限',0,.5,.01,'受邻居推挤时减少可见目标面积，压力解除后逐步恢复；总生物量保留',''],
    ['branchLength','突起延伸范围',1.6,4,.1,'相对胞体等效半径的可达范围；真实长度仍取决于空间和胞质量','×'],
    ['branchStrength','分枝形态保持',0,12,.5,'局部骨架形变偏好，越强越保持分枝；不会越墙或跳过核区约束',''],
    ['branching','侧枝萌生倾向',0,3,.1,'在局部胞体或已有突起上形成新前缘；数量不固定，0 仍保留基础伸展与回缩',''],
    ['networkAdhesion','接触网络稳定性',0,2,.1,'只稳定持续接触的肿瘤对；0 关闭成网黏附，不产生隔空连接','']
  ];
  const modules={
    'branch-sliders':['branchLength','branchStrength','branching','networkAdhesion'],
    'vascular-sliders':['angiogenesis','angiogenicSecretion','angiogenicThreshold','angiogenicHalfLife','angiogenicHypoxia','tumorVesselPenalty','vesselCount','vesselRadius','vesselSupply','vesselDependence','vesselImmuneRate','vesselImmuneHealth','vesselPassage','vesselRepair','vesselDivisions','vesselLifespan','vesselInflammation','tumorIntravasation'],
    'environment-sliders':['supply','normalSupport','metabolism','halfLife','chemotaxis','escape','inflammation'],
    'evolution-sliders':['mutationBias','evolutionMemory'],
    'normal-sliders':['normalRepair','normalDivisions','normalMotility','cohesion','stressMutation','progression','normalMutationGain'],
    'tumor-sliders':['tumorMotility','growth','apoptosis','antigen'],
    'tumor-evolution-sliders':['mutation','mutationSize','tumorMutationGain','antigenStressGain','contactEscape','signalEscape'],
    'tumor-cycle-sliders':['tumorCycle','tumorQuiescence','checkpointIntegrity','traitCost'],
    'stem-sliders':['stemFraction','stemSymmetry','stemRenewal','stemCycleSlowdown','stemRepair','stemPlasticity','tumorProgenyLimit'],
    'resource-sliders':['cycleCoupling','reserveCapacity','replicationStress','dnaRepair'],
    'immune-sliders':['immuneMotility','immuneSeparation','kill','immuneKillLimit','recruitment'],
    'immune-regulation-sliders':['damagePolarization','suppressionRecovery','damageDeactivation','suppressiveSecretion','suppressionStrength','immuneRegulationMemory'],
    'immune-cycle-sliders':['immuneLearning','immuneLearningTime','immuneLearningLimit','initialImmuneReady','primingRate','checkpointStrength','immuneGrowth','immuneDivisions','immuneCycle','antigenMemory','il2Secretion','il2HalfLife','exhaustionRate'],
    'other-sliders':['sectionYield','temperature','alignment','repulsion','noise']
  },moduleFor=Object.fromEntries(Object.entries(modules).flatMap(([id,names])=>names.map(name=>[name,id])));
  for(let i=0;i<controls.length;i++){
    const [name,label,min,max,step,hint,suffix]=controls[i],row=document.createElement('div');row.className='slider model-slider'+(suffix==='%'?' percentage-slider':'');row.title=hint;
    const numberEntry=suffix==='%'?'':`<span class="parameter-entry"><input id="${name}-number" type="number" min="${min}" max="${max}" step="${step}" inputmode="${Number.isInteger(step)?'numeric':'decimal'}" aria-labelledby="${name}-label" aria-describedby="${name}-hint"><span>${suffix.trim()}</span></span>`;
    row.innerHTML=`<span><label id="${name}-label" for="${name}">${label}</label><output id="${name}-out" for="${name}">—</output>${numberEntry}</span><div class="slider-track"><button id="${name}-decrease" class="parameter-step" type="button" aria-label="减小${label}">−</button><input id="${name}" type="range" min="${min}" max="${max}" step="${step}" aria-labelledby="${name}-label" aria-describedby="${name}-hint"><button id="${name}-increase" class="parameter-step" type="button" aria-label="增大${label}">＋</button></div><small id="${name}-hint">${hint}</small>`;
    $(moduleFor[name]).append(row);
    $(name).addEventListener('input',e=>{const value=Number(e.target.value);$(name+'-out').textContent=value+suffix;syncParameterInput(name);rpc('set',{name,value}).catch(fail);});
    for(const [id,direction]of [['decrease',-1],['increase',1]])$(name+'-'+id).addEventListener('click',()=>{$(name).stepUp(direction);$(name).dispatchEvent(new Event('input',{bubbles:true}));});
    $(name+'-number')?.addEventListener('change',e=>{const value=e.target.valueAsNumber;if(!Number.isFinite(value)){e.target.value=$(name).value;return;}const bounded=Math.max(min,Math.min(max,value));$(name).value=Number((min+Math.round((bounded-min)/step)*step).toFixed(8));e.target.value=$(name).value;$(name).dispatchEvent(new Event('input',{bubbles:true}));});
    $(name+'-number')?.addEventListener('keydown',e=>{if(e.key==='Enter')e.target.blur();});
    $(name+'-number')?.addEventListener('focus',e=>requestAnimationFrame(()=>{if(document.activeElement===e.target)e.target.select();}));
  }
  const normalSupportStatus=document.createElement('p');normalSupportStatus.id='normal-support-status';normalSupportStatus.className='hint';$('normalSupport').closest('.slider').after(normalSupportStatus);
  function syncParameterInput(name){
    const slider=$(name),number=$(name+'-number'),value=Number(slider.value);
    if(number){if(document.activeElement!==number)number.value=slider.value;number.disabled=slider.disabled;}
    $(name+'-decrease').disabled=slider.disabled||value<=Number(slider.min);$(name+'-increase').disabled=slider.disabled||value>=Number(slider.max);
  }
  for(const [key,label] of [['environment','环境热图'],['cohesion','细胞凝聚因子'],['danger','损伤因子'],['trail','免疫招募因子'],['il2','IL-2 扩增信号'],['normalDamage','正常细胞损伤信号'],['inhibition','免疫抑制信号']]){
    const row=document.createElement('label');row.className='slider';row.innerHTML=`<span id="opacity-label-${key}">${label}<output id="opacity-${key}-out" for="opacity-${key}"></output></span><input id="opacity-${key}" type="range" min="0" max="100" step="1" value="${(key==='environment'?.35:.45)*100}">`;
    $('opacity-sliders').append(row);
    $('opacity-'+key).addEventListener('input',e=>{const channel=key==='environment'?($('field-view').value==='none'?'adversity':$('field-view').value):key;opacity[channel]=Number(e.target.value)/100;syncOpacity();dirty=true;});
  }
  function syncOpacity(){for(const key of ['environment','cohesion','danger','trail','il2','normalDamage','inhibition']){const channel=key==='environment'?($('field-view').value==='none'?'adversity':$('field-view').value):key;const value=Math.round(opacity[channel]*100);$('opacity-'+key).value=value;$('opacity-'+key+'-out').textContent=value+'%';}const name=$('field-view').value;$('opacity-label-environment').firstChild.textContent=CellLabDisplay.FIELD_INFO[name]?.label||'环境热图';}
  syncOpacity();
  const blob=new Blob([$('worker-source').textContent],{type:'text/javascript'}),workerURL=URL.createObjectURL(blob),worker=new Worker(workerURL);
  let sequence=0,snapshot=null,selected=0,observedBirth=0,tool='move',image=null,dirty=false,toastTimer,lastRevision=-1;
  let pendingFrame=0,lastUISync=0,uiPending=false,lastHistoryDraw=0;
  let settingsKey='',legendKey='';
  const frameStats={fps:0,renderMs:0,snapshotMs:0,count:0,since:performance.now(),time:null,revision:null};
  const colorTypes=[['normal','正常细胞'],['abnormal','癌前细胞'],['tumor','肿瘤细胞'],['immune','未激活免疫'],['activated','已激活免疫'],['suppressive','免疫抑制样'],['endothelial','血管内皮']];
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
    $('proliferation-shading').checked=cellColors.proliferationShading;$('tumor-trait-view').value=cellColors.tumorTrait;
    for(const [key,css] of [['normal','normal'],['abnormal','abnormal'],['tumor','tumor'],['immune','immune'],['activated','immune-active'],['suppressive','immune-suppressive'],['endothelial','endothelial']]){for(const node of document.querySelectorAll('.legend .'+css))node.style.background=cellColors[key].body;document.querySelector('.population-'+key)?.style.setProperty('--population-color',cellColors[key].body);}
    const ramp=document.querySelector('.proliferation-key'),low=CellLabDisplay.bodyColor({kind:2,genome:{proliferation:.25,tolerance:.25,invasion:.25},antigenLevel:0},cellColors),high=cellColors.tumor.body;
    ramp.querySelector('i').style.background=`linear-gradient(90deg,rgb(${low.join(',')}),${high})`;
    ramp.lastChild.textContent=cellColors.proliferationShading?({proliferation:'肿瘤：浅 → 深，增殖能力低 → 高',tolerance:'肿瘤：浅 → 深，遗传耐受低 → 高',invasion:'肿瘤：浅 → 深，遗传侵袭低 → 高',antigenLevel:'肿瘤：浅 → 深，当前呈递低 → 高'}[cellColors.tumorTrait]):'肿瘤：统一胞体色';
  }
  function applyColors(value){cellColors=CellLabDisplay.normalizeColors(value);try{localStorage.setItem('cell-arena-colors-v1',JSON.stringify(cellColors));}catch{/* Private/storage-disabled contexts still support this session. */}syncColors();dirty=true;}
  $('reset-colors').addEventListener('click',()=>applyColors(null));
  $('tumor-trait-view').addEventListener('change',e=>applyColors({...cellColors,tumorTrait:e.target.value,proliferationShading:true}));
  $('proliferation-shading').addEventListener('change',e=>applyColors({...cellColors,proliferationShading:e.target.checked}));syncColors();
  try{const saved=localStorage.getItem('cell-arena-edge-fade-v1');if(saved!==null&&Number.isFinite(Number(saved)))$('body-feather').value=Math.max(0,Math.min(100,Number(saved)));}catch{}
  function syncAppearance(){ $('body-feather-out').textContent=$('body-feather').value+'%';dirty=true;forceFrame=true; }
  $('body-feather').addEventListener('input',()=>{syncAppearance();try{localStorage.setItem('cell-arena-edge-fade-v1',$('body-feather').value);}catch{}});syncAppearance();
  let restartPreferences=CellLabAutoRandom.preferences();try{restartPreferences=CellLabAutoRandom.preferences(JSON.parse(localStorage.getItem('cell-arena-auto-random-v2')),localStorage.getItem('cell-arena-auto-random-v1'));}catch{}
  $('auto-random-enabled').checked=restartPreferences.enabled;$('auto-random-minutes').value=restartPreferences.minutes;
  function configureAutoRandom(){
    const input=$('auto-random-minutes'),enabled=$('auto-random-enabled').checked;input.disabled=!enabled;
    autoRandom.configure(enabled?input.valueAsNumber:0,performance.now());renderAutoNotice();
    if(input.validity.valid&&Number.isFinite(input.valueAsNumber))try{localStorage.setItem('cell-arena-auto-random-v2',JSON.stringify({enabled,minutes:input.valueAsNumber}));}catch{}
  }
  function setAutoRandomMinutes(minutes){$('auto-random-enabled').checked=minutes>0;$('auto-random-minutes').value=minutes>0?minutes:1;configureAutoRandom();}
  $('auto-random-minutes').addEventListener('input',configureAutoRandom);$('auto-random-enabled').addEventListener('change',configureAutoRandom);configureAutoRandom();
  function tickAutoRandom(now){
    const allowed=!document.hidden&&!autoRandomBusy&&!setupBusy&&!stroke&&!pending.size&&!document.querySelector('dialog[open]')&&document.activeElement!==$('auto-random-minutes');
    const reason=autoRandom.tick(snapshot,now,allowed);renderAutoNotice();if(!reason)return;
    autoRandomBusy=true;
    start('random',{shuffle:true,reason:'auto-'+reason}).then(()=>toast('已按未锁定参数随机开启新一轮')).catch(error=>{$('auto-random-enabled').checked=false;configureAutoRandom();fail(error);}).finally(()=>{autoRandomBusy=false;renderAutoNotice();});
  }
  function renderAutoNotice(){const status=autoRandom.status();$('auto-round-notice').hidden=!status.pendingReason||status.fired||!status.minutes;$('auto-round-reason').textContent=status.pendingReason?CellLabRounds.reasonLabel(status.pendingReason):'';$('auto-round-seconds').textContent=Math.ceil(status.countdownMs/1000);$('auto-round-paused').hidden=!!snapshot?.playing&&!document.hidden;}
  $('auto-round-cancel').addEventListener('click',()=>{$('auto-random-enabled').checked=false;configureAutoRandom();});
  const pending=new Map(),errors=[];
  let resolveReady;const ready=new Promise(r=>resolveReady=r);
  function rpc(command,payload={}){
    return new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('操作超时：'+command));},60000);pending.set(id,{resolve,reject,timeout});worker.postMessage({id,command,payload});});
  }
  function persistLocks(){try{localStorage.setItem('cell-arena-parameter-locks-v1',JSON.stringify(parameterLocks));}catch{}syncLocks();}
  function syncLocks(){
    for(const button of document.querySelectorAll('[data-parameter-lock]')){const locked=!!parameterLocks.values[button.dataset.parameterLock];button.setAttribute('aria-pressed',String(locked));button.title=locked?'已锁定：随机开局保持此参数':'未锁定：随机开局允许随机化';button.setAttribute('aria-label',button.title);button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="1"/><path d="'+(locked?'M6 9V6a4 4 0 0 1 8 0v3':'M6 9V6a4 4 0 0 1 8 0')+'"/><path d="M10 12v3"/></svg>';}
    const all=parameterLocks.keys.every(k=>parameterLocks.values[k]);$('lock-all-parameters').textContent=all?'全部解锁':'全部锁定';$('lock-all-parameters').setAttribute('aria-pressed',String(all));
  }
  for(const key of parameterLocks.keys){
    const input=$(key==='tumorMorphology'?'tumor-morphology':key);if(!input)continue;
    const button=document.createElement('button');button.type='button';button.className='parameter-lock';button.dataset.parameterLock=key;
    if(input.matches('input[type=range]'))input.closest('.model-slider').querySelector(':scope>span').append(button);
    else input.after(button);
    button.addEventListener('click',event=>{event.preventDefault();parameterLocks.toggle(key);persistLocks();});
  }
  $('lock-all-parameters').addEventListener('click',()=>{parameterLocks.all(!parameterLocks.keys.every(k=>parameterLocks.values[k]));persistLocks();});syncLocks();
  function archiveRound(reason){
    const record=journal.finish(reason,performance.now(),undefined,parameterLocks.toJSON(),displaySettings());if(!record)return;
    record.roundNumber=++lastRoundNumber;completedRounds.push(record);historyVersion++;historyPage=0;
    roundStore.archive(record).then(saved=>{record.roundNumber=saved.roundNumber;lastRoundNumber=Math.max(lastRoundNumber,saved.roundNumber);historyVersion++;renderRoundHistory();}).catch(storageError);renderRoundHistory();
  }
  function checkpointRound(now,force=false){
    if(!journal.active||(!force&&now-lastCheckpoint<5000))return;
    journal.active.finalLocks=parameterLocks.toJSON();journal.active.display=displaySettings();lastCheckpoint=now;roundStore.checkpoint(journal.current()).catch(storageError);
  }
  function renderRoundHistory(){
    const all=CellLabRounds.numbered(completedRounds).reverse(),pages=Math.max(1,Math.ceil(all.length/6));historyPage=Math.max(0,Math.min(pages-1,historyPage));
    $('round-total').textContent=all.length;$('round-page').textContent=(historyPage+1)+' / '+pages;$('round-newer').disabled=!historyPage;$('round-older').disabled=historyPage>=pages-1;
    syncHistoryCleanup();
    const list=$('round-list'),stamp=historyVersion+':'+historyPage+':'+historyCleanup;if(list.dataset.version===stamp)return;list.dataset.version=stamp;list.replaceChildren();
    if(!all.length){const p=document.createElement('p');p.className='hint';p.textContent='换局后在这里比较历局结果；CSV 也包含当前进行中的一局。';list.append(p);return;}
    for(const record of all.slice(historyPage*6,historyPage*6+6)){
      const row=document.createElement('details');row.className='round-result';
      const head=document.createElement('summary'),reason=document.createElement('b'),time=document.createElement('span');reason.textContent='#'+record.roundNumber+' · '+CellLabRounds.reasonLabel(record.reason);time.textContent=record.simulatedMCS.toLocaleString()+' MCS';const heading=document.createElement('div');heading.append(reason);head.append(heading,time);
      const started=document.createElement('div'),startLabel=document.createElement('span'),date=document.createElement('time');started.className='round-start';startLabel.textContent='开始时间 ';const formatted=CellLabRounds.startTime(record.startedAt);date.textContent=formatted||'时间未知';if(formatted){date.dateTime=record.startedAt;date.dataset.noI18n='';}started.append(startLabel,date);heading.append(started);
      const state=document.createElement('p');state.textContent='正常 '+record.population.normal+' · 癌前 '+record.population.abnormal+' · 肿瘤 '+record.population.tumor+' · 免疫 '+record.population.immune;
      const info=document.createElement('small');info.textContent=(record.runningMs/60000).toFixed(1)+' min · '+record.scene+' · '+record.seed;
      const phenotypes=document.createElement('p');phenotypes.textContent='免疫：静息 '+record.population.immuneResting+' · 激活 '+record.population.immuneActive+' · 抑制 '+record.population.immuneSuppressive+'\n肿瘤：非自身呈递高 '+record.population.tumorAntigenPositive+' · 低 '+record.population.tumorAntigenNegative;
      const params=document.createElement('pre');params.textContent=JSON.stringify(record.finalSettings,null,2);const replay=document.createElement('button');replay.className='replay-round';replay.textContent='↻ 再次模拟此局';replay.dataset.roundId=record.id;replay.addEventListener('click',async()=>{replay.disabled=true;try{await replayRound(record);}catch(e){fail(e);}finally{replay.disabled=false;}});
      const note=document.createElement('p');note.className='hint';note.textContent=(record.modelRevision===snapshot?.modelRevision?'':'模型版本已变化，演化可能不同。')+'按种子与初始参数重新模拟，不重放手动操作。';heading.append(state);row.append(head,info,phenotypes,replay,note,params);
      const entry=document.createElement('div');entry.className='round-entry';entry.dataset.roundId=record.id;
      if(historyCleanup){
        const label=document.createElement('label'),choice=document.createElement('input');label.className='round-select';choice.type='checkbox';choice.dataset.roundSelect=record.id;choice.checked=selectedRounds.has(record.id);choice.disabled=cleanupBusy;choice.setAttribute('aria-label','选择此局 #'+record.roundNumber);label.append(choice);entry.append(label);
        choice.addEventListener('change',()=>{choice.checked?selectedRounds.add(record.id):selectedRounds.delete(record.id);syncHistoryCleanup();});
      }
      entry.append(row);list.append(entry);
    }
  }
  function syncHistoryCleanup(){
    const ids=new Set(completedRounds.map(r=>r.id));for(const id of selectedRounds)if(!ids.has(id))selectedRounds.delete(id);
    $('round-cleanup').textContent=historyCleanup?'完成清理':'清理';$('round-cleanup').setAttribute('aria-pressed',String(historyCleanup));$('round-cleanup').disabled=cleanupBusy||!completedRounds.length&&!historyCleanup;
    $('round-cleanup-controls').hidden=!historyCleanup;$('round-selected-count').textContent=selectedRounds.size;$('round-selection-total').textContent=completedRounds.length;
    const all=$('round-select-all');all.checked=!!ids.size&&selectedRounds.size===ids.size;all.indeterminate=selectedRounds.size>0&&selectedRounds.size<ids.size;all.disabled=cleanupBusy||!ids.size;
    $('round-delete-selected').disabled=cleanupBusy||!selectedRounds.size;$('round-keep-selected').disabled=cleanupBusy||!selectedRounds.size||selectedRounds.size===ids.size;
    for(const input of document.querySelectorAll('[data-round-select]')){input.checked=selectedRounds.has(input.dataset.roundSelect);input.disabled=cleanupBusy;}
  }
  $('round-cleanup').addEventListener('click',()=>{historyCleanup=!historyCleanup;selectedRounds.clear();renderRoundHistory();});
  $('round-select-all').addEventListener('change',e=>{selectedRounds.clear();if(e.target.checked)for(const r of completedRounds)selectedRounds.add(r.id);syncHistoryCleanup();});
  function prepareCleanup(keep){
    if(cleanupBusy)return;pendingCleanup=CellLabRounds.cleanupIds(completedRounds,selectedRounds,keep);if(!pendingCleanup.length)return;
    $('round-cleanup-title').textContent=keep?'仅保留所选':'清除所选';$('round-delete-count').textContent=pendingCleanup.length;$('round-delete-scope').textContent=keep?' 局未选中的历史记录（包括其他页）。此操作不可撤销。':' 局勾选的历史记录（包括其他页）。此操作不可撤销。';$('round-cleanup-error').textContent='';$('round-cleanup-confirm').disabled=false;$('round-cleanup-cancel').disabled=false;$('round-cleanup-dialog').showModal();
  }
  $('round-delete-selected').addEventListener('click',()=>prepareCleanup(false));$('round-keep-selected').addEventListener('click',()=>prepareCleanup(true));
  $('round-cleanup-cancel').addEventListener('click',()=>$('round-cleanup-dialog').close());
  $('round-cleanup-dialog').addEventListener('cancel',e=>{if(cleanupBusy)e.preventDefault();});
  $('round-cleanup-dialog').addEventListener('close',()=>{if(!$('round-cleanup-dialog').open)pendingCleanup=[];});
  $('round-cleanup-confirm').addEventListener('click',async()=>{
    if(cleanupBusy||!pendingCleanup.length)return;const ids=new Set(pendingCleanup);cleanupBusy=true;syncHistoryCleanup();$('round-cleanup-confirm').disabled=true;$('round-cleanup-cancel').disabled=true;
    try{
      // Commit the exact confirmed IDs first. New rounds and the active checkpoint
      // remain untouched, including when a round completes while the dialog is open.
      await roundStore.remove([...ids]);for(let i=completedRounds.length-1;i>=0;i--)if(ids.has(completedRounds[i].id))completedRounds.splice(i,1);
      for(const id of ids)selectedRounds.delete(id);historyVersion++;$('round-cleanup-dialog').close();toast('已清理所选历局记录');
    }catch{ $('round-cleanup-error').textContent='清理失败，记录未删除，请重试或先导出 CSV。'; }
    finally{cleanupBusy=false;$('round-cleanup-confirm').disabled=false;$('round-cleanup-cancel').disabled=false;renderRoundHistory();}
  });
  for(const [id,results]of [['history-current-tab',false],['history-rounds-tab',true]])$(id).addEventListener('click',()=>{$('current-history').hidden=results;$('round-results').hidden=!results;$('history-current-tab').setAttribute('aria-pressed',String(!results));$('history-rounds-tab').setAttribute('aria-pressed',String(results));renderRoundHistory();dirty=true;});
  $('round-newer').addEventListener('click',()=>{historyPage--;renderRoundHistory();});$('round-older').addEventListener('click',()=>{historyPage++;renderRoundHistory();});
  $('export-rounds').addEventListener('click',()=>{
    if(snapshot)journal.observe(snapshot,performance.now(),!document.hidden&&!stroke);const current=journal.current();if(current){current.roundNumber=lastRoundNumber+1;current.finalLocks=parameterLocks.toJSON();current.display=displaySettings();}
    const data=CellLabRounds.csv([...completedRounds,...(current?[current]:[])]),url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='cell-arena-rounds-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2200);}
  function fail(error){const message=String(error?.message||error);errors.push(message);$('run-state').textContent='发生错误';toast(message);}
  worker.onmessage=event=>{
    const m=event.data;
    if(m.type==='snapshot'){
      const previous=snapshot?.cells.find(c=>c.id===selected),next=m.data.cells.find(c=>c.id===selected);
      const family=m.data.observation?.rootBirth===observedBirth?m.data.observation:null;
      if(family){if(!family.cells.some(c=>c.id===selected))selected=family.cells[0]?.id||0;}
      else if(previous&&next&&previous.birth!==next.birth)selected=0;
      snapshot=m.data;if(snapshot.revision!==lastRevision){lastRevision=snapshot.revision;selected=0;observedBirth=0;adaptive.reset(performance.now());}
      autoRandom.observe(snapshot,performance.now());
      if(!setupBusy){if(journal.active&&journal.epoch!==snapshot.revision+':'+snapshot.seed)archiveRound('external-reset');if(!journal.active)journal.begin(snapshot,performance.now(),undefined,parameterLocks.toJSON(),displaySettings());journal.observe(snapshot,performance.now(),!document.hidden&&!stroke);}
      performanceContext();
      if(raster.width!==snapshot.width||raster.height!==snapshot.height){raster.width=snapshot.width;raster.height=snapshot.height;image=rctx.createImageData(snapshot.width,snapshot.height);}
      pendingFrame=m.frame||0;trajectories.sample(snapshot);dirty=true;uiPending=true;
      if(m.interactive)forceFrame=true;
      if(m.interactive||performance.now()-lastUISync>=performancePlan.uiMs){sync(!!m.interactive);lastUISync=performance.now();uiPending=false;}
      tickAutoRandom(performance.now());
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
  function sync(force=false){
    const s=snapshot;if(!s)return;
    $('play').textContent=s.playing?'Ⅱ 暂停':s.time===0?'▶ 开始':'▶ 继续';$('run-state').textContent=s.playing?'运行中':'已暂停';$('status-dot').style.background=s.playing?'var(--accent)':'#7b8d84';
    $('clock').textContent=s.time.toLocaleString();$('scene-title').textContent=s.scenario?.label||titles[s.scene]||s.scene;
    $('maze-score').hidden=!s.maze;
    $('maze-diffusion').hidden=!s.maze;
    if(s.maze){$('maze-diffusion').textContent=s.maze.signalThroughWalls?'招募扩散：穿墙':'招募扩散：沿通道';$('maze-diffusion').setAttribute('aria-pressed',!!s.maze.signalThroughWalls);}
    if(s.maze){const leader=s.maze.arrivals[0],parts=[leader?`首达 #${s.maze.arrivals.filter(a=>a.time===leader.time).map(a=>a.number).join("/")} · ${leader.time} MCS`:'向圆心出发'];$('maze-score').replaceChildren(...parts.map(text=>{const e=document.createElement('b');e.textContent=text;return e;}),...s.maze.racers.map(r=>{const e=document.createElement('span');e.textContent=`#${r.number} ${r.arrivedAt!==null?r.arrivedAt+' MCS':r.alive?'探索中':'已移除'}`;return e;}));}
    const scenario=s.scenario;$('scenario-guide').hidden=!scenario;
    $('scenario-phase').textContent=scenario?.phase||(s.vascular?.vessels.length?'血管灌注与循环补充':'');$('scenario-phase').classList.toggle('achieved',!!scenario?.achieved);
    if(scenario&&(force||panelVisible('scenario-guide'))){
      $('scenario-description').textContent=scenario.description;
      $('scenario-configuration').textContent=scenario.customized?'参数已调整':'预设参数';
      const initial=scenario.initial;
      $('scenario-setup').textContent=`开局：正常 ${initial.normal} · 肿瘤 ${initial.tumor} · 免疫 ${initial.immune}${initial.tumor?' · 非自身呈递高 '+initial.antigenPositive+'/'+initial.tumor:''}。种子 ${s.seed}；区域、参数和手动操作会改变演化。`;
      const values=['oncogenesis','random'].includes(s.scene)?[`癌前发生 ${s.counters.abnormalInitiations}`,`恶性转变 ${s.counters.malignantTransitions}`,`肿瘤分裂 ${scenario.tumorDivisions}`]:s.scene==='cold'?[`存活肿瘤 ${scenario.tumor}`,`原灶外肿瘤 ${scenario.farTumor}`,`远端分裂 ${scenario.distalDivisions}`]:[`残留肿瘤胞体 ${scenario.tumorBodies}`,`免疫清除 ${s.counters.kills}`,`清除后观察 ${scenario.clearanceElapsed} MCS`];
      $('scenario-metrics').textContent=values.join('　·　');
    }
    $('seed-label').textContent='种子 '+s.seed;
    $('statistics-play').textContent=s.playing?'Ⅱ 暂停':'▶ 继续';
    for(const b of document.querySelectorAll('[data-scene]')){const active=b.dataset.scene===s.scene;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);}
    const nextSettings=JSON.stringify(s.settings);if(nextSettings!==settingsKey){settingsKey=nextSettings;
      for(const [name,,,,,,suffix] of controls){if(document.activeElement!==$(name)&&!$(name).dataset.touchEditing)$(name).value=s.settings[name];$(name+'-out').textContent=Number($(name).value)+suffix;syncParameterInput(name);}
    }
    if(document.activeElement!==$('speed')&&!$('speed').dataset.touchEditing)$('speed').value=s.speed;$('speed-out').textContent=s.speed+'×';
    $('boundary').value=s.boundary;
    if(s.normalSupport){const n=s.normalSupport;$('normal-support-status').textContent=`正常保留 ${Math.round(n.retained*100)}%（${n.living}/${n.reference}） · 供给／清除 ${Math.round(n.factor*100)}%`+(n.reference?'':' · 尚未建立正常细胞基准');}
    $('tumor-morphology').value=s.settings.tumorMorphology;$('branch-sliders').hidden=!s.settings.tumorMorphology;
    $('networkAdhesion').disabled=s.settings.tumorMorphology!==2;
    $('branching').disabled=s.settings.tumorMorphology!==2;
    syncParameterInput('networkAdhesion');syncParameterInput('branching');
    $('network-status').textContent=s.settings.tumorMorphology===2?`当前稳定接触 ${s.cells.reduce((n,m)=>n+(m.networkDegree||0),0)/2} 对；各细胞保持独立胞体。`:'示例会重新播种一片肿瘤细胞，观察突起逐渐形成与连接。';
    $('seed-status').textContent=`当前 ${s.cells.length} 颗 · 按局部空间尝试加入`;
    if(force||panelVisible('statistics-panel')){
      CellLabImmuneUI.stats(s);lineageChart.update(s);
      const p=CellLabRounds.population(s);
      for(const kind of ['normal','abnormal','tumor','immune','endothelial'])$(kind+'-count').textContent=p[kind];
      const vas=s.vascular; $('vascular-statistics').hidden=!vas?.vessels?.length; if(vas){$('vessel-functional').textContent=vas.functional+' / '+vas.vessels.length;$('vessel-perfusion').textContent=Math.round(vas.meanPerfusion*100)+'%';$('vessel-immune').textContent=(s.counters.extravasations||0)+' / '+(s.counters.vascularArrivals||0);$('vessel-export').textContent=s.counters.bloodstreamExports||0;$('vessel-growth').textContent='血管出芽 '+vas.sprouts+' · 成熟 '+vas.matured+' · 生长中 '+vas.nascent+' · 平均交换质量 '+Math.round(vas.meanQuality*100)+'%';$('vessel-repair').textContent='内皮分裂 '+(s.counters.endothelialDivisions||0)+' · 内皮死亡 '+(s.counters.endothelialDeaths||0)+' · 循环返回 '+(s.counters.circulationReturns||0);}
      $('alive-count').textContent=p.total;$('resting-immune-count').textContent=p.immuneResting;$('activated-immune-count').textContent=p.immuneActive;$('suppressive-immune-count').textContent=p.immuneSuppressive;
      $('division-count').textContent=s.counters.divisions;$('malignant-count').textContent=s.counters.malignantTransitions;$('escape-count').textContent=s.immunity?.metrics.losses||0;
      $('immune-division-count').textContent='免疫分裂 '+s.counters.immuneDivisions;$('recognition-count').textContent=s.counters.recognitions;
      const patrol=s.patrol;$('patrol-coverage').textContent=(100*patrol.coverage).toFixed(1)+'%';$('patrol-checked').textContent=patrol.checkedCells;
      $('patrol-current').textContent='当前存活已检查 '+patrol.currentChecked+' / '+patrol.currentTargets;
      const deathNames={spontaneous:'自发凋亡',kill:'免疫杀伤',environment:'环境死亡',lifespan:'寿命凋亡'},totals=Object.values(s.deaths);
      $('total-death-count').textContent=totals.reduce((n,d)=>n+d.cleared,0);$('total-death-progress').textContent='清除中 '+totals.reduce((n,d)=>n+d.clearing,0);$('manual-removal-count').textContent=s.counters.manualRemoved||0;
      for(const [cause,prefix]of [['spontaneous','death'],['environment','environment-death'],['kill','kill'],['lifespan','lifespan-death']]){
        const d=s.deaths[cause]||{cleared:0,clearing:0,started:0},interrupted=s.manualDeathRemovals?.[cause]||0;$(prefix+'-count').textContent=d.cleared;$(prefix+'-progress').textContent='清除中 '+d.clearing+' · 已触发 '+d.started+(interrupted?' · 手动中止 '+interrupted:'');
      }
      for(const [list,records,clearance]of [['recent-clearances',s.recentClearances,true],['recent-deaths',s.recentDeaths,false]]){
        const node=$(list),stamp=JSON.stringify(records);if(node.dataset.records===stamp)continue;node.dataset.records=stamp;node.replaceChildren();
        for(const d of records.slice().reverse()){const li=document.createElement('li');li.textContent=(clearance?d.clearedAt:d.startedAt)+' MCS · #'+d.id+' · '+deathNames[d.cause]+' · '+(d.manuallyRemovedAt!=null?'手动擦除':d.clearedAt===null?'清除中':'已清除');node.append(li);}
        if(!records.length){const li=document.createElement('li');li.textContent='本局尚无死亡事件。';node.append(li);}
      }
      $('environment-count').textContent='环境死亡其中：正常 '+s.counters.normalEnvironmentDeaths+' · 癌前 '+s.counters.abnormalEnvironmentDeaths;
      $('mutation-count').textContent='性状突变 '+s.counters.mutations;
      $('stem-summary').textContent='肿瘤：干性 '+p.tumorStem+' · 分化 '+p.tumorDifferentiated;
      $('repair-summary').textContent='正常修复分裂 '+s.counters.normalDivisions+' · 复制损伤死亡触发 '+s.counters.replicationDeaths+'（计入环境死亡）';
      $('stem-events').textContent='不对称 '+s.counters.stemAsymmetric+' · 对称自我更新 '+s.counters.stemSelfRenewal+' · 对称分化 '+s.counters.stemDifferentiation+' · 干性重获 '+s.counters.stemReversions;
      $('abnormal-events').textContent='癌前发生 '+s.counters.abnormalInitiations+' · 癌前免疫清除 '+s.counters.abnormalKills;
      $('evolution-events').textContent='分裂遗传改变 '+(s.immunity?.metrics.geneticChanges||0)+' · 序列替换 '+(s.immunity?.metrics.substitutions||0)+' · 免疫启动 '+(s.immunity?.metrics.primed||0);
      $('immune-regulation-events').textContent='转抑制态 '+s.counters.suppressiveTransitions+' · 恢复静息态 '+s.counters.suppressiveRecoveries+' · 损伤退激活 '+s.counters.injuryDeactivations+' · 信号退激活 '+s.counters.signalDeactivations;
      $('grid-info').textContent=s.width+' × '+s.height+' 格点 · '+s.refinement+'× 精细度';
      for(const [key,label]of [['normal','正常'],['tumor','肿瘤'],['immune','免疫']]){const c=s.cycles?.[key];$('cycle-'+key).textContent=c?label+' · G0 '+c.G0+' · G1 '+c.G1+' · S '+c.S+' · G2 '+c.G2+' · M '+c.M+' · 周期阻滞 '+c.arrested:'';}
    }
    fullscreenView.update(s);
    $('rate').textContent=s.playing?(Math.round(s.rate)||'—'):'0';
    $('performance').textContent=`目标 ${s.targetRate} MCS / 秒 · ${s.limited?'算力不足，实际推进较慢；生长与分裂继续计算':'固定模型步长'}`;
    $('performance').classList.toggle('limited',s.limited);
    $('population-load').textContent=`当前 ${s.cells.length} 颗 · ${s.width} × ${s.height} 格点。${s.cells.length>=1000?'细胞较多，计算和交互可能变慢。':''}不按细胞数量冻结生长或分裂。`;
    $('backend-status').textContent=`绘图：${gpuRenderer&&!gpuRenderer.lost?(gpuRenderer.hardware===false?'WebGL2 软件':gpuRenderer.hardware===true?'WebGL2 GPU':'WebGL2'):'Canvas2D'} · 形变：${s.kernel==='wasm'?'WebAssembly CPU':s.kernel==='fast'?'优化 JS CPU':'参考 JS CPU'} · 微环境：${s.compute?.active==='gpu'?'WebGPU':'CPU'}`;
    $('render-performance').textContent=`画面更新 ${(s.playing?frameStats.fps:0).toFixed(1)} FPS · 绘制 ${frameStats.renderMs.toFixed(1)} ms · 数据打包 ${frameStats.snapshotMs.toFixed(1)} ms`;
    $('compute-note').textContent=(s.compute?.reason||'初始化计算后端…')+(s.kernelNote?' '+s.kernelNote:'');
    performanceReadout();
    if(!force&&!panelVisible('cell-inspector'))return;
    const cell=s.cells.find(c=>c.id===selected),phases={search:cell?.kind===3?(cell.patrolTurning?'巡逻转向':cell.immuneCue>.05?'局部趋化':cell.patrolScanning?'巡逻接触扫描':'持续巡逻'):'探索',scan:'接触扫描',kill:'识别后递送损伤',dying:CellLabDisplay.deathPhaseLabel(cell)};
    $('selection-label').textContent=cell?'#'+cell.id+' '+CellLabDisplay.cellName(cell):'未选中';
    $('divide').disabled=!cell||cell.dying||cell.state==='abnormal';
    if(cell){
      const lines=[`#${cell.id} ${CellLabDisplay.cellName(cell)} · 面积 ${(cell.area/s.refinement**2).toFixed(0)} · ${phases[cell.phase]}${cell.targetID?' · 接触 #'+cell.targetID:''}`,`氧 ${cell.oxygen.toFixed(2)} / 糖 ${cell.glucose.toFixed(2)} / 酸 ${cell.acid.toFixed(2)}`,`代谢效能 ${(cell.fitness*100).toFixed(0)}% · 累积压力 ${(cell.stress*100).toFixed(0)}% · 邻接拥挤 ${(cell.confinement*100).toFixed(0)}%`];
      lines.push(`子代 P${cell.generation} · 沿谱系分裂 ${cell.generation} 次`);
      const family=s.observation?.rootBirth===observedBirth?s.observation:null,member=family?.cells.find(c=>c.id===cell.id);
      if(member)lines.push(`观察谱系：相对第 ${member.generation} 代 · 标记 ${family.cells.length} 颗`);
      if(cell.state!=='abnormal'){
        const c=cell.cycle,reasons={'':'周期推进',disabled:'生长参数关闭',nutrients:'氧糖或代谢不足',acid:'酸负荷过高',injury:'累积损伤待恢复',lineage:'谱系分裂上限',exhaustion:'慢性刺激耗竭',suppression:'免疫抑制／再激活等待',antigen:'抗原记忆不足',il2:'IL-2 支持不足',space:'实际空间不足',growth:'等待胞体生长',geometry:'分裂几何受限',reserve:'营养储备不足',dna:'DNA 损伤检查点',contact:'接触抑制：缺少空隙'};
        lines.push(`细胞周期 ${c.phase} · 阶段进度 ${Math.round(c.progress*100)}%`,c.phase==='G0'&&!c.arrest?'整合增殖信号':reasons[c.arrest]);
      }
      if(cell.resources)lines.push(`能量储备 ${Math.round(cell.resources.energy*100)}% · 合成储备 ${Math.round(cell.resources.precursor*100)}% · DNA 损伤 ${Math.round(cell.resources.dnaDamage*100)}%`);
      if(cell.vesselID)lines.push('血管 #'+cell.vesselID+' · 内皮年龄 '+Math.round(cell.age)+' MCS','剩余修复分裂 '+cell.divisionsLeft+' 次 · 累积内皮损伤 '+Math.round((cell.endothelialInjury||0)*100)+'%');
      if(cell.vascularID)lines.push('血管 #'+cell.vascularID+' · '+({1:'管腔内循环',2:'跨内皮进入组织',3:'肿瘤跨内皮入血',4:'已进入管腔，等待灌注带离'}[cell.vascularPhase]||''));
      if(cell.kind===1&&cell.state==='normal')lines.push(`剩余修复分裂 ${cell.divisionsLeft} 次 · 空隙接触 ${Math.round(cell.freeFraction*100)}%`);
      if(cell.kind===2)lines.push(cell.isStem?'肿瘤干性：自我更新／分化':'分化肿瘤 · 剩余分裂 '+(cell.tumorDivisionsLeft===null?'无限制':cell.tumorDivisionsLeft+' 次'),`干性生态位记忆 ${Math.round(cell.stemNiche*100)}% · 性状资源代价 ${cell.traitEconomy.demand.toFixed(2)}×`);
      if(cell.state==='abnormal')lines.push(`癌前已持续 ${Math.floor(cell.abnormalAge)} MCS · 尚未获得肿瘤增殖／侵袭表型`,`抗原 ${cell.antigenLevel.toFixed(2)} · ${cell.antigen?'存在非自身呈递':'当前呈递低'} · 杀伤损伤 ${(cell.damage*100).toFixed(0)}%`);
      if(cell.kind===1)lines.push(`局部炎性信号 ${(100*(cell.inflammatorySignal||0)).toFixed(0)}% · 累积暴露 ${(100*(cell.inflammatoryExposure||0)).toFixed(0)}%`);
      if(cell.kind!==3&&!cell.vesselID){
        lines.push(`环境致变压力 ${Math.round(cell.mutationPressure*100)}%`);
        if(cell.kind===1)lines.push(`耐受性状 ${cell.normalTolerance.toFixed(2)}`);
        if(cell.kind===2||cell.state==='abnormal')lines.push(`有效免疫接触 ${cell.immuneEncounters} 次 · 接触选择记忆 ${Math.round(cell.immuneContactMemory*100)}%`,`持续招募暴露 ${Math.round(cell.recruitmentExposure*100)}%`);
        if(cell.lastAntigenChange)lines.push(`表达干预 · ${cell.lastAntigenChange.time} MCS`);
      }
      if(cell.sectionFraction!==undefined)lines.push(`切面目标 ${(cell.sectionFraction*100).toFixed(0)}% · 切面外储量 ${(cell.offPlaneTarget/s.refinement**2).toFixed(1)} · 总目标量 ${(cell.target/s.refinement**2).toFixed(1)}`);
      if(cell.kind===2){const g=cell.genome;lines.push(`克隆 #${cell.clone} · 第 ${cell.generation} 代 · 杀伤损伤 ${(cell.damage*100).toFixed(0)}%`,`遗传：耐受 ${g.tolerance.toFixed(2)} / 增殖 ${g.proliferation.toFixed(2)} / 侵袭 ${g.invasion.toFixed(2)}`,`当前抗原呈递 ${cell.antigenLevel.toFixed(2)} · 识别取决于克隆匹配`);}
      if(cell.kind===3)lines.push(`第 ${cell.generation} 代 · 剩余分裂 ${cell.divisionsLeft} 次`,`激活 ${Math.ceil(cell.activation)} MCS · 招募 ${Math.ceil(cell.recruitment)} MCS`);
      if(cell.kind===3)lines.push(`抗原刺激记忆 ${Math.round(cell.antigenMemory*100)}% · 慢性耗竭 ${Math.round(cell.exhaustion*100)}%`,`局部 IL-2 ${cell.il2.toFixed(3)} · 扩增响应 ${Math.round(cell.il2Response*100)}%`);
      if(cell.kind===3)lines.push(`正常损伤暴露 ${Math.round(cell.normalDamageExposure*100)}% · 局部抑制信号 ${cell.inhibition.toFixed(3)}`,cell.immunePhenotype==='suppressive'?'抑制样表型：趋向正常损伤，分泌抑制信号；暴露降低后可恢复粉色':`再激活等待 ${Math.ceil(cell.immuneRefractory)} MCS`);
      if(cell.kind===3)lines.push('累计致死肿瘤 '+(cell.tumorKills||0)+' / '+(s.settings.immuneKillLimit||'不限')+' 颗');
      if(cell.kind===3)lines.push(`本细胞已检查 ${cell.patrolChecked} 颗不同组织细胞`);
      if(cell.kind===2&&cell.origin==='normal')lines.push(`源自正常细胞 · ${cell.transformedAt} MCS 恶性转变`);
      if(cell.kind===2&&cell.morphologyMode)lines.push(`${cell.morphologyMode===2?'动态分枝':'梭形双极'} · 伸展／回缩中的突起 ${cell.branchCount} 处 · 稳定接触 ${cell.networkDegree||0} 个邻居`);
      if(cell.dying)lines.push('死亡原因：'+({environment:'持续代谢压力',kill:'免疫递送损伤',spontaneous:'自发凋亡',lifespan:cell.vesselID?'内皮年龄相关凋亡':'达到累计肿瘤杀伤上限'}[cell.deathCause]||cell.deathCause),`触发死亡：${cell.deathStartedAt} MCS · 清除中 ${s.time-cell.deathStartedAt} MCS`);
      $('inspection').textContent=lines.join('\n');
    }else{selected=0;$('inspection').textContent='点击细胞，查看局部代谢、活性、抗原、遗传性状与剩余分裂次数。';}
    CellLabImmuneUI.selection(cell,s);
  }
  $('clone-history-type').addEventListener('change',()=>{if(snapshot)CellLabImmuneUI.stats(snapshot);});
  function fitCanvas(){
    const ratio=snapshot?snapshot.width/snapshot.height:4/3,zoom=Number($('zoom').value)/100,w=viewport.clientWidth,h=viewport.clientHeight;
    const full=fullscreenView.frame(ratio);
    if(full){canvas.style.width=full.boardWidth+'px';canvas.style.height=full.boardHeight+'px';canvas.style.transform='translate(-50%,-50%)';return;}
    const base=$('view-fit').value==='contain'?Math.min(w,h*ratio):Math.max(w,h*ratio);
    const width=base*zoom,height=width/ratio,maxX=Math.max(0,(width-w)/2),maxY=Math.max(0,(height-h)/2);
    view.x=Math.max(-maxX,Math.min(maxX,view.x));view.y=Math.max(-maxY,Math.min(maxY,view.y));
    const transform=`translate(-50%,-50%) translate(${view.x}px,${view.y}px)`;
    if(canvas.style.width!==width+'px')canvas.style.width=width+'px';if(canvas.style.height!==height+'px')canvas.style.height=height+'px';if(canvas.style.transform!==transform)canvas.style.transform=transform;
  }
  function resizeDisplay(){
    fitCanvas();
    const cssWidth=Math.max(1,parseFloat(canvas.style.width)||canvas.clientWidth),choice=$('render-resolution').value;
    const {width,height}=adaptive.display({cssWidth,ratio:snapshot.width/snapshot.height,dpr:devicePixelRatio||1,manualWidth:choice==='auto'?0:Number(choice),recordingScale});
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const description=`当前显示／PNG：${width} × ${height} 像素；物理格点 ${snapshot.width} × ${snapshot.height}`;
    if($('render-info').dataset.source!==description){$('render-info').dataset.source=description;$('render-info').textContent=description;}
    return width/cssWidth;
  }
  let mazeWallCache=null,antigenOutlineCache=null;
  function drawAntigenOutlines(s,scale,pixelRatio){
    if(antigenOutlineCache?.snapshot!==s){
      const paths=new Map(),styles=displayCache.antigens(s).outlines,w=s.width,h=s.height,grid=s.grid,wrap=s.boundary==='wrap';
      const line=(id,other,x,y,xx,yy)=>{if(id===other)return;const outline=styles.get(id);if(!outline)return;const style=CellLabDisplay.antigenSegment(outline,(x+xx)/2,(y+yy)/2,s),alpha=Math.round(style.alpha*8)/8,key=style.color+':'+alpha;let batch=paths.get(key);if(!batch){batch={color:style.color,alpha,path:new Path2D()};paths.set(key,batch);}batch.path.moveTo(x,y);batch.path.lineTo(xx,yy);};
      // Each side of a shared membrane retains its own lineage color. Cache in
      // lattice coordinates; use the same genotype/color table as WebGL.
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const q=y*w+x,id=grid[q];if(!styles.has(id))continue;
        line(id,x<w-1?grid[q+1]:wrap?grid[y*w]:0,x+.82,y,x+.82,y+1);
        line(id,x>0?grid[q-1]:wrap?grid[q+w-1]:0,x+.18,y,x+.18,y+1);
        line(id,y<h-1?grid[q+w]:wrap?grid[x]:0,x,y+.82,x+1,y+.82);
        line(id,y>0?grid[q-w]:wrap?grid[(h-1)*w+x]:0,x,y+.18,x+1,y+.18);
      }
      antigenOutlineCache={snapshot:s,paths:[...paths.values()]};
    }
    ctx.save();ctx.scale(scale,scale);ctx.lineWidth=1.3*pixelRatio/scale;ctx.lineJoin='miter';ctx.lineCap='butt';for(const batch of antigenOutlineCache.paths){ctx.strokeStyle=batch.color;ctx.globalAlpha=batch.alpha;ctx.stroke(batch.path);}ctx.restore();
  }
  function drawMazeWalls(ctx,s,scale){
    const m=s.maze;if(!m?.curves?.length)return;
    const key=[s.seed,s.width,s.height,m.wallID,m.curves.length,m.cutouts.length,canvas.width,canvas.height].join(':');
    if(mazeWallCache?.key!==key){
      const layer=document.createElement('canvas');layer.width=canvas.width;layer.height=canvas.height;const c=layer.getContext('2d');
      c.scale(scale,scale);c.translate(m.cx,m.cy);c.lineWidth=m.wallWidth;c.lineCap='butt';c.lineJoin='miter';c.strokeStyle='#596d6f';c.beginPath();
      for(const curve of m.curves)if(curve[0]===0){const [,r,a,b]=curve;c.moveTo(r*Math.cos(a),r*Math.sin(a));c.arc(0,0,r,a,b);}c.stroke();
      c.lineCap='butt';c.beginPath();for(const curve of m.curves)if(curve[0]===1){c.moveTo(curve[1],curve[2]);c.lineTo(curve[3],curve[4]);}c.stroke();
      c.translate(-m.cx,-m.cy);c.globalCompositeOperation='destination-out';for(const [x,y,r]of m.cutouts){c.beginPath();c.arc(x,y,r,0,2*Math.PI);c.fill();}
      mazeWallCache={key,layer};
    }
    ctx.drawImage(mazeWallCache.layer,0,0);
  }
  function drawSelection(s,scale,pixelRatio){
    const members=s.observation?.rootBirth===observedBirth?s.observation.cells:[{id:selected,generation:0}];
    const boxes=displayCache.selections(s,members.map(c=>c.id));if(!boxes.size)return;
    const palette=['#ffba52','#cb8cff','#77c5ff','#ff91bb','#a9d968'];
    const wrap=s.boundary==='wrap',pad=3*pixelRatio,inset=2*pixelRatio;
    ctx.save();ctx.setLineDash([]);ctx.lineCap='square';ctx.lineJoin='miter';
    for(const member of members){const box=boxes.get(member.id);if(!box)continue;const labels=[];ctx.beginPath();
    for(const dx of wrap?[-s.width,0,s.width]:[0])for(const dy of wrap?[-s.height,0,s.height]:[0]){
      if(box.right+dx<=0||box.left+dx>=s.width||box.bottom+dy<=0||box.top+dy>=s.height)continue;
      const l=Math.max(inset,(box.left+dx)*scale-pad),r=Math.min(canvas.width-inset,(box.right+dx)*scale+pad);
      const t=Math.max(inset,(box.top+dy)*scale-pad),b=Math.min(canvas.height-inset,(box.bottom+dy)*scale+pad),leg=Math.min(11*pixelRatio,(r-l)*.28,(b-t)*.28);
      for(const [x,y,sx,sy]of [[l,t,1,1],[r,t,-1,1],[l,b,1,-1],[r,b,-1,-1]]){ctx.moveTo(x+sx*leg,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*leg);}
      if(member.generation>0)labels.push([r,t]);
    }
    const color=member.generation?palette[(member.generation-1)%palette.length]:'#37e3dc';
    ctx.strokeStyle='#173946';ctx.lineWidth=4*pixelRatio;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2*pixelRatio;ctx.stroke();
    ctx.font=`bold ${10*pixelRatio}px Consolas,monospace`;ctx.textAlign='right';ctx.textBaseline='top';
    for(const [x,y]of labels){const text=String(member.generation),width=ctx.measureText(text).width+4*pixelRatio;ctx.fillStyle='#173946';ctx.fillRect(x-width,y+2*pixelRatio,width,12*pixelRatio);ctx.fillStyle=color;ctx.fillText(text,x-2*pixelRatio,y+3*pixelRatio);}
    }ctx.restore();
  }
  function render(){
    if(!snapshot||!image)return;const renderStart=performance.now(),s=snapshot,w=s.width,h=s.height,grid=s.grid,data=image.data,meta=[];
    lastRender=renderStart;forceFrame=false;
    const pixelRatio=resizeDisplay(),bodies=[];for(const c of s.cells){meta[c.id]=c;bodies[c.id]=CellLabDisplay.bodyColor(c,cellColors);}
    const view=$('field-view').value,wrap=s.boundary==='wrap',seams=$('cell-seams').checked,showNuclei=$('nuclei').checked,showAntigen=$('antigen-marks').checked,showCycle=$('cycle-marks').checked;
    const protect=$('protect-bodies').checked,{field,info,signal,bodySignal}=displayCache.get(s,view,signalLayers,opacity,protect),environmentOpacity=opacity[view]??0,bodyEnvironmentOpacity=CellLabDisplay.bodyOpacity(environmentOpacity,protect);
    const actFlags=[0,...['normal-activity','tumor-activity','immune-activity'].map(id=>$('edge-activity').checked&&$(id).checked?1:0)];
    const nextLegend=JSON.stringify([view,[...signalLayers],opacity,protect,actFlags,showAntigen,showCycle,!!s.maze,cellColors.proliferationShading,cellColors.tumorTrait]);
    if(legendKey!==nextLegend){legendKey=nextLegend;
    const legend=[];if(info)legend.push(info.label+' · '+info.description);
    if(s.maze&&signalLayers.has('trail'))legend.push('迷宫招募场：0—30 固定色标，圆心持续供给，入口清除。');
    if(signal&&!s.maze)legend.push([...signalLayers].map(k=>CellLabDisplay.SIGNALS[k].label).join('、')+'：增强低浓度显示，非线性固定色标；重叠混色，原始浓度见悬停。');
    if(!legend.length)legend.push(actFlags.some(Boolean)?'Act：红＝新生突起 → 黄 → 绿＝活性衰减；零活性恢复胞体色。':'胞体与胞核颜色可在「细胞配色」调整；免疫激活由真实接触识别触发。'+(cellColors.proliferationShading?(cellColors.tumorTrait==='antigenLevel'?'胞体显示当前非自身抗原呈递（0–1 固定色标），可能随环境恢复。':'胞体显示所选遗传性状（0.25–3 固定色标），不是当前周期或移动速度。'):''));
    $('field-legend').textContent=legend.join(' ｜ ');$('heat-key').hidden=!info;
    if(info){$('heat-ramp').style.background='linear-gradient(90deg,'+[info.low,info.middle,info.high].filter(Boolean).map(c=>'rgb('+c.join(',')+')').join(',')+')';$('heat-scale').textContent=view==='adversity'?'友好 0 → 1 恶劣':'0 → 1';}
    updateOverlayButtons();syncOpacity();
    document.querySelector('.edge-key').hidden=!actFlags.some(Boolean);
    document.querySelector('.antigen-key').hidden=!showAntigen;
    document.querySelector('.cycle-key').hidden=!showCycle;
    }
    const edgeFade=Number($('body-feather').value)/100,surface=edgeFade>0?surfaceCache.get(s):null;
    CellLabImmuneUI.legend(s,showAntigen);
    let gpu=false;if(gpuRenderer)try{gpu=gpuRenderer.draw(ctx,s,{actFlags,seams,selected,showAntigen,antigenStyles:displayCache.antigens(s),field,info,signal,bodySignal,environmentOpacity,bodyEnvironmentOpacity,pixelRatio,cellColors,surface,edgeFade});}catch(e){rendererFailure=String(e);gpuRenderer.lost=true;}
    if(!gpu){
    const bodySurface=surface?.scale>1?surfaceCache.full(s):surface;
    for(let q=0;q<grid.length;q++){
      const x=q%w,y=(q/w)|0,id=grid[q],m=meta[id];let rgb;
      const kind=CellLabDisplay.displayKind(m),base=m?bodies[id]:colors[0];rgb=base;let under=colors[0];
      if(field){const value=field.values[Math.floor(y/s.fieldScale)*field.width+Math.floor(x/s.fieldScale)];
        const heat=info.palette[kind][Math.min(255,Math.max(0,Math.round(value*255)))],alpha=m?bodyEnvironmentOpacity:environmentOpacity;rgb=base.map((v,k)=>v+(heat[k]-v)*alpha);if(surface&&m)under=under.map((v,k)=>v+(heat[k]-v)*environmentOpacity);
      }
      if(signal){const layer=m?bodySignal:signal,p=(Math.floor(y/s.fieldScale)*layer.width+Math.floor(x/s.fieldScale))*4,a=layer.rgba[p+3]/255;rgb=rgb.map((v,k)=>v+(layer.rgba[p+k]-v)*a);if(surface&&m){const a=signal.rgba[p+3]/255;under=under.map((v,k)=>v+(signal.rgba[p+k]-v)*a);}}
      if(s.walls[q]&&id!==s.maze?.wallID){const hatch=(x+y)%7<2;rgb=hatch?[66,83,87]:colors[4];}
      if(m){
        if(m.dying)rgb=CellLabDisplay.deathColor(rgb,m);
        if(bodySurface&&m.kind>0&&m.kind<4){const alpha=1-edgeFade*(1-bodySurface.interior[q]/255);rgb=rgb.map((v,k)=>under[k]+(v-under[k])*alpha);}
        if(!m.dying&&actFlags[m.kind]&&s.activity[q]>0)rgb=activityPalette[s.activity[q]];
      }
      const k=q*4;data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
    }
    rctx.putImageData(image,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(raster,0,0,canvas.width,canvas.height);
    }
    const scale=canvas.width/w;
    if(trajectories.enabled){ctx.save();ctx.globalAlpha=.65;ctx.lineWidth=1.25*pixelRatio;for(const path of trajectories.paths.values()){ctx.strokeStyle=cellColors[['','normal','tumor','immune'][path.kind]].nucleus;ctx.beginPath();path.points.forEach((p,i)=>{if(!i||p.break)ctx.moveTo(p.x*scale,p.y*scale);else ctx.lineTo(p.x*scale,p.y*scale);});ctx.stroke();}ctx.restore();}
    ctx.save();ctx.lineWidth=1.1*pixelRatio;ctx.setLineDash([3*pixelRatio,3*pixelRatio]);for(const source of s.sources||[]){ctx.strokeStyle=({trail:'#8654ad',danger:'#c26a2a',cohesion:'#238b74',il2:'#1f92cd',normalDamage:'#c96e42',inhibition:'#395bc9',oxygen:'#318ab5',glucose:'#9a802f',acid:'#b34d51',nutrient:'#378597',hostile:'#a04d41'})[source.type];for(const dx of wrap?[-s.width,0,s.width]:[0])for(const dy of wrap?[-s.height,0,s.height]:[0]){const x=source.x+dx,y=source.y+dy;if(x+source.radius<0||x-source.radius>s.width||y+source.radius<0||y-source.radius>s.height)continue;ctx.beginPath();ctx.arc(x*scale,y*scale,source.radius*scale,0,2*Math.PI);ctx.stroke();}}ctx.restore();
    drawMazeWalls(ctx,s,scale);
    // Optional subpixel display seams; these never enter the lattice mechanics.
    if(!gpu&&(seams||selected)){const paths=[new Path2D(),new Path2D(),new Path2D(),new Path2D()];ctx.lineWidth=.55*pixelRatio;ctx.globalAlpha=(.9-.65*edgeFade)/.9;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const q=y*w+x,id=grid[q];if(!meta[id]||(!seams&&id!==selected))continue;
        const path=paths[CellLabDisplay.immuneSuppressive(meta[id])?3:meta[id].kind===1?0:meta[id].kind===3&&!CellLabDisplay.immuneActive(meta[id])?2:1];
        const right=x<w-1?grid[q+1]:(wrap?grid[q-w+1]:0),down=y<h-1?grid[q+w]:(wrap?grid[x]:0);
        if(right!==id){path.moveTo((x+1)*scale,y*scale);path.lineTo((x+1)*scale,(y+1)*scale);}if(down!==id){path.moveTo(x*scale,(y+1)*scale);path.lineTo((x+1)*scale,(y+1)*scale);}}
      ctx.strokeStyle='#626e6de6';ctx.stroke(paths[0]);ctx.strokeStyle='#e1e6e1e6';ctx.stroke(paths[1]);
      ctx.strokeStyle='#803d46e6';ctx.stroke(paths[2]);ctx.strokeStyle='#1a456be6';ctx.stroke(paths[3]);ctx.globalAlpha=1;
    }
    if(showAntigen&&!gpu)drawAntigenOutlines(s,scale,pixelRatio);
    drawVessels(s,scale,pixelRatio);
    if(showNuclei){ctx.save();ctx.scale(scale,scale);ctx.lineWidth=1.5*pixelRatio/scale;for(const batch of displayCache.nucleusBatches(s,cellColors)){ctx.fillStyle=batch.fill;ctx.strokeStyle=batch.stroke;ctx.fill(batch.path);ctx.stroke(batch.path);}ctx.restore();}
    // Post-clearance membrane fragments are cosmetic, never extra cells.
    // Their age uses model time, so pausing also freezes the rupture effect.
    ctx.save();ctx.lineWidth=Math.max(1,pixelRatio);
    for(const effect of s.deathEffects||[]){const t=Math.max(0,(s.time-effect.startedAt)/effect.duration);if(t>=1)continue;ctx.globalAlpha=(1-t)*.85;ctx.strokeStyle='#cf851f';ctx.fillStyle='#f8be54';
      const count=11+effect.birth%7,variation=n=>{const v=Math.sin(n*12.9898+effect.birth*78.233)*43758.5453;return v-Math.floor(v);};
      for(let n=0;n<count;n++){const angle=(n+variation(n)*.75)*2*Math.PI/count+effect.birth*.37,radius=effect.radius*(.45+variation(n+21)*.55+t*(.4+variation(n+43)));let x=effect.x+Math.cos(angle)*radius,y=effect.y+Math.sin(angle)*radius;
        if(wrap){x=(x+w)%w;y=(y+h)%h;}if(x<0||y<0||x>=w||y>=h)continue;const q=Math.floor(y)*w+Math.floor(x);if(s.walls[q]||s.grid[q])continue;
        const size=(.45+variation(n+67))*(1-.6*t)*s.refinement;ctx.beginPath();ctx.ellipse((x+.5)*scale,(y+.5)*scale,size*scale,size*(.3+.4*variation(n+83))*scale,angle+variation(n+97)*Math.PI+t,0,Math.PI*2);ctx.fill();ctx.stroke();
      }
    }ctx.restore();
    if(showCycle){
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=2.5*pixelRatio;ctx.strokeStyle='#fff8eb';ctx.fillStyle='#243c49';
      for(const m of s.cells){const text=CellLabDisplay.cycleText(m);if(!text)continue;ctx.fillStyle=CellLabDisplay.cycleColor(m);
        const size=Math.max(8,Math.min(12,Math.sqrt(m.area)*scale/pixelRatio*.65));ctx.font=`bold ${size*pixelRatio}px Consolas, monospace`;
        for(const dx of wrap?[-w,0,w]:[0])for(const dy of wrap?[-h,0,h]:[0]){const x=((m.hasNucleus?m.nucleusX:m.x)+dx+.5)*scale,y=((m.hasNucleus?m.nucleusY:m.y)+dy+.5)*scale,pad=size*pixelRatio*1.5;if(x<-pad||y<-pad||x>canvas.width+pad||y>canvas.height+pad)continue;ctx.strokeText(text,x,y);ctx.fillText(text,x,y);}
      }ctx.restore();
    }
    if($('arrows').checked){ctx.strokeStyle='#203731a6';ctx.lineWidth=1.6*pixelRatio;for(const m of s.cells)if(!m.dying){const x=m.x*scale,y=m.y*scale,dx=m.px*14*pixelRatio,dy=m.py*14*pixelRatio;ctx.beginPath();ctx.moveTo(x-dx*.35,y-dy*.35);ctx.lineTo(x+dx,y+dy);ctx.lineTo(x+dx*.6-dy*.22,y+dy*.6+dx*.22);ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx*.6+dy*.22,y+dy*.6-dx*.22);ctx.stroke();}}
    if(s.maze){const maze=s.maze;ctx.save();ctx.strokeStyle='#825a21';ctx.lineWidth=2*pixelRatio;ctx.beginPath();ctx.arc(maze.cx*scale,maze.cy*scale,maze.goalRadius*scale,0,2*Math.PI);ctx.stroke();ctx.font=`bold ${12*pixelRatio}px Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#5d3e21';ctx.fillText('◎',maze.cx*scale,maze.cy*scale);for(const r of maze.racers){const m=meta[r.id];if(!m||m.birth!==r.birth)continue;const x=(m.nucleusX??m.x)*scale,y=(m.nucleusY??m.y)*scale-(showCycle?14*pixelRatio:0);ctx.lineWidth=3*pixelRatio;ctx.strokeStyle='#fff5e6';ctx.strokeText(String(r.number),x,y);ctx.fillStyle='#80342d';ctx.fillText(String(r.number),x,y);}ctx.restore();}
    if(s.boundary==='solid'){const edge=5*pixelRatio;ctx.strokeStyle='#546668';ctx.lineWidth=edge;ctx.strokeRect(edge/2,edge/2,canvas.width-edge,canvas.height-edge);}
    if(selected&&meta[selected]){drawSelection(s,scale,pixelRatio);if($('immune-links').checked)CellLabImmuneUI.links(ctx,s,selected,scale,pixelRatio);}
    // The full population history remains in the model/export. Its small plot
    // follows the 10 Hz sidebar cadence, independently of membrane rendering.
    if(performance.now()-lastHistoryDraw>=performancePlan.uiMs||!s.playing){drawHistory();lastHistoryDraw=performance.now();}
    dirty=false;probeDirty=true;
    frameStats.renderMs=performance.now()-renderStart;frameStats.snapshotMs=s.snapshotMs||0;
    if(frameStats.time!==s.time||frameStats.revision!==s.revision){frameStats.count++;frameStats.time=s.time;frameStats.revision=s.revision;adaptive.sample({renderMs:frameStats.renderMs,snapshotMs:frameStats.snapshotMs,stepMs:s.stepMs,rate:s.rate,targetRate:s.targetRate});}
    const elapsed=performance.now()-frameStats.since;if(elapsed>=1000){frameStats.fps=frameStats.count*1000/elapsed;frameStats.count=0;frameStats.since=performance.now();}
    if(pendingFrame){worker.postMessage({command:'framePresented',frame:pendingFrame});pendingFrame=0;}
  }
  function drawHistory(){
    if(!panelVisible('history'))return;
    historyChart.update(snapshot,recordingScale);
  }
  const hints={move:'拖动时暂停 · 邻居让位 · 松手恢复',seed:'单击加入一颗 · 可尝试挤入已有细胞区域',signal:'单击瞬释 · 长按连释 · 双击建源',wall:'在空白处拖动画墙',remove:'擦除细胞、场源与障碍 · 重置局部环境',inspect:'点击细胞查看状态与局部环境'};
  function setTool(value){
    signalGesture.cancel();
    if(stroke&&!stroke.ending)void endStroke();
    tool=value;canvas.title='';if(tool!=='inspect')$('field-probe').hidden=true;for(const b of document.querySelectorAll('[data-tool]')){const on=b.dataset.tool===tool;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);}
    $('tool-hint').textContent=hints[tool];
    $('seed-options').hidden=tool!=='seed';$('signal-options').hidden=tool!=='signal';$('wall-options').hidden=tool!=='wall';$('eraser-options').hidden=tool!=='remove';probeDirty=true;
    canvas.style.cursor=tool==='move'?'grab':tool==='inspect'?'pointer':'crosshair';
  }
  function point(e){const r=canvas.getBoundingClientRect(),[x,y]=CellLabFullscreen.coordinates(r,e.clientX,e.clientY,fullscreenView.rotated);return [Math.max(0,Math.min(snapshot.width-1,Math.floor(x*snapshot.width))),Math.max(0,Math.min(snapshot.height-1,Math.floor(y*snapshot.height)))];}
  function drawVessels(s,scale,pixelRatio){
    if(!s.vascular?.vessels.length)return;
    ctx.save();ctx.lineWidth=1.2*pixelRatio;ctx.font=`${Math.max(9,10*pixelRatio)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const v of s.vascular.vessels){if(!v.active)continue;const x=v.x*scale,y=v.y*scale,r=v.radius*scale;ctx.strokeStyle=v.perfusion>.05?'#347f84aa':'#997b65aa';ctx.fillStyle=v.perfusion>.05?'#286b73':'#876648';ctx.setLineDash([3*pixelRatio,4*pixelRatio]);ctx.beginPath();ctx.arc(x,y,Math.max(1,r-2*pixelRatio),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      const index=Math.round(v.y)*s.width+Math.round(v.x);if(!s.grid[index])ctx.fillText(Math.round(v.perfusion*100)+'%',x,y);
    }ctx.restore();
  }
  function updateProbe(){
    probeDirty=false;const box=$('field-probe'),brush=$('brush-preview');brush.hidden=true;if(!hover||!snapshot||panGesture){box.hidden=true;return;}
    const r=canvas.getBoundingClientRect(),v=document.querySelector('.viewport').getBoundingClientRect(),{clientX,clientY}=hover;
    if(clientX<Math.max(r.left,v.left)||clientX>=Math.min(r.right,v.right)||clientY<Math.max(r.top,v.top)||clientY>=Math.min(r.bottom,v.bottom)){box.hidden=true;return;}
    if(tool==='remove'){const diameter=2*Number($('eraser-radius').value)*snapshot.refinement*parseFloat(canvas.style.width)/snapshot.width,[x,y]=CellLabFullscreen.coordinates(stage.getBoundingClientRect(),clientX,clientY,fullscreenView.rotated);brush.style.width=diameter+'px';brush.style.height=diameter+'px';brush.style.left=x*stage.clientWidth+'px';brush.style.top=y*stage.clientHeight+'px';brush.hidden=false;box.hidden=true;return;}
    if(stroke||tool!=='inspect'||performance.now()-hoverMovedAt>=10000){box.hidden=true;return;}
    const [x,y]=point(hover),sample=CellLabDisplay.sample(snapshot,x,y);if(!sample){box.hidden=true;return;}
    $('probe-position').textContent=`位置 ${x}, ${y} · ${sample.time} MCS`;
    $('probe-cell').textContent=sample.wall?'实体障碍':sample.cell?`#${sample.cell.id} ${CellLabDisplay.cellName(sample.cell)}${sample.cell.dying?' · '+CellLabDisplay.deathPhaseLabel(sample.cell):''}`:'培养液';
    for(const key of ['oxygen','glucose','acid','cohesion','danger','trail','il2','normalDamage','inhibition'])$('probe-'+key).textContent=sample.blocked?'—':sample.values[key].toFixed(3);
    $('probe-note').textContent=sample.blocked?'该环境格被实体障碍阻断，暂无有效浓度。':'氧／糖／酸为 0–1 模型量；因子为模型浓度，无实验单位。读数来自当前位置的环境网格。';
    box.hidden=false;const rect=box.getBoundingClientRect();box.style.left=Math.max(8,Math.min(innerWidth-rect.width-8,clientX+15))+'px';box.style.top=Math.max(8,Math.min(innerHeight-rect.height-8,clientY+15))+'px';
  }
  let stroke=null,queuedPoint=null,flushTimer=0,lastAction=Promise.resolve(),dragSerial=0;
  let signalInFlight=0;
  const signalGesture=new CellLabSignalGesture({emit(mode,{point:p,type,radius}){
    // Continuous brush samples coalesce under load instead of accumulating RPCs.
    if(mode==='repeat'&&signalInFlight)return;
    if(['oxygen','glucose','acid'].includes(type))$('field-view').value=type;
    else if(type==='nutrient'||type==='hostile')$('field-view').value=type==='nutrient'?'glucose':'adversity';
    else signalLayers.add(type);
    updateOverlayButtons();dirty=true;signalInFlight++;
    lastAction=rpc(mode==='source'?'source':'pulse',{x:p[0],y:p[1],channel:type,type,radius}).catch(fail).finally(()=>signalInFlight--);
  }});
  function seedFeedback(result){
    const reasons={lumen:'管腔仅接收循环免疫细胞，请在血管外放置组织细胞',vascular:'不能把内皮或组织胞体直接拖过血管基底膜',geometry:'血管空间不足或与现有血管过近',occupied:'此处完整胞体会碰到已有细胞',crowded:'局部挤入失败：核区或切面让位额度不足，周围细胞保持原状',wall:'此处被实体障碍挡住',edge:'胞体会超出实体边界，请向内移动',nucleus:'这处空间放不下完整核区',invalid:'新增参数无效',space:'随机尝试未找到足够空隙，可在画布上单击尝试挤入'};
    const added=result.added??(result.id?1:0),message=added?(result.id?(result.vessel?'加入了血管 #':'加入了细胞 #')+result.id:`加入了 ${added} / ${result.requested} 颗细胞`):'未加入细胞';
    toast(message+(result.inserted?`；已挤入，${result.displaced} 颗邻居让位`:'')+(result.reason?'；'+(reasons[result.reason]||result.reason):''));
  }
  function applyPointer(p,first=false){
    if(!stroke||!snapshot)return;
    if(tool==='move'){
      if(stroke.id){lastAction=rpc('move',{id:stroke.id,token:stroke.token,elastic:true,x:p[0]+stroke.offset[0],y:p[1]+stroke.offset[1]}).then(r=>{if(r.blocked&&!r.stale&&!stroke?.warned){toast('前方是实体边界，或局部空间不足以容纳完整核区');if(stroke)stroke.warned=true;}}).catch(fail);}
    }else if(tool==='remove'){
      const radius=Number($('eraser-radius').value),before=stroke.previous||p,n=Math.max(1,Math.ceil(Math.hypot(p[0]-before[0],p[1]-before[1])/Math.max(1,radius*snapshot.refinement*.5))),points=[],gesture=stroke;
      for(let i=0;i<=n;i++)points.push([before[0]+(p[0]-before[0])*i/n,before[1]+(p[1]-before[1])*i/n]);
      lastAction=rpc('eraseAll',{points,radius}).then(r=>gesture.removed=(gesture.removed||0)+r.removed).catch(fail);
    }else if(tool==='wall'){
      const before=stroke.previous||p,n=Math.max(Math.abs(p[0]-before[0]),Math.abs(p[1]-before[1]),1),points=[];
      for(let i=0;i<=n;i++)points.push([Math.round(before[0]+(p[0]-before[0])*i/n),Math.round(before[1]+(p[1]-before[1])*i/n)]);
      lastAction=rpc('stroke',{points,erase:false}).catch(fail);
    }else if(tool==='signal'&&eraseSource){
      lastAction=rpc('source',{x:p[0],y:p[1],radius:Number($('source-radius').value),erase:true}).catch(fail);
    }else if(tool==='seed'&&first){lastAction=rpc('seed',{kind:$('seed-kind').value==='vessel'?'vessel':Number($('seed-kind').value),x:p[0],y:p[1],manual:true,push:true}).then(seedFeedback).catch(fail);}
    stroke.previous=p;
  }
  function flush(){clearTimeout(flushTimer);flushTimer=0;if(queuedPoint){const p=queuedPoint;queuedPoint=null;applyPointer(p);}return lastAction;}
  canvas.addEventListener('pointerdown',e=>{
    if(stroke||panGesture)return;
    if(e.button===1||(e.button===0&&e.altKey)){signalGesture.cancel();e.preventDefault();canvas.setPointerCapture(e.pointerId);panGesture={pointerId:e.pointerId,x:e.clientX,y:e.clientY,viewX:view.x,viewY:view.y};hover=null;probeDirty=true;canvas.style.cursor='grabbing';return;}
    if(!snapshot||e.button!==0)return;e.preventDefault();$('field-probe').hidden=true;const p=point(e),id=snapshot.grid[p[1]*snapshot.width+p[0]],m=snapshot.cells.find(c=>c.id===id);
    canvas.setPointerCapture(e.pointerId);stroke={pointerId:e.pointerId,previous:p,id:m?.id||0,token:++dragSerial,offset:[0,0],warned:false,drag:tool==='move',signal:tool==='signal'&&!eraseSource};if(tool==='remove'){hover={clientX:e.clientX,clientY:e.clientY};probeDirty=true;}
    if(stroke.signal){signalGesture.down({point:p,screen:[e.clientX,e.clientY],type:$('signal-kind').value,radius:Number($('source-radius').value)});return;}
    if(tool==='move'||tool==='inspect'){selected=m?.id||0;observedBirth=m?.birth||0;rpc('observe',{id:selected,birth:observedBirth}).catch(fail);sync();dirty=true;}
    if(tool==='inspect'){$('cell-inspector').open=true;mobileUI.focus('cell-inspector');}
    if(tool==='move'){
      if(!m||m.dying){stroke=null;toast('请在一个存活的细胞上按住拖动');return;}
      stroke.offset=[m.x-p[0],m.y-p[1]];canvas.style.cursor='grabbing';lastAction=rpc('beginDrag',{id:m.id,token:stroke.token}).catch(fail);
    }else applyPointer(p,true);
  });
  canvas.addEventListener('pointermove',e=>{if(panGesture){if(e.pointerId!==panGesture.pointerId)return;view.x=panGesture.viewX+e.clientX-panGesture.x;view.y=panGesture.viewY+e.clientY-panGesture.y;fitCanvas();hover=null;probeDirty=true;dirty=true;return;}if(e.pointerType!=='touch'){if(!hover||hover.clientX!==e.clientX||hover.clientY!==e.clientY)hoverMovedAt=performance.now();hover={clientX:e.clientX,clientY:e.clientY};probeDirty=true;}if(!stroke||e.pointerId!==stroke.pointerId||stroke.ending||!snapshot||tool==='inspect'||tool==='seed')return;if(stroke.signal){signalGesture.move(point(e),[e.clientX,e.clientY]);return;}queuedPoint=point(e);if(!flushTimer)flushTimer=setTimeout(flush,25);});
  canvas.addEventListener('pointerleave',()=>{hover=null;probeDirty=true;});
  window.addEventListener('blur',()=>{panGesture=null;hover=null;probeDirty=true;void endStroke();});document.addEventListener('scroll',()=>probeDirty=true,true);window.addEventListener('resize',()=>{hover=null;probeDirty=true;dirty=true;});
  const layoutObserver=new ResizeObserver(()=>{dirty=true;refreshRecordingOptions();});layoutObserver.observe(viewport);layoutObserver.observe($('history'));document.addEventListener('fullscreenchange',()=>dirty=true);
  viewport.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
  async function endStroke({cancelSignal=true}={}){if(cancelSignal)signalGesture.cancel();if(!stroke||stroke.ending)return;const current=stroke;current.ending=true;await flush();if(current.drag)await rpc('endDrag',{token:current.token}).catch(fail);if(current.removed)toast(`已手动擦除 ${current.removed} 颗细胞`);if(stroke===current)stroke=null;canvas.style.cursor=tool==='move'?'grab':tool==='inspect'?'pointer':'crosshair';}
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{
    if(panGesture?.pointerId===e.pointerId){panGesture=null;canvas.style.cursor=tool==='move'?'grab':'crosshair';}
    if(!stroke||stroke.ending||stroke.pointerId!==e.pointerId)return;
    if(event==='pointerup'&&stroke.signal)signalGesture.up();
    void endStroke({cancelSignal:event!=='pointerup'});
  });
  canvas.addEventListener('dblclick',e=>{if(tool==='signal')e.preventDefault();});
  canvas.addEventListener('contextmenu',e=>{if(tool==='signal')e.preventDefault();});
  $('eraser-radius').addEventListener('input',()=>{$('eraser-radius-out').textContent=$('eraser-radius').value;probeDirty=true;});
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  function gridPreview(){
    const width=Number($('world-size').value),height=Number($('world-size').selectedOptions[0]?.dataset.height)||width*.75,refine=$('refinement');
    for(const option of refine.options)option.disabled=width*Number(option.value)>1024||height*Number(option.value)>768;
    if(refine.selectedOptions[0].disabled)refine.value=[...refine.options].filter(o=>!o.disabled).at(-1).value;
    const r=Number(refine.value);$('grid-preview').textContent=`应用后：${Math.round(width*r)} × ${Math.round(height*r)} 真实格点（${width} × ${height} 区域，${r}× 精细度）`;
  }
  for(const id of ['world-size','refinement'])$(id).addEventListener('change',gridPreview);gridPreview();
  async function start(scene=snapshot?.scene||'oncogenesis',{preserve=false,shuffle=false,preset=false,reason}={}){
    if(setupBusy)return;
    setupBusy++;autoRandom.suspend(performance.now());try{
    await endStroke();panGesture=null;
    if(snapshot){await rpc('playing',{value:false});journal.observe(snapshot,performance.now(),false);}
    const priorScene=snapshot?.scene,lockedSettings=shuffle?parameterLocks.pick(snapshot?.settings||{}):{};
    if(preset&&scene==='maze'&&Number($('world-size').value)<384){$('world-size').value='384';if(Number($('refinement').value)>2)$('refinement').value='2';gridPreview();}
    selected=0;observedBirth=0;const resetDisplay=preset||shuffle||scene!==snapshot?.scene;
    const tumorPreset=['oncogenesis','cold','hot','random'].includes(scene);
    if(preset||shuffle){if(tumorPreset&&!(shuffle&&parameterLocks.values.boundary))$('boundary').value='wrap';else if(scene==='maze')$('boundary').value='solid';}
    // Each page visit gets one new development experiment. Restart/import keep
    // their explicit seed; revisiting/restoring this preset replays this visit.
    const seed=preset?(scene==='oncogenesis'?openingSeed:17):shuffle?nextStartSeed():snapshot?.seed??openingSeed;
    let worldWidth=Number($('world-size').value),worldHeight=Number($('world-size').selectedOptions[0]?.dataset.height)||worldWidth*.75,refinement=Number($('refinement').value),boundary=$('boundary').value;
    if(shuffle){({worldWidth,worldHeight,refinement,boundary}=CellLabRounds.randomGeometry(seed,{worldWidth,worldHeight,refinement,boundary},parameterLocks.values));$('world-size').value=worldWidth;$('refinement').value=refinement;$('boundary').value=boundary;gridPreview();}
    if(((preset||shuffle)&&snapshot)||scene==='empty')await rpc('playing',{value:false});
    await rpc('start',{scene,seed,worldWidth,worldHeight,refinement,boundary,settings:shuffle?lockedSettings:preserve?snapshot?.settings||{}:{},...(scene==='empty'?{warmup:0}:{})});
    archiveRound(reason||(shuffle?'manual-random':priorScene!==scene?'scene-change':preset?'preset-reset':'manual-restart'));
    if(resetDisplay){$('antigen-marks').checked=true;$('edge-activity').checked=!tumorPreset;$('normal-activity').checked=false;$('tumor-activity').checked=false;$('immune-activity').checked=scene==='maze';if(tumorPreset){$('nuclei').checked=true;$('cycle-marks').checked=true;$('show-tracks').checked=false;syncTracks();}dirty=true;}
    if(preset||shuffle||scene==='empty'){signalLayers.clear();$('field-view').value=tumorPreset?'adversity':'none';if(tumorPreset||scene==='maze')signalLayers.add('trail');if(scene==='maze'){$('edge-activity').checked=true;$('immune-activity').checked=true;$('show-tracks').checked=true;$('track-duration').value='1200';syncTracks();view.x=0;view.y=0;$('zoom').value='100';$('view-fit').value='contain';}updateOverlayButtons();dirty=true;await rpc('speed',{value:tumorPreset||scene==='network'?3:1});await rpc('playing',{value:scene!=='empty'});}
    else if(scene==='stress'||scene==='surveillance'){$('field-view').value='adversity';dirty=true;}
    if(scene==='empty'){view.x=0;view.y=0;$('zoom').value='100';$('seed-kind').value='1';setTool('seed');if(mobileUI.isMobile)mobileUI.focus('mobile-tools');dirty=true;}
    }finally{setupBusy--;autoRandom.reset(performance.now());autoRandom.observe(snapshot,performance.now());renderAutoNotice();if(snapshot&&!journal.active)journal.begin(snapshot,performance.now(),undefined,parameterLocks.toJSON(),displaySettings());}
  }
  function syncTracks(){trajectories.configure($('show-tracks').checked,Number($('track-duration').value));$('track-duration-out').textContent=$('track-duration').value+' MCS';if(snapshot)trajectories.sample(snapshot);dirty=true;}
  $('show-tracks').addEventListener('change',syncTracks);$('track-duration').addEventListener('input',syncTracks);
  $('source-radius').addEventListener('input',()=>{signalGesture.cancel();$('source-radius-out').textContent=$('source-radius').value;});
  $('signal-kind').addEventListener('change',()=>signalGesture.cancel());
  for(const [id,erase]of [['source-place',false],['source-erase',true]])$(id).addEventListener('click',()=>{signalGesture.cancel();eraseSource=erase;for(const [key,on]of [['source-place',!erase],['source-erase',erase]]){$(key).classList.toggle('selected',on);$(key).setAttribute('aria-pressed',on);}});
  document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>start(b.dataset.scene,{preset:true}).catch(fail)));
  $('restore-scenario').addEventListener('click',()=>start(undefined,{preset:true}).then(()=>toast('已恢复当前情境的参数、种子与初始细胞')).catch(fail));
  $('boundary').addEventListener('change',()=>start(undefined,{preserve:true}).then(()=>toast('已按新的边界条件重新开始')).catch(fail));
  $('apply-grid').addEventListener('click',async()=>{const b=$('apply-grid');b.disabled=true;b.textContent='正在创建格点与细胞…';try{await start(undefined,{preserve:true});toast('计算区域与真实格点精细度已更新');}catch(e){fail(e);}finally{b.disabled=false;b.textContent='应用区域与精细度 · 重新开始';}});
  $('zoom').addEventListener('change',()=>{view.x=0;view.y=0;dirty=true;});
  $('view-fit').addEventListener('change',()=>{view.x=0;view.y=0;dirty=true;});
  $('render-resolution').addEventListener('change',()=>{performanceContext();dirty=true;forceFrame=true;});
  $('tumor-morphology').addEventListener('change',e=>rpc('set',{name:'tumorMorphology',value:Number(e.target.value)}).then(()=>toast('肿瘤形态偏好已更新，胞体将逐步重塑')).catch(fail));
  $('network-demo').addEventListener('click',()=>start('network',{preset:true}).catch(fail));
  let arenaFullscreen=false,fullscreenHadNative=false,fullscreenFocus=null;
  function fullscreenLayout(value){
    arenaFullscreen=value;document.body.classList.toggle('arena-fullscreen',value);$('arena-fullscreen').setAttribute('aria-pressed',String(value));
    fullscreenView.enable(value,mobileQuery.matches||(matchMedia('(pointer:coarse)').matches&&Math.min(innerWidth,innerHeight)<850));fullscreenView.update(snapshot);fitCanvas();dirty=true;
    if(!value)try{screen.orientation?.unlock?.();}catch{}
  }
  async function exitArenaFullscreen(){
    fullscreenLayout(false);if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}fullscreenHadNative=false;fullscreenFocus?.focus({preventScroll:true});
  }
  async function toggleArenaFullscreen(){
    if(arenaFullscreen||document.fullscreenElement)return exitArenaFullscreen();
    fullscreenFocus=document.activeElement;
    try{const request=viewport.requestFullscreen?.();fullscreenLayout(true);if(request)await request;fullscreenHadNative=!!document.fullscreenElement;}catch(error){viewport.dataset.fullscreenFallback=error.name+": "+error.message;fullscreenLayout(true);}
    if(fullscreenView.mobile&&document.fullscreenElement)try{await screen.orientation?.lock?.('landscape');}catch{/* iOS / unsupported: the stage rotates instead. */}
    if(!arenaFullscreen)return;fitCanvas();canvas.focus({preventScroll:true});toast('Esc 或双指轻触退出全屏');
  }
  for(const id of ['arena-fullscreen','fullscreen'])$(id).addEventListener('click',toggleArenaFullscreen);
  viewport.addEventListener('touchstart',e=>{if(arenaFullscreen&&e.touches.length===2){e.preventDefault();void endStroke();void exitArenaFullscreen();}},{passive:false});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&arenaFullscreen){e.preventDefault();exitArenaFullscreen();}});
  document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement)fullscreenHadNative=true;else if(fullscreenHadNative){fullscreenLayout(false);fullscreenHadNative=false;fullscreenFocus?.focus({preventScroll:true});}});
  $('reset').addEventListener('click',()=>start(undefined,{preserve:true}).catch(fail));$('shuffle').addEventListener('click',()=>start('random',{shuffle:true}).catch(fail));
  $('play').addEventListener('click',()=>rpc('playing',{value:!snapshot?.playing}).catch(fail));
  $('speed').addEventListener('input',e=>{$('speed-out').textContent=e.target.value+'×';rpc('speed',{value:Number(e.target.value)}).catch(fail);});
  $('sprinkle').addEventListener('click',async()=>{
    const count=$('seed-count').valueAsNumber,button=$('sprinkle');
    if(!Number.isSafeInteger(count)||count<1){toast('请输入正整数数量');$('seed-count').focus();return;}
    button.disabled=true;button.textContent='加入中…';
    try{seedFeedback(await rpc('sprinkle',{kind:$('seed-kind').value==='vessel'?'vessel':Number($('seed-kind').value),count,manual:true}));}catch(error){fail(error);}finally{button.disabled=false;button.textContent='＋ 加入';}
  });
  $('clear-walls').addEventListener('click',()=>rpc('clearWalls').then(()=>toast('障碍已清除')).catch(fail));
  $('divide').addEventListener('click',()=>{if(!selected){toast('请先点击选中一颗细胞');return;}rpc('divide',{id:selected}).then(id=>toast(id?'已分裂出细胞 #'+id:'面积不足、免疫分裂次数耗尽或轮廓受限')).catch(fail);});
  for(const id of ['field-view','edge-activity','normal-activity','tumor-activity','immune-activity','cell-seams','arrows','nuclei','antigen-marks','cycle-marks','immune-links','protect-bodies'])$(id).addEventListener('change',()=>dirty=true);
  document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.layer;if(key==='adversity')$('field-view').value=$('field-view').value==='adversity'?'none':'adversity';else if(signalLayers.has(key))signalLayers.delete(key);else signalLayers.add(key);updateOverlayButtons();dirty=true;}));
  $('clear-overlays').addEventListener('click',()=>{signalLayers.clear();$('field-view').value='none';updateOverlayButtons();dirty=true;});
  const sections=[...document.querySelectorAll('aside details.section')];
  const mobileUI=CellLabMobile.mount();
  const statisticsUI=CellLabStatistics.mount(mobileUI,()=>{dirty=true;});
  $('performance-mode').value=adaptive.mode;
  $('performance-mode').addEventListener('change',()=>{
    adaptive.setMode($('performance-mode').value,performance.now());applyPerformance();performanceContext();
    try{localStorage.setItem('cell-arena-performance-v1',JSON.stringify(adaptive.preferences()));}catch{}
    dirty=true;forceFrame=true;uiPending=true;
  });
  $('recheck-performance').addEventListener('click',()=>{adaptive.setMode(adaptive.mode,performance.now());applyPerformance();dirty=true;uiPending=true;});
  document.querySelector('aside').addEventListener('toggle',()=>{uiPending=true;forceFrame=true;dirty=true;performanceContext();},true);
  for(const name of ['pointerdown','input'])document.addEventListener(name,event=>{const now=performance.now();latestInput=event.timeStamp>0&&event.timeStamp<=now&&now-event.timeStamp<2000?event.timeStamp:now;},{capture:true,passive:true});
  document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{statisticsUI.set(false);mobileUI.focus(button.dataset.panel);}));
  $('compute-backend').addEventListener('change',()=>rpc('backend',{mode:$('compute-backend').value}).catch(fail));
  const modes={wander:{alignment:0,cohesion:0,repulsion:1.2,noise:1.2,normalMotility:.9},cluster:{alignment:.4,cohesion:2.6,repulsion:.3,noise:.4,normalMotility:.45},flock:{alignment:2.7,cohesion:1.1,repulsion:.5,noise:.25,normalMotility:1}};
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',async()=>{for(const [name,value] of Object.entries(modes[b.dataset.mode]))await rpc('set',{name,value});toast('局部规则已更新；变化会逐步形成');}));
  function download(url,name){const a=document.createElement('a');a.href=url;a.download=name;a.click();}
  let recordUnavailable=false;
  function refreshRecordingOptions(){
    const phone=matchMedia('(max-width:850px)').matches;if(phone&&!video.status.active&&!video.status.preparing&&!video.status.stopping)$('record-scope').value='arena';$('record-scope').closest('label').hidden=phone;
    const format=$('record-format').value,quality=$('record-quality').value,label=format==='mp4'?'MP4':'WebM',state=video.status,busy=state.active||state.preparing||state.stopping,q=busy?state:CellLabVideo.plan(video.bounds($('record-scope').value),quality);
    $('record-options-summary').textContent=label+' · '+({standard:'1080p',high:'1440p',ultra:'4K'}[quality])+' · '+($('record-scope').value==='workspace'?'Arena ＋ 右侧栏':'仅 Arena');
    const supported=CellLabVideo.ArenaRecorder.supported(format);
    $('record-options-info').textContent=supported?`${q.width} × ${q.height} · 30 FPS`:(format==='mp4'?'当前浏览器不支持 MP4，请使用新版 Chrome、Edge 或 Safari，或手动选择 WebM':'当前浏览器不支持所选视频格式');
    $('record-format').disabled=busy;$('record-quality').disabled=busy;$('record-scope').disabled=busy;
    if(!busy){$('record-video').title='● 录制 '+label;$('record-video').setAttribute('aria-label',$('record-video').title);$('record-video').disabled=!supported;if(!supported)$('record-status').textContent=$('record-options-info').textContent;else if(recordUnavailable)$('record-status').textContent='';recordUnavailable=!supported;}
    $('statistics-record').textContent=$('record-video').title;$('statistics-record').disabled=$('record-video').disabled;
  }
  const video=new CellLabVideo.ArenaRecorder(canvas,viewport,{
    sidebar:document.querySelector('aside'),captureSidebar:CellLabSidebarCapture.capture,
    onChange:state=>{const time=Math.floor(state.elapsed||0),stamp=String(Math.floor(time/60)).padStart(2,'0')+':'+String(time%60).padStart(2,'0');const label=state.preparing?'准备录制…':state.stopping?'正在生成视频…':state.active?'■ 停止并下载':'● 录制 '+($('record-format').value==='mp4'?'MP4':'WebM');$('record-video').title=label;$('record-video').setAttribute('aria-label',label);$('record-video').setAttribute('aria-pressed',String(!!state.active));$('record-video').classList.toggle('recording',!!state.active);$('record-video').disabled=!!(state.stopping||state.preparing);$('record-indicator').hidden=!state.active;$('record-indicator').textContent='■ '+stamp;$('record-indicator').disabled=!!state.stopping;if(state.active)$('record-status').textContent=`录制中 ${stamp} · ${state.format==='mp4'?'MP4':'WebM'} · ${state.width} × ${state.height} · ${state.fps} FPS`;refreshRecordingOptions();},
    onReady:(blob,state)=>{const url=URL.createObjectURL(blob),extension=blob.type.includes('mp4')?'mp4':'webm';download(url,`cell-arena-${snapshot.scene}-${state.width}x${state.height}-${Date.now()}.${extension}`);setTimeout(()=>URL.revokeObjectURL(url),60000);$('record-status').textContent=`视频已导出 · ${extension==='mp4'?'MP4':'WebM'} · ${state.width} × ${state.height} · ${Math.round(state.elapsed)} 秒 · ${(blob.size/1024/1024).toFixed(1)} MB`;},
    onError:error=>{$('record-status').textContent=String(error.message||error);},
    onResolution:scale=>{if(Math.abs(recordingScale-scale)>.001){recordingScale=scale;performanceContext();if(scale>0)render();else dirty=true;}}
  });
  $('maze-diffusion').addEventListener('click',async()=>{if(!snapshot?.maze)return;const button=$('maze-diffusion');button.disabled=true;try{await rpc('mazeSignal',{throughWalls:!snapshot.maze.signalThroughWalls});}catch(e){fail(e);}finally{button.disabled=false;}});
  $('record-video').addEventListener('click',async()=>{try{if(video.status.active||video.status.preparing)await video.stop();else{render();await video.start({quality:$('record-quality').value,format:$('record-format').value,scope:mobileUI.isMobile?'arena':$('record-scope').value});}}catch(error){refreshRecordingOptions();$('record-status').textContent=String(error.message||error);toast('录像未能开始：'+String(error.message||error));}});$('record-indicator').addEventListener('click',()=>void video.stop());
  matchMedia('(max-width:850px)').addEventListener('change',async event=>{if(event.matches&&video.status.scope==='workspace'&&(video.status.active||video.status.preparing)){await video.stop();toast('手机端仅录制 Arena，组合录像已结束');}refreshRecordingOptions();});
  $('statistics-record').addEventListener('click',()=>$('record-video').click());
  $('statistics-play').addEventListener('click',()=>$('play').click());
  for(const id of ['record-format','record-quality','record-scope'])$(id).addEventListener('change',refreshRecordingOptions);refreshRecordingOptions();
  function closeFileMenu(){ $('file-menu').hidden=true;$('file-actions').setAttribute('aria-expanded','false'); }
  $('file-actions').addEventListener('click',()=>{const open=$('file-menu').hidden;$('file-menu').hidden=!open;$('file-actions').setAttribute('aria-expanded',String(open));});
  $('file-menu').addEventListener('click',event=>{if(event.target.closest('button'))closeFileMenu();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#file-menu,#file-actions'))closeFileMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('file-menu').hidden){closeFileMenu();$('file-actions').focus();}});
  $('file-export-rounds').addEventListener('click',()=>$('export-rounds').click());
  $('snapshot').addEventListener('click',()=>{render();download(canvas.toDataURL('image/png'),`cell-arena-${snapshot.scene}-${snapshot.time}.png`);});
  function displaySettings(){return {cellColors:CellLabDisplay.normalizeColors(cellColors),edgeFade:Number($('body-feather').value),autoRandomMinutes:autoRandom.minutes,parameterLocks:parameterLocks.toJSON(),trackDuration:Number($('track-duration').value),fieldView:$('field-view').value,signalLayers:[...signalLayers],opacity:{...opacity},flags:Object.fromEntries(CellLabExperiment.flags.map(id=>[id,$(id).checked])),zoom:$('zoom').value,fit:$('view-fit').value,renderResolution:$('render-resolution').value};}
  async function exportData(){return {...await rpc('export'),display:displaySettings()};}
  $('export-data').addEventListener('click',async()=>{try{const data=await exportData(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));download(url,`cell-arena-experiment-${data.time}.json`);setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(e){fail(e);}});
  let pendingImport=null,importSerial=0;
  async function replayRound(record){
    const data=CellLabRounds.replayExperiment(record);await importData(data,{reason:'history-replay',kernel:record.initialKernel,computeMode:record.initialCompute,replayOf:record.id});
    await rpc('playing',{value:true});toast('已按原种子和初始参数开始新一局');
  }
  async function importData(data,options={}){
    setupBusy++;autoRandom.suspend(performance.now());try{
    await endStroke();
    const profile=CellLabExperiment.parse(data);if(snapshot){await rpc('playing',{value:false});journal.observe(snapshot,performance.now(),false);}await rpc('import',{data,kernel:options.kernel,computeMode:options.computeMode});archiveRound(options.reason||'import');
    const config=profile.config,select=$('world-size');let option=[...select.options].find(o=>o.value===String(config.worldWidth));if(!option){option=new Option('',String(config.worldWidth));select.append(option);}option.textContent=`${config.worldWidth} × ${config.worldHeight}`;option.dataset.height=config.worldHeight;select.value=String(config.worldWidth);$('refinement').value=String(config.refinement);gridPreview();
    const d=profile.display;if(d.parameterLocks){parameterLocks.restore(d.parameterLocks);persistLocks();}if(d.cellColors)applyColors(d.cellColors);if(d.edgeFade!==undefined){$('body-feather').value=d.edgeFade;syncAppearance();}if(d.fieldView!==undefined)$('field-view').value=d.fieldView;if(d.signalLayers){signalLayers.clear();for(const key of d.signalLayers)signalLayers.add(key);}Object.assign(opacity,d.opacity||{});
    if(d.autoRandomMinutes!==undefined)setAutoRandomMinutes(d.autoRandomMinutes);
    // Migrate the short-lived exclusive selector; current independent flags win.
    if(d.cellMarker!==undefined)for(const [id,mode]of [['nuclei','nucleus'],['antigen-marks','antigen'],['cycle-marks','cycle']])$(id).checked=d.cellMarker===mode;
    else if(d.flags&&('nuclei' in d.flags||'antigen-marks' in d.flags))$('cycle-marks').checked=false;
    for(const [id,value]of Object.entries(d.flags||{}))if($(id))$(id).checked=value;
    if(d.trackDuration!==undefined)$('track-duration').value=d.trackDuration;syncTracks();
    if(d.zoom)$('zoom').value=d.zoom;if(d.fit)$('view-fit').value=d.fit;if(d.renderResolution)$('render-resolution').value=d.renderResolution;
    view.x=0;view.y=0;selected=0;observedBirth=0;hover=null;probeDirty=true;syncOpacity();updateOverlayButtons();setTool(config.scene==='empty'?'seed':'move');dirty=true;if(profile.warnings.length)toast(profile.warnings.join(' '));return profile;
    }finally{setupBusy--;autoRandom.reset(performance.now());autoRandom.observe(snapshot,performance.now());renderAutoNotice();if(snapshot&&!journal.active)journal.begin(snapshot,performance.now(),undefined,parameterLocks.toJSON(),displaySettings(),options.replayOf||null);}
  }
  $('import-data').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async()=>{
    const file=$('import-file').files?.[0];if(!file)return;const ticket=++importSerial,filename=document.createElement('b');filename.dataset.noI18n='';filename.textContent=file.name;pendingImport=null;$('confirm-import').disabled=true;$('import-summary').replaceChildren(filename);$('import-status').textContent='正在读取文件…';$('import-dialog').showModal();
    try{if(file.size>32*1024*1024)throw Error('文件超过 32 MB，请使用较小的实验参数文件');const data=JSON.parse(await file.text()),profile=CellLabExperiment.parse(data);if(ticket!==importSerial||!$('import-dialog').open)return;pendingImport=data;
      $('import-summary').replaceChildren(filename,document.createTextNode('\n'+[`情境：${titles[profile.config.scene]||{oncogenesis:'肿瘤发生发展',cold:'免疫冷肿瘤扩散转移',hot:'免疫热肿瘤应答'}[profile.config.scene]}`,`种子 ${profile.config.seed} · 区域 ${profile.config.worldWidth} × ${profile.config.worldHeight} · 精细度 ${profile.config.refinement}×`,`参数 ${Object.keys(profile.config.settings).length} 项 · 导出时刻 ${profile.sourceTime} MCS`].join('\n')));
      const messages=[profile.ignored.length?'将忽略旧版或未知参数：'+profile.ignored.join(', '):'文件校验通过',...profile.warnings];
      $('import-status').replaceChildren(...messages.flatMap((line,i)=>[...(i?[document.createElement('br')]:[]),document.createTextNode(line)]));$('confirm-import').disabled=false;
    }catch(error){if(ticket===importSerial)$('import-status').textContent=error instanceof SyntaxError?'不是有效的 JSON 实验文件':String(error.message||error);}finally{if(ticket===importSerial)$('import-file').value='';}
  });
  $('cancel-import').addEventListener('click',()=>$('import-dialog').close());$('import-dialog').addEventListener('close',()=>{pendingImport=null;importSerial++;$('import-file').value='';});
  $('confirm-import').addEventListener('click',async()=>{if(!pendingImport)return;$('confirm-import').disabled=true;try{await importData(pendingImport);$('import-dialog').close();toast('参数已加载，已暂停重新开局');}catch(error){$('import-status').textContent=String(error.message||error);$('confirm-import').disabled=false;}});
  $('about').addEventListener('click',()=>$('about-dialog').showModal());$('close-about').addEventListener('click',()=>$('about-dialog').close());
  document.addEventListener('visibilitychange',()=>{autoRandom.suspend(performance.now());if(snapshot){journal.observe(snapshot,performance.now(),false);checkpointRound(performance.now(),true);}if(document.hidden)void endStroke();lastAnimation=0;performanceContext();rpc('visible',{value:!document.hidden}).catch(fail);});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','BUTTON','SUMMARY'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();rpc('playing',{value:!snapshot?.playing}).catch(fail);}});
  function frame(){
    const now=performance.now();if(lastAnimation)adaptive.frameGap(now-lastAnimation);lastAnimation=now;
    if(latestInput){adaptive.inputDelay(now-latestInput);latestInput=0;}
    if(now-lastHeartbeat>=500){performanceContext();if(adaptive.tick(now)){dirty=true;applyPerformance();}performancePlan=adaptive.status();lastHeartbeat=now;tickAutoRandom(now);if(snapshot){journal.observe(snapshot,now,!document.hidden&&!stroke);checkpointRound(now);}}
    if(uiPending&&now-lastUISync>=performancePlan.uiMs){sync();lastUISync=now;uiPending=false;}
    if(dirty&&(!pendingFrame||forceFrame||now-lastRender>=1000/performancePlan.fps))render();
    if(hover&&performance.now()-hoverMovedAt>=10000&&!$('field-probe').hidden)probeDirty=true;
    if(probeDirty)updateProbe();requestAnimationFrame(frame);
  }requestAnimationFrame(frame);applyPerformance();
  window.artistooLab={rpc,ready,get snapshot(){return snapshot;},get roundHistory(){return {completed:CellLabRounds.numbered(completedRounds).map(r=>structuredClone(r)),current:journal.current()};},get parameterLocks(){return parameterLocks.toJSON();},get autoRandom(){return {...autoRandom.status(),busy:autoRandomBusy};},get performance(){return {...adaptive.status(),visiblePanels:[...visiblePanels]};},get errors(){return errors;},get selected(){return selected;},get recording(){return video.status;},get colors(){return CellLabDisplay.normalizeColors(cellColors);},get renderer(){return {gpu:!!gpuRenderer&&!gpuRenderer.lost,device:gpuRenderer?.device,error:rendererFailure,ms:gpuRenderer?.lastMs,fps:snapshot?.playing?frameStats.fps:0,renderMs:frameStats.renderMs,snapshotMs:frameStats.snapshotMs};},setTool,render,exportData,importData,replayRound};
  const language=CellLabI18n.mount($('language'));
  for(const event of ['click','change'])$('language').addEventListener(event,()=>{if(snapshot)sync(true);dirty=true;});
  window.addEventListener('pagehide',()=>{if(snapshot)journal.observe(snapshot,performance.now(),false);checkpointRound(performance.now(),true);});
  historyReady.then(()=>start('oncogenesis',{preset:true})).then(()=>rpc('visible',{value:!document.hidden})).then(resolveReady).catch(fail);
})();
