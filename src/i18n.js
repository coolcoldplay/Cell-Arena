/* UI-only translation. No model state, random stream or simulation clock is read
 * or changed here. DOM sources are retained so switching back is lossless. */
(() => {
  'use strict';
  const dictionary=new Map(),missing=new Set(),cache=new Map();
  function add(rows){for(const line of rows.trim().split('\n')){const at=line.indexOf('|');if(at>0)dictionary.set(line.slice(0,at),line.slice(at+1));}}
  add(`
Cell-Arena · 细胞生态竞技场|Cell-Arena · Cell ecology playground
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
播放|Speed
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
↔ 拖动细胞|↔ Move
＋ 新增细胞|＋ Add cells
◉ 释放信号|◉ Signals
▥ 绘制障碍|▥ Walls
⌫ 擦除障碍|⌫ Erase walls
⌾ 观察细胞|⌾ Inspect
⌫ 擦除细胞|⌫ Erase cells
✥ 平移视野|✥ Pan
拖动时暂停 · 邻居让位 · 实体墙阻挡|Drag pauses time; neighbors yield; walls block
拖动时暂停 · 邻居让位 · 松手恢复|Drag pauses time; release to resume
单击加入一颗 · 可尝试挤入已有细胞区域|Click to add one cell, including in occupied tissue
单击释放因子 · 拖动画出信号带|Click to release a signal; drag to paint a trail
在空白处拖动画墙|Drag across empty space to draw walls
拖动擦除实体障碍|Drag to erase solid walls
擦除触及的整颗细胞 · 单独记账|Erase whole cells touched by the brush; counted separately
按住拖动平移视野 · 不改变细胞位置|Drag to pan the view without moving cells
点击细胞查看状态与局部环境|Click a cell to inspect its state and environment
新增类型|Cell type
正常细胞|Normal cells
肿瘤细胞|Tumor cells
免疫细胞|Immune cells
异常中间态|Abnormal cells
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
预览从左到右：正常 · 异常 · 肿瘤 · 免疫 · 激活|Preview: normal / abnormal / tumor / immune / activated
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
异常|Abnormal
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
异常监视|Abnormal cell surveillance
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
实际接触识别异常或肿瘤后分泌；仅被吸引者不自动接力|Secreted after contact recognition; attracted cells do not automatically relay the signal
激活后免疫生长|Activated immune growth
接触识别后才有自动克隆扩增，受代谢状态限制|Clonal expansion requires contact recognition and is limited by metabolism
新免疫细胞分裂预算|New immune cell division limit
每次分裂，两颗子细胞均扣一次；只影响新播种的细胞|Each daughter loses one remaining division; this setting applies to newly seeded cells
每项性状突变概率|Mutation probability per trait
肿瘤分裂时分别抽样耐受、增殖、侵袭和抗原表达|Tolerance, proliferation, invasion and antigen expression mutate independently at division
突变幅度|Mutation size
随机双向变异；环境选择存活者，不定向创造突变|Random changes in either direction; the environment selects survivors without directing mutations
环境损伤致异常|Stress-induced abnormality
持续代谢损伤提高正常 → 异常风险；0 关闭此通路，炎性通路独立设置|Sustained metabolic damage raises normal → abnormal risk; 0 disables this pathway, independently of inflammation
炎性信号促癌|Inflammation-associated transformation
局部损伤／免疫招募信号持续累积后增加正常 → 异常风险；0 关闭，仍经过异常中间态。未标定的炎症代理|Sustained damage/recruitment signals increase normal → abnormal risk. 0 disables this uncalibrated inflammation proxy.
异常 → 肿瘤风险倍率|Abnormal → tumor risk multiplier
异常至少保留 160 MCS；倍率调整后仍是随机事件，0 保留中间态|Abnormal cells persist for at least 160 MCS; progression remains stochastic. 0 retains the intermediate state.
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
正常、异常、肿瘤和免疫细胞数量随模型时间变化|Normal, abnormal, tumor and immune populations over model time
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
异常已持续|Abnormal for
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
异常发生|Abnormal transitions
恶性转变|Malignant transitions
肿瘤分裂|Tumor divisions
存活肿瘤|Living tumors
原灶外肿瘤|Tumors beyond origin
远端分裂|Distal divisions
残留肿瘤胞体|Remaining tumor bodies
异常免疫清除|Abnormal cells killed
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
纯正常上皮，中心酸清除弱、氧糖补给略低，外围环境较好。局部代谢压力经异常中间态推动随机癌变；新生肿瘤采用较高遗传耐受基线，观察存活克隆向外围扩增。|Normal epithelium with poor acid clearance and lower nutrient supply in the center. Local stress drives stochastic transformation through an abnormal state. New tumors have a higher tolerance baseline; surviving clones can expand outward.
中心 19 颗低抗原肿瘤，外围仅 3 颗免疫细胞，肿瘤保留快速生长与迁移。观察原灶外播散及远端增殖；这是二维扩散代理，不含血管运输或跨器官转移。|19 low-antigen tumors in the center, only 3 peripheral immune cells. Observe rapid tumor growth, outward spread and distal division. This 2D spread proxy excludes vascular transport and cross-organ metastasis.
中心 37 颗肿瘤形成局部密集病灶，周边 18 颗免疫细胞，抗原暴露充分。依靠真实接触识别、局部招募及有限克隆扩增，尝试清除当前区域肿瘤。|A dense central lesion of 37 tumors with 18 surrounding immune cells and high antigen exposure. Actual contact recognition, local recruitment and limited clonal expansion can clear tumors in the dish.
`);
  add(`
新生肿瘤克隆扩增|New tumor clone expansion
肿瘤已发生|Tumor has emerged
肿瘤已出现，当前无存活肿瘤|Tumors emerged; none currently alive
已发生异常中间态|Abnormal intermediate state emerged
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
    [/^(减小|增大)(.+)$/,(_,action,name)=>`${action==='减小'?'Decrease':'Increase'} ${translate(name)}`],
    [/^(正常细胞|异常中间态|肿瘤细胞|未激活免疫|已激活免疫)(胞体|胞核)颜色$/,(_,type,part)=>`${dictionary.get(type)} ${dictionary.get(part).toLowerCase()} color`],
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
    [/^正常、异常、肿瘤和免疫细胞数量：从 0 到 (\d+) MCS 的完整过程$/,(_,t)=>`Normal, abnormal, tumor and immune populations from 0 to ${t} MCS`]
  ];
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
  function mount(control){
    let language='zh';try{if(localStorage.getItem('cell-arena-language')==='en')language='en';}catch{}
    const texts=new WeakMap(),attributes=new WeakMap(),names=['title','aria-label','placeholder'];
    const skip=element=>!element||element.closest('script,style,pre,[data-no-i18n],[data-language]');
    function textNode(node){if(skip(node.parentElement))return;const value=node.nodeValue,previous=texts.get(node),source=previous&&previous.result===value?previous.source:value,result=translate(source,language);texts.set(node,{source,result});if(value!==result)node.nodeValue=result;}
    function attribute(element,name){if(skip(element)||!element.hasAttribute(name))return;let record=attributes.get(element);if(!record){record={};attributes.set(element,record);}const value=element.getAttribute(name),previous=record[name],source=previous&&previous.result===value?previous.source:value,result=translate(source,language);record[name]={source,result};if(value!==result)element.setAttribute(name,result);}
    function walk(root){if(root.nodeType===3){textNode(root);return;}if(root.nodeType!==1&&root.nodeType!==9)return;if(root.nodeType===1){if(skip(root))return;for(const name of names)attribute(root,name);}const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(n.nodeType===3)textNode(n);else for(const name of names)attribute(n,name);}}
    function set(value){language=value==='en'?'en':'zh';control.value=language;document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=translate('Cell-Arena · 细胞生态竞技场',language);for(const block of document.querySelectorAll('[data-language]'))block.hidden=block.dataset.language!==language;walk(document.body);try{localStorage.setItem('cell-arena-language',language);}catch{}}
    const observer=new MutationObserver(records=>{for(const m of records){if(m.type==='characterData')textNode(m.target);else if(m.type==='attributes')attribute(m.target,m.attributeName);else for(const node of m.addedNodes)walk(node);}});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:names});
    control.addEventListener('change',()=>set(control.value));set(language);
    return {set,get language(){return language;},refresh:()=>walk(document.body)};
  }
  globalThis.CellLabI18n={translate,mount,missing};
})();
