/* UI-only translation. No model state, random stream or simulation clock is read
 * or changed here. DOM sources are retained so switching back is lossless. */
(() => {
  'use strict';
  const dictionary=new Map(),missing=new Set(),cache=new Map();
  function add(rows){for(const line of rows.trim().split('\n')){const at=line.indexOf('|');if(at>0)dictionary.set(line.slice(0,at),line.slice(at+1));}}
  add(`
Cell-Arena · 细胞生态竞技场|Cell-Arena · Cell ecology playground
血管、灌注与浸润|Vessels, perfusion and trafficking
初始血管数|Initial vessels
新血管管腔半径|New vessel lumen radius
血管交换能力|Vascular exchange capacity
供给的血管依赖程度|Supply dependence on vessels
循环免疫补充速率|Circulating immune arrival rate
免疫补充与组织健康联动|Immune supply–tissue health coupling
免疫跨内皮通行|Immune transendothelial passage
内皮修复速度|Endothelial repair speed
内皮修复谱系分裂上限|Endothelial repair division limit
内皮参考寿命|Endothelial reference lifespan
内皮慢性炎症损伤|Chronic endothelial inflammatory injury
肿瘤入血倾向|Tumor intravasation propensity
重开后生效；空白场景可在新增类型中选择血管，放到空隙中|Applies on restart. In a blank scene, select vessel under Add and place it in free space.
只影响新建血管；内皮是可形变的真实胞体，管腔不含组织细胞|Affects new vessels only. Endothelium is made of deformable cell bodies surrounding a tissue-free lumen.
有限速率补充氧糖与排酸；实际通量随灌注、管腔与正常组织保留率变化|Finite oxygen/glucose delivery and acid clearance, scaled by perfusion, lumen size and healthy tissue retention.
越高越减少均匀背景供给；血管全部失效后不会自动恢复背景供给|Higher values reduce uniform background supply. Vascular failure does not restore background supply.
管腔内按模型时间概率到达；局部招募信号增强，实际空隙不足时不能生成|Stochastic luminal arrivals per model time, enhanced by local recruitment. Arrival requires actual free space.
健康正常组织减少时，延迟下调循环免疫可用量；不把内皮计入正常组织基数|Loss of healthy tissue gradually reduces circulating immune availability. Endothelium is excluded from the healthy-normal baseline.
必须接触内皮并持续黏附，随后沿真实胞体形变穿出；0 关闭跨出许可|Requires sustained endothelial contact, then continuous cell deformation through the wall. 0 disables passage licensing.
局部缺口诱导迁移与有限增殖；营养不足或分裂额度耗尽可修复失败|Local gaps drive migration and finite proliferation. Repair can fail under nutrient deprivation or exhausted division capacity.
每次分裂两个子代都扣一次；耗尽后仍可存活和有限迁移|Both daughters lose one lineage division per split. Exhaustion still permits survival and limited migration.
超过个体寿命后死亡风险逐渐上升；初始年龄有差异，0 关闭年龄凋亡|Death risk gradually rises beyond each cell's lifespan. Initial ages vary; 0 disables age-related apoptosis.
持续招募信号与代谢压力累积损伤；短时招募不直接杀死内皮。为可调代理机制|Sustained recruitment and metabolic stress accumulate injury. Brief recruitment does not directly kill endothelium. Tunable proxy mechanism.
高侵袭肿瘤实际接触内皮后才可能穿入；整个核区和大部分胞体进入管腔后才可随血流离场|Invasive tumors need actual endothelial contact to enter. The entire protected nucleus and most of the body must enter the lumen before perfusion can remove the cell.
血管横截面|Vessel cross-section
血管内皮细胞|Endothelial cell
血管内皮|Endothelium
内皮|Endothelium
内皮状态|Endothelial states
血管与播散|Vessels and dissemination
血管灌注与循环补充|Vascular perfusion and immune supply
有效血管|Functional vessels
平均灌注|Mean perfusion
穿出 / 到达免疫|Immune exits / arrivals
入血离场|Bloodstream departures
内皮分裂|Endothelial divisions
内皮死亡|Endothelial deaths
循环返回|Returns to circulation
内皮年龄|Endothelial age
累积内皮损伤|Accumulated endothelial injury
血管|Vessel
管腔内循环|Circulating in lumen
跨内皮进入组织|Crossing endothelium into tissue
肿瘤跨内皮入血|Tumor intravasation
已进入管腔，等待灌注带离|Inside lumen, awaiting perfusion washout
内皮年龄相关凋亡|Endothelial age-related apoptosis
局部肿瘤已清除，曾发生入血播散|Local tumor cleared; bloodstream dissemination occurred
内皮修复依赖局部缺口与营养；虚线标示管腔，中心百分比是灌注能力。入血播散不等于远处转移灶形成。|Repair depends on local gaps and nutrients. Dashed lines mark lumens; center percentages show perfusion. Intravasation does not establish a distant metastasis.
管腔仅接收循环免疫细胞，请在血管外放置组织细胞|Only circulating immune cells can be placed in the lumen. Place tissue cells outside the vessel.
不能把内皮或组织胞体直接拖过血管基底膜|Endothelium or tissue bodies cannot be dragged through the vascular basement boundary.
血管空间不足或与现有血管过近|Insufficient space or too close to an existing vessel.
加入了血管|Added vessel
Esc 或双指轻触退出全屏|Press Esc or tap with two fingers to exit fullscreen
正常细胞铺满背景，中央嵌入 19 颗低抗原肿瘤，外围仅 3 颗免疫细胞。梭形肿瘤侵袭扩增，压力提高性状变异，部分克隆可能暴露抗原；免疫招募较弱。包含局部侵袭与概率性入血播散，不模拟远处器官定植。|A confluent normal sheet contains 19 central low-antigen tumors and 3 peripheral immune cells. Spindle tumors invade and expand; stress promotes variation and possible antigen exposure, under weak recruitment. Includes local invasion and stochastic intravasation, not distant organ colonization.
免疫寿命：杀伤上限|Immune lifespan: kill limit
累计致死指定数量的肿瘤后皱缩凋亡；0 关闭。只记实际致死接触，每颗肿瘤一次；分裂后两颗子代各自从 0 计数|Shrink and die after this many tumor kills; 0 disables. Each tumor is credited once to its lethal contact. Both newborn daughters start at zero.
寿命凋亡|Lifespan apoptosis
达到累计肿瘤杀伤上限|Tumor kill limit reached
累计致死肿瘤|Tumors killed
不限|Unlimited
全部锁定|Lock all
全部解锁|Unlock all
已锁定：随机开局保持此参数|Locked: keep this parameter when randomizing
未锁定：随机开局允许随机化|Unlocked: allow this parameter to randomize
锁定参数在自动换局与随机生成时保持不变|Locked parameters stay fixed in automatic and manual random rounds
当前存活|Living now
选中|Selected
体细胞|Somatic
演化参数|Model parameters
显示设置|Display settings
五组演化参数|Five model parameter groups
免疫状态|Immune states
本局走势|This round
历局结果|Past rounds
自动换局|Auto restart
无变化自动随机换局的等待分钟数|Minutes without population or state changes before randomizing
清理|Clean up
完成清理|Done
全选（所有页）|Select all pages
已选|Selected
仅保留所选|Keep selected only
清除所选|Delete selected
选择此局|Select round
开始时间|Started
导入参数|Import parameters
时间未知|Time unavailable
将从本机永久删除|Permanently delete
局勾选的历史记录（包括其他页）。此操作不可撤销。|selected round records from this device, including other pages. This cannot be undone.
局未选中的历史记录（包括其他页）。此操作不可撤销。|unselected round records from this device, including other pages. This cannot be undone.
当前模拟与参数设置会保留；需要备份可先取消并导出 CSV。|Your current simulation and settings will be kept. Cancel and export CSV first if you need a backup.
确认清除|Confirm deletion
已清理所选历局记录|Round records deleted
清理失败，记录未删除，请重试或先导出 CSV。|Deletion failed; records were kept. Retry or export CSV first.
历局记录保存在本机|Round history is saved on this device
导出 CSV|Export CSV
较新|Newer
较早|Older
换局后在这里比较历局结果；CSV 也包含当前进行中的一局。|Compare completed rounds here. CSV also includes the current round.
本局累计|Cumulative events
细胞分裂|Divisions
抗原逃逸|Antigen escape
死亡清除|Deaths cleared
免疫巡逻与细胞周期|Patrol and cell cycle
已检查|Checked
演化事件|Evolution events
死亡明细|Death details
环境死亡其中|Environmental deaths by type
存活数不含死亡过程中的胞体；死亡清除在胞体消失时计数。寿命凋亡独立于肿瘤自发凋亡。|Living counts exclude dying bodies. Clearance is counted when a body disappears. Lifespan apoptosis is separate from spontaneous tumor apoptosis.
运行与开局|Runtime and setup
即将随机换局|New random round soon
已暂停倒计时|Countdown paused
继续本局 · 关闭自动换局|Keep this round · Disable auto restart
全部细胞消失|All cells disappeared
仅剩肿瘤细胞|Only tumor cells remain
免疫细胞为 0|No living immune cells
正常细胞为 0|No living normal cells
数量与生物状态长时间不变|Population and biological states stayed unchanged
手动随机生成|Manual randomization
手动重来|Manual restart
切换情境|Scenario changed
恢复情境|Preset restored
重新开局|New setup
页面关闭／重新载入|Page closed / reloaded
进行中|In progress
已按未锁定参数随机开启新一轮|Started a new round with unlocked parameters randomized
历史记录暂时无法保存到本机，仍可导出本页 CSV|Local history storage is unavailable. You can still export this page's CSV.
0 关闭。无变化超时、全部消失、仅剩肿瘤、免疫为 0 或正常为 0 时，提示 10 秒后换局；迷宫不检查正常细胞，暂停和后台不计时。|0 disables. Stagnation, no cells, tumor-only, no immune cells or no normal cells starts a 10-second notice. The maze skips normal-cell checks. Paused and hidden time is excluded.
边缘淡化|Edge translucency
沿当前胞体轮廓由内向外渐透明；0% 为纯色。Act 和标记独立显示。|Fade outward along the current cell shape; 0% restores solid color. Act and markers remain independent.
无变化|Idle
分|min
无变化自动随机换局的等待分钟数，0 关闭|Minutes without population or state changes before randomizing; 0 disables
数量或生物状态持续不变时自动换局；0 关闭。全部细胞消失立即换局，暂停和后台不计时。|Randomize after no population or biological state changes; 0 disables. An empty arena restarts immediately. Paused and hidden time is excluded.
长时间无状态变化，已随机开启新一轮|No state changes for the set duration; a new random round has started
全部细胞已消失，已随机开启新一轮|All cells have disappeared; a new random round has started
Arena 培养皿|Arena culture dish
模拟控制面板|Simulation controls
模型与来源|Model & sources
实验场景|Scenarios
肿瘤发生发展|Tumor development
免疫冷肿瘤扩散转移|Cold tumor spread
免疫热肿瘤治愈|Hot tumor clearance
发生发展|Onset
冷肿瘤|Cold
热肿瘤|Hot
空白自建|Custom
随机生成|Randomize
在合理模型范围内随机生成参数与细胞布局|Generate a new cell layout and parameters within moderate model ranges
空白自建：暂停摆放细胞，准备好后开始模拟|Empty, paused arena: place cells, then start when ready
空白自建从 0 MCS 暂停开始|Custom scenes start paused at 0 MCS
正在准备|Preparing
运行中|Running
已暂停|Paused
发生错误|Error
Ⅱ 暂停|Ⅱ Pause
▶ 开始|▶ Start
▶ 继续|▶ Resume
单步|Step
↺ 重来|↺ Reset
速度|Speed
鼠标工具|Mouse tools
↑ 展开面板|↑ Expand panel
↓ 返回画布|↓ Back to arena
工具|Tools
画布工具|Arena tools
场景与开局|Scenario & setup
参数分组快捷入口|Parameter group shortcuts
显示|Display
环境|Environment
次|times
↔ 拖动|↔ Drag
＋ 新增|＋ Add
◉ 信号|◉ Signal
▥ 障碍|▥ Walls
⌫ 擦除障碍|⌫ Erase walls
⌾ 追踪|⌾ Track
⌫ 擦除|⌫ Erase
✥ 平移视野|✥ Pan
拖动时暂停 · 邻居让位 · 实体墙阻挡|Drag pauses time; neighbors yield; walls block
拖动时暂停 · 邻居让位 · 松手恢复|Drag pauses time; release to resume
单击加入一颗 · 可尝试挤入已有细胞区域|Click to add one cell, including in occupied tissue
单击释放因子 · 拖动画出信号带|Click to release a signal; drag to paint a trail
在空白处拖动画墙|Drag across empty space to draw walls
拖动擦除实体障碍|Drag to erase solid walls
擦除细胞、场源与障碍 · 重置局部环境|Erase cells, sources and walls; reset local fields
按住拖动平移视野 · 不改变细胞位置|Drag to pan the view without moving cells
点击细胞查看状态与局部环境|Click a cell to inspect its state and environment
新增类型|Cell type
正常细胞|Normal cells
肿瘤细胞|Tumor cells
免疫细胞|Immune cells
癌前细胞|Precancerous cells
未激活免疫细胞|Resting immune cell
已激活免疫细胞|Activated immune cell
未激活免疫|Resting immune
已激活免疫|Activated immune
培养液|Medium
实体障碍|Solid wall
数量|Count
＋ 加入|+ Add
加入中…|Adding…
请输入正整数数量|Enter a positive whole number
在空隙中随机加入所选类型的细胞|Randomly add the selected cell type in available space
信号种类|Signal type
损伤趋化因子 → 免疫细胞|Damage cue → immune cells
凝聚因子 → 正常细胞为主|Cohesion cue → mainly normal cells
免疫招募因子 → 免疫细胞|Recruitment cue → immune cells
点击释放，拖动画出信号带；随后自然扩散、衰减。|Click to release; drag to paint. Signals then diffuse and decay.
擦除半径|Eraser radius
笔刷触及的整颗细胞会被移除，不计入生物学死亡|Remove whole cells touched by the brush; exclude them from biological deaths
清除全部障碍|Clear all walls
面板导航|Panel navigation
参数|Parameters
统计|Statistics
选中细胞|Selected cell
参数与统计滚动区|Scrollable parameters and statistics
细胞详情与操作|Cell details
未选中|None selected
选中细胞分裂|Divide selected cell
点击细胞，查看抗原、受损程度与接触状态。|Click a cell to inspect antigen, damage and contacts.
点击细胞，查看局部代谢、活性、抗原、遗传性状与剩余分裂次数。|Click a cell to inspect metabolism, activity, antigen, traits and remaining divisions.
六组参数|Six parameter groups
全部收起|Collapse all
显示调整|Display
视野 / 图层 / 配色|View / layers / colors
微环境|Environment
资源 / 信号 / 炎性促癌|Resources / signals
运动 / 聚集 / 癌变|Motion / transformation
生长 / 侵袭 / 遗传|Growth / invasion / traits
巡逻 / 杀伤 / 扩增|Patrol / killing / expansion
其他|Other
共用力学 / 计算|Mechanics / computing
观察图层|Overlays
可视化图层|Visualization layers
环境恶劣度|Environmental stress
细胞凝聚因子|Cohesion signal
损伤因子|Damage signal
损伤趋化因子|Damage cue
免疫招募因子|Recruitment signal
正常细胞分泌的局部凝聚信号|Local cohesion signal secreted by normal cells
关闭叠加|Clear overlays
图层透明度与细胞保护|Layer opacity & cell colors
低强度时保护胞体颜色|Protect cell colors at low opacity
点击图层查看环境或信号；多种因子可以同时叠加。|Select layers to inspect resources or signals; combine multiple channels.
视野与边界|View & boundaries
区域 · 精细度 · 缩放|Size / detail / zoom
视野边界|Boundary
实体边界|Solid
循环边界|Periodic
切换边界会按当前参数重新开始。|Changing the boundary restarts with current parameters.
培养区域|Culture size
格点精细度|Grid detail
1× · 快速|1× · Fast
1.5× · 精细|1.5× · Fine
2× · 更精细|2× · Finer
3× · 高细节|3× · High
4× · 最高细节|4× · Highest
应用区域与精细度 · 重新开始|Apply size & detail · Restart
显示分辨率|Render resolution
自动 · 适配屏幕与缩放|Auto · Screen & zoom
视野适配|View fit
铺满左侧|Fill arena
完整培养皿|Fit entire dish
中键或 Alt + 左键拖动平移视野|Pan with middle button or Alt + left drag
中键或 Alt + 左键拖动平移视野。切换适配不改变模拟。|Pan with middle button or Alt + left drag. View fitting does not change the simulation.
画面放大|Zoom
全屏 ↗|Fullscreen ↗
细胞与热图|Cells & heatmaps
Act · 标记 · 环境分量|Act / markers / fields
环境热图|Environment heatmap
关闭|Off
综合恶劣度|Combined stress
氧可用量|Oxygen availability
葡萄糖可用量|Glucose availability
酸负荷|Acid load
局部细胞密度|Local cell density
启用所选类型的 Act 显示|Enable Act for selected cell types
正常细胞 Act|Normal cell Act
肿瘤细胞 Act|Tumor cell Act
免疫细胞 Act|Immune cell Act
细分界线|Cell outlines
极性箭头|Polarity arrows
抗原标记|Antigen markers
显示细胞核|Show nuclei
细胞配色|Cell colors
预设 · 胞体 · 胞核|Presets / bodies / nuclei
细胞配色方案|Cell color palettes
原始配色|Original palette
自定义配色|Custom palette
预览从左到右：正常 · 癌前 · 肿瘤 · 免疫 · 激活|Preview: normal / precancerous / tumor / immune / activated
类型 / 状态|Type / state
胞体|Body
胞核|Nucleus
肿瘤保留增殖深浅变化|Shade tumors by proliferation trait
恢复原始配色|Restore original palette
形态与穿行|Shape & passage
分枝 · 成网 · 让位|Branches / networks / yielding
肿瘤形态|Tumor shape
紧凑 / 阿米巴样|Compact / amoeboid
间质样 · 梭形双极|Mesenchymal · Bipolar
胶质瘤样 · 分枝成网|Glioma-like · Branching
重新开始分枝成网示例|Restart branching demo
运动规则预设|Motion presets
分散探索|Disperse
偏向凝聚|Cluster
偏向群迁|Align
性能与计算|Performance
后端 · 实际速度|Backend / actual speed
微环境计算|Field solver
自动 · 实测选择|Auto · Benchmark
数量与事件统计|Population & events
正常|Normal
癌前|Precancerous
肿瘤|Tumor
免疫|Immune
其中激活|Activated
肿瘤：灰 → 黑，增殖能力低 → 高|Tumor: gray → black, low → high proliferation
肿瘤：浅 → 深，增殖能力低 → 高|Tumor: light → dark, low → high proliferation
肿瘤：统一胞体色|Tumor: uniform body color
Act：绿＝衰减中 → 红＝新生突起|Act: green = decaying → red = new protrusion
＋ 抗原可识别|＋ Recognizable antigen
实际 MCS / 秒|Actual MCS / s
总分裂（含免疫）|Divisions (all cells)
接触识别|Contact recognition
累计死亡清除|Deaths cleared
死亡清除原因|Cause of death
自发凋亡清除|Apoptosis cleared
环境死亡清除|Environmental deaths cleared
免疫杀伤清除|Immune kills cleared
自发：皱缩消失|Apoptosis: shrink and disappear
环境：灰褐萎缩|Environmental death: gray-brown shrinkage
免疫杀伤：变为橙黄色、圆化肿胀、破裂|Immune killing: amber, rounding, swelling, rupture
手动擦除|Manually erased
· 独立于死亡统计|· Separate from biological deaths
本局尚无死亡清除。|No completed death clearances yet.
尚无胞体完成死亡清除。|No dead cell body has been fully cleared yet.
本局尚无死亡事件。|No death events yet.
正在准备格点|Preparing grid
悬停画布查看局部资源与因子浓度|Hover to inspect local resources and signal levels
死亡记录|Death records
最近从画面清除|Recently cleared
最近触发死亡|Recently triggered deaths
POPULATION HISTORY|POPULATION HISTORY
情境说明|Scenario notes
情境进展|Scenario progress
恢复情境设定 ↺|Restore preset ↺
正在准备情境|Preparing scenario
预设参数|Preset parameters
参数已调整|Modified parameters
恢复当前情境的参数和种子 17，保留区域、精细度与边界选择|Restore this scenario and seed 17; keep size, detail and boundary
保存画面 ↓|Save image ↓
导出实验数据 ↓|Export experiment ↓
导入实验参数 ↑|Import parameters ↑
导入实验参数|Import parameters
● 录制视频|● Record video
● 录制 MP4|● Record MP4
● 录制 WebM|● Record WebM
正在生成视频…|Finalizing video…
录像设置|Video settings
视频格式|Video format
录像画质|Video quality
MP4 · 推荐|MP4 · Recommended
WebM · 兼容|WebM · Compatibility
1080p · 标准|1080p · Standard
1440p · 高清|1440p · High quality
4K · 超清|4K · Ultra quality
保留画布比例，高清录制时提升绘制精度；4K 文件较大。|Preserves arena proportions and renders more detail during capture; 4K files are larger.
当前浏览器不支持 MP4，请使用新版 Chrome、Edge 或 Safari，或手动选择 WebM|MP4 recording is unavailable in this browser. Use an up-to-date Chrome, Edge or Safari, or select WebM manually.
当前浏览器不支持所选视频格式|This browser cannot record the selected video format.
无法创建视频编码器，请降低画质或更换浏览器|Could not create the video encoder. Try a lower quality or a different browser.
视频编码失败，请降低画质或更换浏览器|Video encoding failed. Try a lower quality or a different browser.
■ 停止并下载|■ Stop & download
停止录制并下载|Stop recording and download
取消|Cancel
加载参数并重新开局|Load & restart
正在读取文件…|Reading file…
文件校验通过|File validated
不是有效的 JSON 实验文件|Not a valid JSON experiment file
实验文件版本暂不支持|Unsupported experiment file version
实验文件参数无效：|Invalid experiment parameter:\u0020
将忽略旧版或未知参数：|Ignoring legacy or unknown parameters:\u0020
文件超过 32 MB，请使用较小的实验参数文件|File exceeds 32 MB; use a smaller parameter file
参数已加载，已暂停重新开局|Parameters loaded; new run is paused
浏览器不支持视频录制，请使用新版 Chrome、Edge 或 Safari|Recording is unavailable. Use an up-to-date Chrome, Edge or Safari.
视频录制失败|Video recording failed
录制没有生成视频，请重试|No video was produced; please retry
Artistoo · 来源与许可|Artistoo · Sources & licenses
二维模型 · MCS 非真实时间|2D model · MCS is not real time
免疫共培养|Immune co-culture
群体迁移|Collective migration
肿瘤扩张|Tumor expansion
通道搜索|Channel search
密度与逃逸|Density & escape
癌前监视|Precancerous cell surveillance
胶质瘤样分枝成网|Glioma-like branching network
局部通讯如何改变行为|How local communication shapes behavior
代码来源、版本与许可|Code sources, versions & licenses
代码来源与第三方声明|Code sources & third-party notices
Artistoo · MIT 完整许可证|Artistoo · Full MIT license
MT19937 · BSD-3-Clause 完整许可证|MT19937 · Full BSD-3-Clause license
`);
  // Additional strings and templates are registered below.
  add(`
趋化响应|Chemotaxis
局部信号梯度对肿瘤与免疫细胞方向的影响|Influence of local signal gradients on tumor and immune cell polarity
正常／肿瘤方向协同|Normal / tumor alignment
接触的同类细胞调整极性；免疫细胞不无条件跟随同类|Contacting cells of the same type align; immune cells do not align unconditionally
凝聚倾向|Cohesion
正常细胞的共吸引与同类黏附|Normal cell attraction and adhesion to the same type
常规接触后转向|Contact turning
保留原有细胞接触规则；免疫之间另用下方独立分离参数|General contact response; immune-immune separation is controlled separately
免疫同类分离|Immune-immune separation
只影响免疫之间；有局部趋化梯度时减弱，扫描／杀伤靶细胞时不打断接触|Affects immune pairs only; weakens with chemotactic gradients and does not interrupt target scanning or killing
方向随机性|Directional noise
调低保持方向，调高加强局部探索|Lower values preserve direction; higher values increase local exploration
信号半衰期|Signal half-life
信号持续多久；墙阻断扩散|Signal persistence; walls block diffusion
正常细胞运动性|Normal cell motility
低运动性、极性与聚集可以同时存在|Low motility, polarity and clustering can coexist
肿瘤细胞运动性|Tumor motility
增强前缘活动和侵袭式游走|Strengthens leading-edge activity and invasive motion
免疫细胞运动性|Immune motility
小体积细胞通过形变和邻居重排穿行|Small cells pass through tissue by deformation and neighbor rearrangement
肿瘤生长速度|Tumor growth rate
由实际空间、遗传增殖性状、营养和累积压力共同调制|Modulated by available space, inherited proliferation, nutrients and accumulated stress
肿瘤自发凋亡强度|Tumor apoptosis hazard
每颗存活肿瘤按模型时间抽样；每 1000 MCS 的风险强度，30% 约对应 26% 发生概率|Sampled per living tumor over model time; hazard per 1000 MCS. A 30% hazard gives about 26% event probability.
初始抗原阳性比例|Initial antigen-positive fraction
只影响新播种的肿瘤；已有克隆的表达通过遗传与突变改变|Applies to newly seeded tumors; existing clones change through inheritance and mutation
接触杀伤强度|Contact killing strength
只对已识别且仍接触的靶细胞递送损伤|Delivers damage only to recognized targets that remain in contact
膜形变波动|Membrane fluctuations
CPM 温度，影响随机复制尝试的接受率|CPM temperature; controls acceptance of stochastic pixel-copy attempts
氧糖补给与酸清除|Nutrient supply & acid removal
培养液储库补给；调低后密集区域更容易恶化|Supply from the medium; lower values make dense regions more vulnerable
消耗与产酸强度|Consumption & acid production
按实际细胞占据面积与邻域密度持续计算|Continuously computed from cell occupancy and neighboring density
恶劣环境逃逸|Escape from adverse conditions
沿局部氧糖上升、酸负荷下降的方向重新极化|Repolarize toward higher local nutrients and lower acid load
识别后招募信号|Recruitment after recognition
实际接触识别癌前或肿瘤后分泌；仅被吸引者不自动接力|Secreted after contact recognition; attracted cells do not automatically relay the signal
激活后免疫生长|Activated immune growth
接触识别后才有自动克隆扩增，受代谢状态限制|Clonal expansion requires contact recognition and is limited by metabolism
新免疫细胞分裂预算|New immune cell division limit
每次分裂，两颗子细胞均扣一次；只影响新播种的细胞|Each daughter loses one remaining division; this setting applies to newly seeded cells
每项性状突变概率|Mutation probability per trait
肿瘤分裂时分别抽样耐受、增殖、侵袭和抗原表达|Tolerance, proliferation, invasion and antigen expression mutate independently at division
突变幅度|Mutation size
随机双向变异；环境选择存活者，不定向创造突变|Random changes in either direction; the environment selects survivors without directing mutations
环境损伤致癌前|Stress-induced precancerous change
持续代谢损伤提高正常 → 癌前风险；0 关闭此通路，炎性通路独立设置|Sustained metabolic damage raises normal → precancerous risk; 0 disables this pathway, independently of inflammation
炎性信号促癌|Inflammation-associated transformation
局部损伤／免疫招募信号持续累积后增加正常 → 癌前风险；0 关闭，仍经过癌前细胞。未标定的炎症代理|Sustained damage/recruitment signals increase normal → precancerous risk. 0 disables this uncalibrated inflammation proxy.
癌前 → 肿瘤风险倍率|Precancerous → tumor risk multiplier
癌前至少保留 160 MCS；倍率调整后仍是随机事件，0 保留中间态|Precancerous cells persist for at least 160 MCS; progression remains stochastic. 0 retains the intermediate state.
切面让位上限|Maximum section yielding
受邻居推挤时减少可见目标面积，压力解除后逐步恢复；总生物量保留|Reduce visible target area under crowding, then recover gradually; total target biomass is retained
突起延伸范围|Protrusion reach
相对胞体等效半径的可达范围；真实长度仍取决于空间和胞质量|Reach relative to equivalent body radius; actual length depends on space and cytoplasm
分枝形态保持|Branch shape persistence
局部骨架形变偏好，越强越保持分枝；不会越墙或跳过核区约束|Local shape preference; stronger values retain branches while respecting walls and nuclei
侧枝萌生倾向|Lateral branching
在局部胞体或已有突起上形成新前缘；数量不固定，0 仍保留基础伸展与回缩|New fronts emerge locally on the body or existing protrusions; branch count varies. 0 retains basic extension and retraction.
接触网络稳定性|Contact network stability
只稳定持续接触的肿瘤对；0 关闭成网黏附，不产生隔空连接|Stabilizes sustained tumor contacts only. 0 disables network adhesion; no distant connections.
单击加入一颗，可挤入已有细胞区域；邻居变形、核区逐格让位，切面缩小不超过设定上限，总目标量保留。只检查局部空间，不按总数量拒绝新增；挤入失败不改动原有细胞。|Click to add one cell, even in occupied tissue. Neighbor bodies and nuclei yield locally within the section limit, preserving total target biomass. Insertion depends on local space, not population count; a failed attempt leaves existing cells unchanged.
0% 隐藏，50% 以下保留胞体本色；超过 50% 逐步增强，100% 完整显示图层，可覆盖胞体色。细胞核和边界仍保留；各通道独立调节，环境分量分别记忆。|0% hides the layer; below 50% cell colors are protected. Above 50% the layer grows stronger, reaching full opacity at 100%. Nuclei and outlines remain visible. Each channel remembers its own opacity.
区域扩大空间；精细度增加真实形态格点，最高 1024 × 768。细胞物理尺寸近似保持；更大、更细会增加计算量。|Culture size adds space; detail increases physical grid resolution, up to 1024 × 768. Cell size stays approximately constant. Larger, finer grids require more computation.
显示分辨率即时生效，保存 PNG 使用同样尺寸；它不改变物理格点，也不重开模拟。|Render resolution applies immediately and also sets PNG dimensions. It does not change the physical grid or restart the model.
默认配色：免疫未激活淡红，实际识别后激活深红；肿瘤遗传增殖性状越高越黑，范围 0.25–3。核区默认用深蓝、深红或浅金。可在「细胞配色」分别修改；各类 Act 独立开启，开启后覆盖局部胞体色。|Default colors: resting immune cells are pale red; recognized targets trigger deep red activation. Tumors darken with inherited proliferation (0.25–3). Nuclei use blue, red or pale gold. Customize each under Cell colors. Act can independently override local body colors.
点击方案立即应用，也可继续自定义，颜色保存在当前浏览器；不会重启模拟。高增殖使用所选肿瘤色，低增殖逐渐变浅；关闭上方选项可使用统一纯色。Act 与高强度热图仍可覆盖胞体色，关闭图层可查看本色。|Apply a palette or customize colors, saved in this browser without restarting. Higher proliferation uses the selected tumor color; lower values lighten it. Disable shading for uniform colors. Act and strong overlays can still override body colors.
切换后，已有肿瘤逐渐重塑真实胞体。分枝接触持续 20 MCS 后开始稳定连接；分离或死亡即解除。U87 等胶质瘤形态研究启发，未经细胞系标定。|Existing tumors gradually reshape. Branch contacts stabilize after 20 MCS and break on separation or death. Inspired by glioma morphology, including U87; not calibrated to a cell line.
增殖由空间、营养、累积压力与细胞自身状态决定。算力不足时提示实际速度，继续完整计算形变、接触和微环境；可降低播放倍率或绘图分辨率。|Growth depends on space, nutrients, stress and cell state. If computing power is limited, the actual speed is shown; deformation, contact and fields remain fully computed. Reduce playback speed or rendering resolution if needed.
胞体消失时计入清除。自发凋亡设为 0% 只阻止新的随机凋亡；环境死亡、免疫杀伤和此前已触发的死亡仍会继续。|Clearance is counted when the body disappears. Setting apoptosis to 0% prevents new spontaneous events; environmental deaths, immune killing and previously triggered deaths continue.
触发后进入相应死亡过程，胞体消失时记为清除；三种原因分别统计。下方按清除和触发分别显示最近 8 次，导出实验数据包含本局完整记录。|Death begins when triggered; clearance is counted when the body disappears. The three causes are tracked separately. The lists show the latest 8 events; experiment exports include the full record.
从开局到当前时刻；每 30 MCS 采样，手动新增／分裂即时记入，当前数量实时补齐。长记录绘图保留峰谷，导出包含完整采样。|From the start to the present: sampled every 30 MCS, with manual additions/divisions recorded immediately and current counts appended. Long plots preserve extrema; exports retain all samples.
情境进度与开局|Scenario progress & setup
情境设定与实际进度|Scenario setup and observed progress
正常、癌前、肿瘤和免疫细胞数量随模型时间变化|Normal, precancerous, tumor and immune populations over model time
可拖动细胞、点击播种、添加信号或绘制障碍的交互培养皿|Interactive dish: drag or add cells, release signals and draw walls
可遗传的增殖性状，固定范围 0.25–3；实际增殖还受营养、压力与全局生长参数影响|Inherited proliferation trait, fixed range 0.25–3. Actual growth also depends on nutrients, stress and the growth parameter.
加载后按文件中的情境、种子和参数重新开局并暂停，不恢复导出时的细胞布置、障碍、浓度场或统计历史。|Load the saved scenario, seed and parameters as a new paused run. This does not restore the exported cell layout, walls, concentration fields or history.
示例会重新播种一片肿瘤细胞，观察突起逐渐形成与连接。|The demo reseeds tumor cells to show protrusions forming and connecting.
该环境格被实体障碍阻断，暂无有效浓度。|A solid wall blocks this field location; concentrations are unavailable.
氧／糖／酸为 0–1 模型量；因子为模型浓度，无实验单位。读数来自当前位置的环境网格。|Oxygen, glucose and acid are normalized model quantities (0–1). Signals use model concentrations, without experimental units. Values come from the local field grid.
Act：红＝新生突起 → 黄 → 绿＝活性衰减；零活性恢复胞体色。|Act: red = new protrusion → yellow → green = decaying activity. Zero activity restores the body color.
胞体与胞核颜色可在「细胞配色」调整；免疫激活由真实接触识别触发。|Edit body and nucleus colors under Cell colors. Immune activation requires actual contact recognition.
肿瘤增殖性状越高，胞体越接近所选深色（0.25–3 固定色标）。|Higher tumor proliferation approaches the selected dark color (fixed scale 0.25–3).
：增强低浓度显示，非线性固定色标；重叠混色，原始浓度见悬停。|: fixed nonlinear enhancement reveals low concentrations; layers blend. Hover for raw values.
0 友好 → 1 恶劣；综合低氧、低糖与高酸，不是细胞累计损伤|0 favorable → 1 adverse; combines low oxygen, low glucose and high acid, not accumulated cell damage
0 低氧 → 1 补给浓度|0 hypoxia → 1 supply concentration
0 耗尽 → 1 补给浓度|0 depleted → 1 supply concentration
0 低 → 1 高；不是实验 pH|0 low → 1 high; not experimental pH
0 稀疏 → 1 密集；近邻平滑占据率|0 sparse → 1 dense; smoothed local occupancy
友好 0 → 1 恶劣|Favorable 0 → 1 adverse
岩灰 · 珊瑚|Slate · Coral
瓷白 · 朱砂|Porcelain · Cinnabar
雾青 · 胭脂|Lagoon · Carmine
雾紫 · 玫瑰|Violet · Rose
冷灰胞体，珊瑚免疫|Cool gray bodies, coral immune cells
暖灰组织，朱砂激活|Warm gray tissue, cinnabar activation
青灰基调，胭脂点缀|Blue-green tissue, carmine accents
灰紫组织，玫瑰免疫|Muted violet tissue, rose immune cells
· 推荐|· Recommended
当前：|Current:\u0020
当前|Current
格点|grid
配色| palette
应用|Apply\u0020
颜色| color
局部趋化|Local chemotaxis
分散巡逻|Dispersed patrol
探索|Searching
接触扫描|Contact scanning
识别后递送损伤|Delivering recognized-target damage
免疫杀伤 · 圆化|Immune killing · Rounding
免疫杀伤 · 肿胀待裂解|Immune killing · Swelling
免疫杀伤 · 破裂|Immune killing · Rupture
自发凋亡 · 皱缩|Apoptosis · Shrinking
环境死亡 · 萎缩|Environmental death · Withering
死亡清除中|Death clearance
自发凋亡|Spontaneous apoptosis
免疫杀伤|Immune killing
环境死亡|Environmental death
清除中|Clearing
已触发|Triggered
已清除|Cleared
手动中止|Manually interrupted
触发死亡：|Death triggered:\u0020
触发|Triggered
死亡原因：|Death cause:\u0020
持续代谢压力|Sustained metabolic stress
免疫递送损伤|Immune-delivered damage
代谢效能|Metabolic fitness
累积压力|Accumulated stress
邻接拥挤|Crowding
癌前已持续|Precancerous for
尚未获得肿瘤增殖／侵袭表型|No tumor growth or invasion phenotype yet
可被接触识别|Recognizable by contact
低于识别阈值|Below recognition threshold
局部炎性信号|Local inflammatory signal
累积暴露|Accumulated exposure
切面目标|Section target
切面外储量|Off-plane reserve
总目标量|Total target
遗传：耐受|Traits: tolerance
抗原表达|Antigen expression
抗原|Antigen
可识别|Recognizable
源自正常细胞|Originated from a normal cell
动态分枝|Dynamic branches
梭形双极|Bipolar spindle
伸展／回缩中的突起|Extending / retracting protrusions
稳定接触|Stable contacts
个邻居| neighbors
杀伤损伤|Cytotoxic damage
抗原阳性|Antigen-positive
癌前发生|Precancerous transitions
恶性转变|Malignant transitions
肿瘤分裂|Tumor divisions
存活肿瘤|Living tumors
原灶外肿瘤|Tumors beyond origin
远端分裂|Distal divisions
残留肿瘤胞体|Remaining tumor bodies
癌前免疫清除|Precancerous cells killed
免疫清除|Immune clearances
清除后观察|Observation after clearance
免疫分裂|Immune divisions
性状突变|Trait mutations
种子|Seed
开局：|Initial:\u0020
；区域、参数和手动操作会改变演化。|; size, parameters and manual edits affect the outcome.
当前显示／PNG：|Render / PNG:\u0020
像素；物理格点|pixels; physical grid
位置|Position
全程|Full history
极性一致度|Polarity alignment
面积|Area
接触 #|Contact #
氧|Oxygen
糖|Glucose
酸|Acid
增殖|Proliferation
侵袭|Invasion
激活|Activation
招募|Recruitment
目标|Target
MCS / 秒|MCS / s
独立计算线程|Dedicated worker
固定模型步长|Fixed model steps
算力不足，实际推进较慢；生长与分裂继续计算|Compute limited; slower progress, growth and division remain active
颗 ·|cells ·
格点 ·|grid ·
精细度|detail
细胞较多，计算和交互可能变慢。|Large population; computation and interaction may slow down.
不按细胞数量冻结生长或分裂。|Population count does not freeze growth or division.
绘图：|Rendering:\u0020
WebGL2 软件|WebGL2 software
形变：|Deformation:\u0020
优化 JS CPU|Optimized JS CPU
参考 JS CPU|Reference JS CPU
初始化计算后端…|Initializing backend…
浏览器没有开放 WebGPU|WebGPU is not available in this browser
没有可用的 WebGPU 适配器|No WebGPU adapter is available
已选择 CPU 微环境；GPU 绘图独立运行。|CPU field solver selected; GPU rendering is independent.
WebGPU 扩散与反应；每次读回完成后才推进接触和生物行为。|WebGPU diffusion and reactions; contact and biology advance after readback.
CPU / GPU 数值校验未通过：|CPU / GPU numerical check failed:\u0020
WebGPU 不可用，已使用 CPU：|WebGPU unavailable; using CPU:\u0020
WebGPU 中断，当前步已改用 CPU 重算：|WebGPU interrupted; this step was recomputed on CPU:\u0020
相同 4 MCS 微环境实测：|Field benchmark for 4 MCS:\u0020
GPU（含传输）|GPU (including transfers)\u0020
；自动选择|; auto-selected\u0020
操作超时：|Operation timed out:\u0020
此处完整胞体会碰到已有细胞|The full cell body would overlap existing cells
局部挤入失败：核区或切面让位额度不足，周围细胞保持原状|Insertion failed: insufficient nuclear space or yielding capacity. Neighbors are unchanged.
此处被实体障碍挡住|Blocked by a solid wall
胞体会超出实体边界，请向内移动|The body would extend beyond the boundary; move inward
这处空间放不下完整核区|Not enough space for the protected nucleus
新增参数无效|Invalid cell insertion parameters
随机尝试未找到足够空隙，可在画布上单击尝试挤入|No random free-space position found; click the arena to try local insertion
加入了细胞 #|Added cell #
未加入细胞|No cell added
；已挤入，|; inserted,\u0020
颗邻居让位|neighbors yielded
前方是实体边界，或局部空间不足以容纳完整核区|Blocked by a boundary or insufficient space for the protected nucleus
请在一个存活的细胞上按住拖动|Press and drag a living cell
应用后：|After applying:\u0020
真实格点|physical grid
区域|area
已恢复当前情境的参数、种子与初始细胞|Scenario parameters, seed and founders restored
已按新的边界条件重新开始|Restarted with the new boundary
正在创建格点与细胞…|Creating grid and cells…
计算区域与真实格点精细度已更新|Culture size and physical grid detail updated
肿瘤形态偏好已更新，胞体将逐步重塑|Tumor shape preference updated; bodies will remodel gradually
障碍已清除|Walls cleared
请先点击选中一颗细胞|Select a cell first
已分裂出细胞 #|Daughter cell #
面积不足、免疫分裂次数耗尽或轮廓受限|Insufficient area, no divisions left, or shape constraints prevent division
局部规则已更新；变化会逐步形成|Local rules updated; changes develop gradually
情境：|Scenario:\u0020
录制中|Recording
纯正常上皮，中心酸清除弱、氧糖补给略低，外围环境较好。局部代谢压力经癌前细胞推动随机癌变；新生肿瘤采用较高遗传耐受基线，观察存活克隆向外围扩增。|Normal epithelium with poor acid clearance and lower nutrient supply in the center. Local stress drives stochastic transformation through a precancerous state. New tumors have a higher tolerance baseline; surviving clones can expand outward.
正常细胞铺满背景，中央嵌入 19 颗低抗原肿瘤，外围仅 3 颗免疫细胞。梭形肿瘤在有限组织让位下侵袭、扩增；招募与扩增支持较弱。这是二维局部播散代理，不含血管或跨器官转移。|A confluent normal sheet contains 19 central low-antigen tumors and only 3 peripheral immune cells. Spindle-shaped tumors invade and grow through bounded tissue yielding, with weak recruitment and expansion support. This is a 2D local-spread proxy, without vascular or cross-organ metastasis.
正常细胞铺满背景，中央嵌入 37 颗高抗原肿瘤，18 颗免疫细胞分散在病灶周边的组织内。通过接触识别、局部招募及 IL-2 支持的有限扩增清除肿瘤；关闭杀伤可作对照。|A confluent normal sheet contains 37 central high-antigen tumors and 18 immune cells in the surrounding tissue. Contact recognition, local recruitment and IL-2-supported limited expansion support clearance; turn off killing for a control.
`);
  add(`
新生肿瘤克隆扩增|New tumor clone expansion
肿瘤已发生|Tumor has emerged
肿瘤已出现，当前无存活肿瘤|Tumors emerged; none currently alive
已发生癌前细胞|Precancerous intermediate state emerged
环境压力累积|Environmental stress accumulating
局部资源消耗|Local resource consumption
原灶外播散并增殖|Spread and proliferation beyond the origin
肿瘤向原灶外扩散|Tumors spreading beyond the origin
原发灶扩增|Primary lesion expansion
低免疫浸润的原发灶|Primary lesion with low immune infiltration
当前区域肿瘤已消失|No tumor bodies remain in this area
当前区域持续清除|Sustained local clearance
清除后继续观察|Post-clearance observation
靶细胞凋亡清除中|Target cell clearance underway
免疫清除进行中|Immune clearance underway
接触识别与招募|Contact recognition and recruitment
浸润与接触扫描|Infiltration and contact scanning
Artistoo 作者为 Johannes Textor 与 Inge Wortel，使用 MIT 许可；固定提交 e997d81213a5dcdfc40ad976a18958f412f00cc9 的官方文件原样内嵌。优化 JS 约束与 WebAssembly 内核包含对 Artistoo 顺序 CPM 与约束代码的专门化／移植，Act 配色沿用其 Canvas.drawActivityValues。|Artistoo is by Johannes Textor and Inge Wortel, under the MIT license. Its official file at commit e997d81213a5dcdfc40ad976a18958f412f00cc9 is embedded unchanged. Optimized JavaScript constraints and the WebAssembly kernel specialize or port Artistoo sequential CPM and constraint code. Act coloring follows Canvas.drawActivityValues.
随 Artistoo 带入的 MT19937 随机数实现由 Makoto Matsumoto 与 Takuji Nishimura 编写，包内另保留 Sean McCullough 的 JavaScript 封装署名，采用 BSD 三条款许可；WASM 随机数部分移植同一实现。两个完整许可证均保留在本页面。|The MT19937 implementation bundled with Artistoo is by Makoto Matsumoto and Takuji Nishimura; the package also preserves Sean McCullough's JavaScript wrapper credit, under the BSD 3-Clause license. The WASM random generator ports the same implementation. Both complete licenses are retained on this page.
逐文件范围见|For file-by-file attribution, see\u0020
。通讯、代谢、遗传、切面约束和交互为本网页的模型扩展；详细机制参考见模型文档。|. Communication, metabolism, inheritance, section constraints and interaction are extensions in this page; detailed mechanism references are in the model documentation.
`);
  const templates=[
    [/^正常保留 (\d+)%（(\d+)\/(\d+)） · 供给／清除 (\d+)%( · 尚未建立正常细胞基准)?$/,(_,p,n,b,f,empty)=>`Normal retained ${p}% (${n}/${b}) · Supply / clearance ${f}%${empty?' · No normal-cell reference yet':''}`],
    [/^当前存活已检查 (\d+) \/ (\d+)$/,(_,n,total)=>`Living cells inspected: ${n} / ${total}`],
    [/^本细胞已检查 (\d+) 颗不同组织细胞$/,(_,n)=>`This cell inspected ${n} distinct tissue cells`],
    [/^子代 P(\d+) · 沿谱系分裂 (\d+) 次$/,(_,p,n)=>`Generation P${p} · ${n} divisions along lineage`],
    [/^观察谱系：相对第 (\d+) 代 · 标记 (\d+) 颗$/,(_,g,n)=>`Observed family: relative generation ${g} · ${n} cells marked`],
    [/^首达 #([\d/]+) · (\d+) MCS$/,(_,n,t)=>`First #${n} · ${t} MCS`],
    [/^(减小|增大)(.+)$/,(_,action,name)=>`${action==='减小'?'Decrease':'Increase'} ${translate(name)}`],
    [/^(正常细胞|癌前细胞|肿瘤细胞|未激活免疫|已激活免疫)(胞体|胞核)颜色$/,(_,type,part)=>`${dictionary.get(type)} ${dictionary.get(part).toLowerCase()} color`],
    [/^应用(.+)配色$/,(_,name)=>`Apply ${translate(name)} palette`],
    [/^最近 (\d+) 颗清除：(.+)$/,(_,n,causes)=>`${n} recent clearances: ${translate(causes)}`],
    [/^(.+) MCS · #(\d+) · (自发凋亡|免疫杀伤|环境死亡) · 已清除（(.+) MCS 触发）$/,(_,t,id,cause,start)=>`${t} MCS · #${id} · ${translate(cause)} · Cleared (triggered at ${start} MCS)`],
    [/^(.+) · 伸展／回缩中的突起 (\d+) 处 · 稳定接触 (\d+) 个邻居$/,(_,shape,n,k)=>`${translate(shape)} · ${n} extending/retracting protrusions · ${k} stable neighbors`],
    [/^第 (\d+) 代 · 剩余分裂 (\d+) 次$/,(_,g,n)=>`Generation ${g} · ${n} divisions left`],
    [/^克隆 #(\d+) · 第 (\d+) 代 · 杀伤损伤 ([\d.]+)%$/,(_,c,g,d)=>`Clone #${c} · Generation ${g} · Cytotoxic damage ${d}%`],
    [/^参数 (\d+) 项 · 导出时刻 ([\d.,]+) MCS$/,(_,n,t)=>`${n} parameters · Exported at ${t} MCS`],
    [/^当前 (\d+) 颗 · 按局部空间尝试加入$/,(_,n)=>`${n} cells · Insertion depends on local space`],
    [/^已手动擦除 (\d+) 颗细胞$/,(_,n)=>`Manually erased ${n} cells`],
    [/^加入了 (\d+) \/ (\d+) 颗细胞$/,(_,n,k)=>`Added ${n} / ${k} cells`],
    [/^当前稳定接触 ([\d.]+) 对；各细胞保持独立胞体。$/,(_,n)=>`${n} stable contacts; cell bodies remain separate.`],
    [/^视频已导出 · (\d+) 秒 · ([\d.]+) MB$/,(_,s,mb)=>`Video saved · ${s} s · ${mb} MB`],
    [/^视频已导出 · (MP4|WebM) · (\d+) × (\d+) · (\d+) 秒 · ([\d.]+) MB$/,(_,format,w,h,s,mb)=>`Video saved · ${format} · ${w} × ${h} · ${s} s · ${mb} MB`],
    [/^正常、癌前、肿瘤和免疫细胞数量：从 0 到 (\d+) MCS 的完整过程$/,(_,t)=>`Normal, precancerous, tumor and immune populations from 0 to ${t} MCS`]
  ];
  add(`
免疫巡逻统计|Immune patrol statistics
巡逻覆盖率|Patrol coverage
累计检查的不同细胞|Distinct cells inspected
巡逻统计口径|How patrol is measured
覆盖率＝免疫胞体实际经过的面积／当前非障碍面积，封闭区域仍计入分母。拖动路径不计入自主巡逻。|Coverage = area occupied by patrolling immune bodies / current non-wall area, including enclosed regions. Manual drag paths do not count.
检查需连续膜接触累积达到 6 个有效 MCS，按接触长度和代谢效能加权。正常、癌前、肿瘤均可计入；按出生身份去重，分裂子代重新统计。已检查不等于已识别抗原。|Inspection requires 6 effective MCS of uninterrupted membrane contact, weighted by contact length and metabolic fitness. Normal, precancerous and tumor cells count once per birth identity; daughters count separately. Inspection does not imply antigen recognition.
巡逻转向|Patrol reorientation
巡逻接触扫描|Patrol contact scanning
持续巡逻|Persistent patrol
招募扩散：沿通道|Recruitment: along corridors
招募扩散：穿墙|Recruitment: through walls
仅切换招募因子扩散；细胞仍不能穿墙|Switch recruitment diffusion only; cells cannot cross walls
迷宫招募场：0—30 固定色标，圆心持续供给，入口清除。|Maze recruitment field: fixed 0–30 scale, sustained center supply and entrance drainage.
免疫细胞迷宫|Immune cell maze
免疫迷宫|Maze
向圆心出发|Race to the center
探索中|Exploring
已移除|Removed
＋ 持续场源|＋ Field sources
持续区域|Persistent region
氧糖补给|Oxygen & glucose
乏氧高酸|Hypoxia & acidity
区域半径|Region radius
放置场源|Place source
擦除场源|Erase source
持续作用，直至擦除；实体墙阻断扩散。氧糖补给直接改变营养场。|Persists until erased; walls block diffusion. Nutrient sources directly replenish oxygen and glucose.
放置或擦除持续场源 · 不改变细胞位置|Place or erase persistent field sources
显示运动轨迹|Show movement trails
轨迹保留时长|Trail duration
开启后记录；按模拟时间保留，暂停时不消退。|Recorded while enabled, retained in model time; trails do not fade while paused.
免疫迷宫需要至少 144 的区域短边|The maze needs a world with its shorter side at least 144 units
正常细胞铺满培养皿，4 颗免疫细胞分散在单层内部。中心酸清除弱、氧糖补给略低；局部代谢压力经癌前细胞推动随机癌变，免疫细胞进行接触监视。|Normal cells fill the dish with 4 immune cells dispersed inside the monolayer. Reduced central acid clearance and nutrient supply allow local stress to drive stochastic transformation through a precancerous state, under contact-based immune surveillance.
圆心持续释放最强招募信号，入口清除信号；开局已建立沿通道扩散的浓度场。6 颗免疫细胞从等距入口出发，仅凭局部梯度与随机探索前进，胞核进入中心终点区计时。|The center maintains a maximal recruitment source and entrances drain the signal. Diffusion through the passages is equilibrated before the race. Six immune cells start at evenly spaced entrances, using local gradients and random exploration. Arrival is recorded when the nucleus enters the central finish zone.
`);
  add(`
细胞周期与静息|Cell cycle & quiescence
细胞内标记|Cell markers
细胞标记|Cell markings
抗原轮廓|Antigen outline
周期文字|Cycle labels
红色轮廓：抗原可识别|Red outline: recognizable antigen
红色细线标出可识别抗原的肿瘤和癌前细胞|Thin red outlines mark tumor and precancerous cells with recognizable antigen
不显示|None
细胞核|Nuclei
细胞周期阶段|Cell cycle phase
G0 静息 · G1 生长 · S 复制 · G2 准备 · M 分裂|G0 resting · G1 growth · S replication · G2 preparation · M division
细胞周期与扩增|Cell cycle & expansion
细胞周期统计|Cell cycle statistics
细胞周期|Cell cycle
阶段进度|Phase progress
周期阻滞|Arrested
周期推进|Cycle progressing
整合增殖信号|Integrating proliferation signals
生长参数关闭|Growth control is off
氧糖或代谢不足|Insufficient nutrients or metabolic fitness
酸负荷过高|Excessive acidity
累积损伤待恢复|Recovering from accumulated injury
谱系分裂上限|Lineage division limit reached
慢性刺激耗竭|Chronic stimulation exhaustion
抗原记忆不足|Insufficient antigen memory
IL-2 支持不足|Insufficient IL-2 support
实际空间不足|Insufficient physical space
等待胞体生长|Waiting for biomass growth
分裂几何受限|Cytokinesis blocked by geometry
IL-2 扩增信号|IL-2 expansion signal
抗原刺激记忆|Antigen stimulation memory
慢性耗竭|Chronic exhaustion
局部 IL-2|Local IL-2
扩增响应|Expansion response
免疫扩增速度|Immune expansion rate
新免疫细胞谱系分裂上限|New immune lineage division limit
肿瘤基础周期|Baseline tumor cycle
肿瘤压缩静息敏感性|Tumor compression sensitivity
免疫基础周期|Baseline immune cycle
抗原刺激记忆半衰期|Antigen memory half-life
识别后 IL-2 分泌|IL-2 secretion after recognition
IL-2 半衰期|IL-2 half-life
慢性刺激耗竭速率|Chronic exhaustion rate
抗原刺激记忆与 IL-2 共同支持；受营养、耗竭和实际空间限制|Supported jointly by antigen memory and IL-2; limited by nutrients, exhaustion and physical space
实验性谱系上限；每次分裂，两颗子细胞均扣一次；只影响新播种|Experimental lineage limit; both daughters spend one division; applies to new cells only
G1／S／G2／M 的基础总时长；实际由增殖性状、生长参数和环境调节|Baseline G1/S/G2/M duration, modulated by the proliferation trait, growth control and environment
由实际面积相对切面目标的压缩触发；0 只关闭此生物学闸门，几何限制保留|Triggered by compression relative to the section target; 0 disables this biological gate while retaining geometry constraints
许可后的基础总时长；停止直接接触不会立即清空扩增记忆|Baseline duration after licensing; leaving a target does not immediately erase expansion memory
内部扩增许可逐渐衰减，子代继承并稀释；不是即时杀伤激活|Internal expansion license decays and is inherited and diluted by daughters; separate from immediate killing activation
真实抗原刺激后短时分泌；IL-2 支持扩增，不作为趋化或抗原替代|Short-lived secretion after real antigen stimulation; IL-2 supports expansion without replacing antigen or acting as a chemotactic cue
独立扩散、衰减和摄取；可用持续场源外源补充|Independent diffusion, decay and uptake; persistent sources provide external supplementation
持续抗原刺激逐渐降低扩增和杀伤；补足营养不会立即清空耗竭|Chronic antigen stimulation gradually reduces expansion and killing; refeeding does not instantly erase exhaustion
手动分裂（实验干预）|Manual division (intervention)
实验干预：绕过周期许可，仍受胞体、胞核和分裂几何限制|Experimental intervention: bypass cycle licensing while retaining body, nucleus and division geometry constraints
`);
  add(`
演化实验|Evolution experiments
突变与抗原演化|Mutation & antigen evolution
正常细胞压力致变|Stress-induced normal variation
肿瘤压力致变|Stress-induced tumor variation
突变适应偏向|Mutation adaptation bias
压力诱导抗原暴露|Stress-induced antigen exposure
接触选择下的抗原丢失|Contact-selected antigen loss
持续招募下的抗原丢失|Antigen loss under recruitment exposure
选择压力记忆时长|Selection memory timescale
遗传性状变化幅度；默认双向随机，可用适应偏向进行对照实验|Size of heritable changes; bidirectional by default, with optional adaptation bias for experiments
氧糖不足、高酸与持续炎症提高耐受性状变化及癌变风险；0 关闭额外放大|Low oxygen/glucose, acidity and sustained inflammation amplify tolerance variation and transformation risk; 0 disables amplification
局部压力提高分裂时突变率，并允许存活肿瘤在两次分裂之间发生性状变化|Local stress raises division-time mutation rates and allows trait changes in surviving tumors between divisions
负值偏向不利、0 双向随机、正值偏向耐受与逃逸；这是实验偏置，不保证生存获益|Negative favors adverse changes, 0 is unbiased, positive favors tolerance/escape; an experimental bias, not guaranteed benefit
抗原阴性肿瘤在持续恶劣环境下转为阳性的速率；可检验假设，非普遍生物规律|Rate of antigen-negative tumors becoming positive under stress; an experimental hypothesis, not a universal biological rule
存活靶细胞每次有效免疫接触积累选择压力；持续接触只记一次，分离后可重新计数|Surviving targets accumulate selection pressure from effective immune encounters; continuous contact counts once, separation permits another encounter
持续招募信号暴露提高存活抗原阳性细胞的表型丢失风险；不会直接治愈已受损细胞|Sustained recruitment exposure raises phenotypic loss risk in surviving antigen-positive cells without repairing existing damage
接触记忆的半衰期与招募暴露的积累时间尺度；离开后衰减，分裂后稀释|Half-life of contact memory and accumulation timescale of recruitment exposure; decays after departure and dilutes at division
正常耐受变异|Normal tolerance changes
肿瘤间期变异|Tumor interphase changes
压力抗原暴露|Stress-induced antigen gains
选择性抗原丢失|Selected antigen losses
环境致变压力|Mutagenic environmental pressure
耐受性状|Tolerance trait
有效免疫接触|Effective immune encounters
接触选择记忆|Contact selection memory
持续招募暴露|Sustained recruitment exposure
`);
  add(`
正常细胞铺满培养皿，4 颗免疫细胞分散在单层内部。中心酸清除弱、氧糖补给略低；代谢与炎症压力提高随机变异，经癌前细胞产生肿瘤；耐受变异、细胞死亡与免疫监视共同筛选存活克隆。|Normal cells fill the dish with 4 dispersed immune cells. Reduced central acid clearance and nutrient supply cause local stress. Metabolic and inflammatory pressure increase variation through a precancerous intermediate; tolerance variation, death and immune surveillance select surviving clones.
正常细胞铺满背景，中央嵌入 19 颗低抗原肿瘤，外围仅 3 颗免疫细胞。梭形肿瘤侵袭扩增，压力提高性状变异，部分克隆可能暴露抗原；免疫招募较弱。这是二维局部播散，不含血管或跨器官转移。|A confluent normal sheet contains 19 central low-antigen tumors and 3 peripheral immune cells. Spindle tumors invade and expand; stress increases trait variation and may expose antigen, under weak recruitment. A 2D local-spread model, without vascular or cross-organ metastasis.
正常细胞铺满背景，中央嵌入 37 颗高抗原肿瘤，18 颗免疫细胞分散在病灶周边的组织内。接触识别、招募及 IL-2 扩增支持早期清除；少数存活克隆可能丢失抗原并再次扩增。结局随种子改变，关闭杀伤可作对照。|A confluent normal sheet contains 37 central antigen-positive tumors and 18 surrounding immune cells. Contact recognition, recruitment and IL-2 support early clearance; occasional survivors may lose antigen and regrow. Outcomes vary by seed. Turn killing off for a control.
`);
  add(`
免疫抑制样细胞|Suppressive-like immune cell
免疫抑制样|Suppressive-like immune
正常细胞损伤信号|Normal-cell injury signal
免疫抑制信号|Immune suppression signal
正常损伤|Normal injury
免疫抑制|Immune suppression
损伤应答与免疫抑制|Injury response & immune suppression
损伤暴露转抑制态|Injury-driven suppressive conversion
抑制态恢复速度|Suppressive-state recovery rate
当前正常损伤信号和累计暴露均降低后，蓝色细胞按概率恢复粉色；越大恢复越快，0 关闭恢复|Blue cells can return to pink once both current normal-injury signals and accumulated exposure fall; higher values speed recovery, 0 disables it
损伤暴露退激活|Injury-driven deactivation
抑制态信号分泌|Suppressive signal secretion
抑制信号退激活|Signal-driven deactivation
正常损伤暴露记忆|Normal-injury exposure memory
正常细胞损伤信号暴露越强、越久，粉色巡逻细胞转蓝概率越高；0 关闭转变|Stronger and longer normal-injury exposure raises pink-to-blue conversion risk; 0 disables conversion
持续正常细胞损伤信号提高红色免疫细胞退回粉色的概率|Sustained normal-injury signals raise the chance that red immune cells return to pink
蓝色细胞沿自身胞体分泌独立免疫抑制信号，随局部代谢效能变化|Blue cells secrete a separate suppressive signal along their body, scaled by metabolic fitness
局部抑制信号提高红色转粉色的概率；退激活后 240 MCS 内不能立即重新识别|Local suppression raises red-to-pink transition risk, followed by a 240 MCS reactivation delay
暴露按胞体附近的正常损伤信号积累，离开后渐减；肿瘤报警与 IL-2 不直接触发|Exposure integrates normal-injury signal across the body and decays after departure; tumor alarm and IL-2 do not directly trigger it
免疫抑制／再激活等待|Immune suppression / reactivation delay
正常损伤暴露|Normal-injury exposure
局部抑制信号|Local suppression signal
抑制样表型：分泌抑制信号，保留运动，停止抗肿瘤杀伤|Suppressive-like phenotype: secretes suppression, retains movement, stops antitumor killing
抑制样表型：趋向正常损伤，分泌抑制信号；暴露降低后可恢复粉色|Suppressive-like phenotype: moves toward normal injury and secretes suppression; may return to pink after exposure falls
再激活等待|Reactivation delay
其中抑制|Of these, suppressive
转抑制态|Suppressive transitions
恢复静息态|Recoveries to resting state
损伤退激活|Injury deactivations
信号退激活|Signal deactivations
`);
  let terms;
  function translate(value,language='en'){
    const source=String(value);if(language!=='en'||!/[\p{Script=Han}]/u.test(source))return source;
    const key=source.trim();if(dictionary.has(key))return source.replace(key,dictionary.get(key));
    if(cache.has(source))return cache.get(source);
    const lines=source.split('\n').map(line=>{
      const text=line.trim();if(dictionary.has(text))return line.replace(text,dictionary.get(text));
      for(const [pattern,replace]of templates)if(pattern.test(text))return line.replace(text,text.replace(pattern,replace));
      terms??=new RegExp([...dictionary.keys()].sort((a,b)=>b.length-a.length).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
      return line.replace(terms,k=>dictionary.get(k)).replace(/([\d.]+) 次/g,'$1 times').replace(/[：]/g,': ').replace(/[；]/g,'; ').replace(/[，、]/g,', ').replace(/。/g,'.').replace(/（/g,' (').replace(/）/g,')');
    });
    const result=lines.join('\n');if(/[\p{Script=Han}]/u.test(result))missing.add(source);
    if(cache.size>1024)cache.clear();cache.set(source,result);return result;
  }
  add(`
恢复当前情境的参数和推荐种子，保留区域、精细度与边界选择|Restore scenario parameters and its recommended seed; keep area, refinement and boundary
手机端仅录制 Arena，组合录像已结束|Mobile records the Arena only; combined recording has ended
画面更新|Arena updates
性能模式|Performance mode
自动平衡|Automatic balance
省电|Power saving
流畅优先|Prefer smoothness
高清优先|Prefer detail
重新测量|Recalibrate
按实际耗时调整自动画质和刷新频率，保留物理格点与全部生物机制。手动分辨率和录像质量保持所选设置。|Adapts automatic display quality and refresh rate to measured load, preserving the lattice and all biology. Manual resolution and recording quality stay as selected.
预热测量|Warming up
绘图负荷|Rendering load
数据打包负荷|Snapshot load
交互负荷|Interaction load
模拟计算受限|Simulation limited
运行平稳|Stable
后台暂停|Paused in background
录像质量锁定|Recording quality locked
显示上限|Display cap
显示比例|Display scale
手动画质|Manual resolution
小窗预览|Compact preview
每步计算|Computation per step
绘制|Rendering
数据打包|Snapshot packing
占满侧栏|Fill sidebar
返回控制|Back to controls
录制范围|Capture area
仅 Arena|Arena only
Arena ＋ 右侧栏|Arena + sidebar
准备录制…|Preparing recording…
录像未能开始|Recording could not start
侧栏录制不可用|Sidebar capture is unavailable
组合录制包含侧栏当前可见的内容；统计可先占满侧栏。Arena 30 FPS，侧栏最多每秒刷新 5 次。|Combined capture includes the currently visible sidebar. Expand statistics first for a dashboard view. Arena: 30 FPS; sidebar: up to 5 updates/second.
用于本地绘制录像中的实时侧栏。|Renders the live sidebar locally for video capture.
随机肿瘤演化|Random tumor development
密铺正常组织与 12 颗分散免疫细胞，从零肿瘤开始。三处供给较弱的区域与健康边缘形成差异；癌前、癌变、免疫清除、抑制与恢复相互竞争，逃逸克隆可能再次扩增。没有定时转变或预设结局。|Confluent normal tissue and 12 dispersed immune cells, starting without tumors. Three low-supply niches contrast with healthy edges. Precancerous change, malignancy, clearance, suppression and recovery compete; escape clones may expand again. No scheduled transitions or predetermined outcome.
随机化的密铺正常组织、12–16 颗内部免疫细胞与三处弱供给区域。参数在发生发展附近抽样，肿瘤必须由局部癌前产生；相同种子和参数可重现开局，结局由局部相互作用产生。|Randomized confluent normal tissue, 12–16 internal immune cells and three low-supply niches. Parameters are sampled near the development preset; tumors must arise from local precancerous cells. Seed and parameters reproduce the start; local interactions determine the course.
`);
  add(`
历史曲线显示类型|History plot populations
正常细胞供给联动|Normal-cell support coupling
按本局健康正常细胞存活数的历史峰值计算保留比例；0% 无联动，100% 等比例影响全局氧糖补给和酸清除|Retention uses the peak living healthy-normal count in this run. 0% disables coupling; 100% scales global oxygen/glucose supply and acid clearance proportionally.
数量与巡逻统计|Population and patrol metrics
细胞数量历史曲线|Cell population history
细胞数量|Cell counts
百分比|Percent
正常状态|Normal states
癌前状态|Precancerous states
肿瘤状态|Tumor states
免疫状态|Immune states
存活|Living
静息|Resting
激活|Active
抑制|Suppressive
清除中|Clearing
抗原阳性|Antigen positive
抗原阴性|Antigen negative
未记录状态|Unrecorded state
勾选图例显示细胞|Select populations in the legend
勾选类型自动缩放；单类显示状态堆叠。悬停／触摸查看采样时刻，方向键逐点查看。全程记录，导出保留全部采样。|Selected populations set the scale; one type shows stacked states. Hover or touch to inspect a sample, or use arrow keys. Export retains the complete sampled history.
`);
  add(`
氧气补给|Oxygen supply
葡萄糖补给|Glucose supply
实际|Actual
恢复情境参数、本次开局种子及默认显示，保留区域与精细度|Restore scenario parameters, this visit's starting seed and display defaults; keep area and refinement
释放 / 建源|Release / source
单击瞬释 · 长按连释 · 双击建源|Tap: pulse · Hold: release · Double tap: source
局部信号影响运动方向；肿瘤也趋向高氧、高糖|Local signals steer motion; tumors also move toward higher oxygen and glucose.
`);
  add(`
随机|Random
换局等待时间|Round wait time
颗|cells
分钟|minutes
擦除整颗细胞、触及的场源和局部障碍，并重置局部环境；手动移除不计入生物学死亡|Erase whole cells, touched sources and wall pixels; reset local fields. Manual removal is separate from biological deaths.
`);
  add(`
导入与导出|Import and export
导出历局 CSV|Export rounds CSV
录制视频|Record video
展开面板|Expand panel
返回画布|Back to arena
`);
  add(`
周期、干性与巡逻|Cycles, stemness and patrol
周期—营养耦合|Cycle–nutrient coupling
营养储备容量|Nutrient buffer capacity
复制压力敏感性|Replication stress sensitivity
DNA 修复速度|DNA repair rate
肿瘤 DNA 检查点强度|Tumor DNA checkpoint strength
肿瘤性状代价|Tumor trait cost
正常组织修复速度|Normal tissue repair rate
正常修复谱系分裂上限|Normal repair lineage division limit
新生肿瘤干性比例|New tumor stem fraction
干细胞对称分裂概率|Symmetric stem division probability
对称分裂中的自我更新|Self-renewal among symmetric divisions
干性细胞周期时长倍率|Stem cell cycle duration multiplier
干性 DNA 修复倍率|Stem DNA repair multiplier
环境诱导干性可塑性|Environment-driven stem plasticity
分化肿瘤谱系分裂上限|Differentiated tumor division limit
肿瘤干性与分化|Tumor stemness and differentiation
周期、储备与复制损伤|Cycle, reserves and replication damage
机制与参数依据|Mechanisms and parameter evidence
胶质瘤启发的可调模型，非统一肿瘤定律。|A tunable glioma-inspired model, not a universal tumor rule.
肿瘤干性：自我更新／分化|Tumor stemness: self-renewal / differentiation
分化肿瘤|Differentiated tumor
剩余分裂|Divisions remaining
无限制|Unlimited
干性生态位记忆|Stem niche memory
性状资源代价|Trait resource cost
能量储备|Energy reserve
合成储备|Precursor reserve
DNA 损伤|DNA damage
营养储备不足|Insufficient reserves
DNA 损伤检查点|DNA damage checkpoint
接触抑制：缺少空隙|Contact inhibition: no local gap
剩余修复分裂|Repair divisions remaining
空隙接触|Free membrane
正常修复分裂|Normal repair divisions
复制损伤死亡触发|Replication-damage death initiations
计入环境死亡|Included in environmental deaths
干性重获|Stem reacquisition
对称自我更新|Symmetric renewal
对称分化|Symmetric differentiation
不对称|Asymmetric
干性|Stem-like
分化|Differentiated
↻ 再次模拟此局|↻ Simulate this round again
重新模拟历史局|Historical round restarted
已按原种子和初始参数开始新一局|New run started with original seed and initial parameters
模型版本已变化，演化可能不同。|The model version has changed; outcomes may differ.
按种子与初始参数重新模拟，不重放手动操作。|Re-simulates the seed and initial parameters; does not replay manual actions.
红色周期文字表示肿瘤干性细胞|Red cycle labels identify stem-like tumor cells
全屏 Arena|Fullscreen Arena
退出全屏|Exit fullscreen
`);
  add(`
0 恢复旧周期门控；1 启用分阶段消耗、储备与复制损伤。依据：Colombo 2011；系数为模型假设|0 restores legacy cycle gates; 1 enables phase demand, reserves and replication damage. Colombo 2011 motivates the mechanism; coefficients are model assumptions.
能量与合成原料的有限缓冲；分裂按实际胞体比例分配。依据：Colombo 2011；无量纲容量|Finite energy and precursor buffers, partitioned by actual daughter size. Colombo 2011; dimensionless model capacity.
S 期缺氧、储备不足或高酸增加 DNA 损伤。依据：Foskolou 2017；速率未标定|Hypoxia, depleted reserves and high acid create S-phase damage pressure. Foskolou 2017; uncalibrated rate and acid proxy.
消耗储备修复复制损伤，不消除免疫杀伤损伤。依据：Foskolou 2017；速率未标定|Uses reserves to repair replication damage; immune injury is separate. Foskolou 2017; uncalibrated rate.
越高越早因 DNA 损伤阻滞；正常与免疫保持完整检查点。模型阈值未标定|Higher values arrest earlier under DNA damage; normal and immune cells retain full checkpoints. Uncalibrated model threshold.
强增殖、侵袭与耐受增加资源成本，并有温和功能权衡；0 关闭。依据：Giese 1996；代价函数为假设|Strong growth, invasion and tolerance cost resources with mild functional tradeoffs; 0 disables. Giese 1996; cost function is a hypothesis.
只有邻接真实空隙、营养足够且额度未耗尽才进入修复周期。依据：Gudipaty 2017；速度未标定|Repair requires actual local gaps, nutrients and an unused division allowance. Gudipaty 2017; uncalibrated speed.
每次分裂两个子代均扣一次；0 禁止修复分裂。依据：Hayflick 1961；次数为演示设置，非通用寿命|Both daughters lose one lineage division per split; 0 blocks repair. Hayflick 1961 motivates finite capacity, not this demo limit.
只影响初始、新增和新恶性转化的肿瘤；独立于抗原。依据：Chen 2012；比例未标定|Applies to initial, added and newly transformed tumors; independent of antigen. Chen 2012; fraction uncalibrated.
其余为一干性、一分化的不对称分裂。依据：Driessens 2012；概率未标定|Other divisions produce one stem and one differentiated daughter. Driessens 2012; probabilities uncalibrated.
对称分裂时产生两个干性子代的概率，其余产生两个分化子代。依据：Driessens 2012|Conditional chance of two stem daughters in a symmetric division; otherwise two differentiated daughters. Driessens 2012.
相对分化肿瘤的周期时长；1 无差别。胶质瘤慢周期亚群启发：Chen 2012，并非所有干细胞都慢|Cycle duration relative to differentiated tumors; 1 removes the difference. Glioma-inspired (Chen 2012); not all stem cells cycle slowly.
仅增强 DNA 修复，不降低免疫接触杀伤。依据：Bao 2006；倍率未标定|Increases DNA repair only, without reducing immune killing. Bao 2006; multiplier uncalibrated.
存活分化肿瘤在持续局部低氧生态位中有概率重新获得干性；0 关闭。Li 2009／Chaffer 2013 启发的代理模型|Viable differentiated tumors may reacquire stemness in a sustained local hypoxic niche; 0 disables. Proxy inspired by Li 2009 and Chaffer 2013.
0 保持无限分裂；大于 0 启用有限扩增层级；干性自我更新不受此限。依据：Chen 2012|0 retains unlimited tumor divisions; positive values enable a finite progeny hierarchy. Stem renewal is unlimited. Chen 2012.
`);
  add(`
抗原与克隆演化|Antigens and clonal evolution
克隆占比|Clone fractions
主要遗传克隆占比历史|Major genetic clone frequency history
新加入免疫细胞的响应资格|Response competence of new immune cells
后台抗原启动速度|Background antigen priming
免疫刹车效力|Checkpoint brake strength
环境表达响应|Environmental expression response
接触相关呈递下调|Contact-associated presentation downregulation
炎性暴露呈递下调|Inflammatory presentation downregulation
初始高抗原表达比例|Initial high-antigen expression fraction
子代遗传突变机会|Mutation opportunity per daughter
只影响新加入的细胞；仍需匹配抗原并实际接触|Affects newly added cells only; matching antigen and membrane contact are still required.
有限候选谱、局部暴露、延迟和宿主支持；不改写已有识别码|Finite candidates, local exposure, delay and host support; existing receptors are never rewritten.
独立于抗原与呈递的执行抑制|Execution brake independent of antigen identity and presentation.
放大每个抗原自身的正或负环境响应；表达可恢复|Amplifies each antigen's positive or negative environmental response; expression can recover.
可逆调控，不再直接产生遗传抗原丢失|Reversible regulation; does not directly produce inherited antigen loss.
可逆调控，遗传缺失独立记录|Reversible regulation; genetic loss is recorded independently.
当前抗原呈递|Current antigen presentation
识别取决于克隆匹配|Recognition depends on clone matching
存在非自身呈递|Non-self presentation present
当前呈递低|Low current presentation
旧实验已迁移至特异识别规则；种子与参数保留，演化轨迹会变化。|Legacy experiment migrated to specific recognition; seed and parameters retained, trajectories change.
`);
  add(`
非自身呈递高|High non-self presentation
非自身呈递低|Low non-self presentation
抗原／呈递遗传丢失|Antigen / presentation genetic loss
分裂遗传改变|Division genetic changes
遗传改变|Genetic changes
序列替换|Sequence substitutions
免疫启动|Immune priming
表达干预|Expression intervention
选中细胞的识别关系|Selected-cell recognition links
红线深浅表示当前非自身抗原呈递强度，不保证识别匹配|Outline intensity shows current non-self presentation, not receptor matching
抗原红线：浅 → 深，呈递弱 → 强。追踪后：✓ 已识别 · ≈ 接触扫描 · × 不匹配 · ! 受限。|Antigen outline: pale → dark, weak → strong presentation. Track: ✓ recognized · ≈ scanning · × mismatch · ! limited.
`);
  function mount(control){
    let language='zh';try{if(localStorage.getItem('cell-arena-language')==='en')language='en';}catch{}
    const texts=new WeakMap(),attributes=new WeakMap(),names=['title','aria-label','placeholder'];
    const skip=element=>!element||element.closest('script,style,pre,[data-no-i18n],[data-language]');
    function textNode(node){if(skip(node.parentElement))return;const value=node.nodeValue,previous=texts.get(node),source=previous&&previous.result===value?previous.source:value,result=translate(source,language);texts.set(node,{source,result});if(value!==result)node.nodeValue=result;}
    function attribute(element,name){if(skip(element)||!element.hasAttribute(name))return;let record=attributes.get(element);if(!record){record={};attributes.set(element,record);}const value=element.getAttribute(name),previous=record[name],source=previous&&previous.result===value?previous.source:value,result=translate(source,language);record[name]={source,result};if(value!==result)element.setAttribute(name,result);}
    function walk(root){if(root.nodeType===3){textNode(root);return;}if(root.nodeType!==1&&root.nodeType!==9)return;if(root.nodeType===1){if(skip(root))return;for(const name of names)attribute(root,name);}const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(n.nodeType===3)textNode(n);else for(const name of names)attribute(n,name);}}
    function set(value){language=value==='en'?'en':'zh';control.value=language;control.textContent=language==='en'?'Chi':'Eng';control.title=language==='en'?'切换为中文':'Switch to English';control.setAttribute('aria-label',control.title);document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=translate('Cell-Arena · 细胞生态竞技场',language);for(const block of document.querySelectorAll('[data-language]'))block.hidden=block.dataset.language!==language;walk(document.body);try{localStorage.setItem('cell-arena-language',language);}catch{}}
    const observer=new MutationObserver(records=>{for(const m of records){if(m.type==='characterData')textNode(m.target);else if(m.type==='attributes')attribute(m.target,m.attributeName);else for(const node of m.addedNodes)walk(node);}});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:names});
    control.addEventListener('change',()=>set(control.value));control.addEventListener('click',()=>set(language==='en'?'zh':'en'));set(language);
    return {set,get language(){return language;},refresh:()=>walk(document.body)};
  }
  globalThis.CellLabI18n={translate,mount,missing};
})();
