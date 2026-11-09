# 后续机制改进记录

## 2026-11-09：CTL 与肿瘤细胞周期（已实现，纳入发布版本）

按用户确认的方向完成本地验证，并按后续发布指示与独立胞核／抗原轮廓／周期文字一起纳入 GitHub Pages 版本。具体计算规则、限制与依据见 [MODEL.md](MODEL.md) 的“细胞周期与扩增支持”；控件与验证记录见 [LOCAL_CELL_CYCLE.md](LOCAL_CELL_CYCLE.md)。

### 已确认的目标

- 增加独立于趋化／免疫招募因子的 **IL-2 扩增支持信号**，分别处理它们对增殖和迁移的作用。
- 为 CTL 增加 **抗原刺激记忆／内部扩增程序**。记忆由实际相容抗原接触建立；充分刺激后离开肿瘤，仍可在支持条件允许时继续有限扩增。
- 让营养条件与耗竭状态影响进入细胞周期、周期推进和后续扩增。
- 扩增程序应衰减，避免一次识别后永久扩增；仅有趋化信号不能自动赋予抗原识别或增殖许可。
- 将即时杀伤激活、趋化响应、增殖程序、细胞周期和耗竭分开，不用单个激活计时器代表全部状态。

### 本轮采用的实现与边界

- 当前共培养场景按已经完成初始启动的 CTL 建模；若以后加入初始 CD8 T 细胞，应另行处理抗原呈递与共刺激。
- IL-2 使用独立扩散、衰减、受体响应与摄取场。实际识别后短暂分泌，也可手动放置外源持续补给。
- 抗原记忆具有饱和、半衰期和子代继承；持续真实接触可再刺激。已进入 S 期后，单纯失去抗原记忆不撤销本轮已完成的周期进度。
- 可恢复的营养／酸抑制与较慢形成、较慢恢复的慢性刺激耗竭分开。耗竭标量不区分祖细胞样和终末耗竭亚群。
- 保留谱系分裂预算，作为可调实验条件；再次识别不重置预算。周期与信号参数使用 MCS，未换算真实时间。
- 保留实际接触、形变穿行、胞核与实体障碍约束，不用放宽几何或数量预算代替生物学控制。

### 已覆盖的验证目标

- 趋化因子单独存在时可引导迁移，不无条件触发扩增。
- 充分抗原刺激后的 CTL 在脱离靶细胞后仍可有限扩增。
- 移除扩增支持、记忆衰减或增殖潜力下降后，扩增逐渐停止。
- 缺乏营养／高酸降低扩增；改善环境可解除可逆抑制，但不立即清空慢性耗竭状态。
- 统计能分别解释未启动、周期受阻、扩增程序结束和几何分裂失败。

### 机制参考

以下支持机制方向，不提供适用于所有 CTL 的统一阈值或 MCS 时间换算。

- Marchingo et al., Science (2014): [Antigen affinity, costimulation, and cytokine inputs sum linearly to amplify T cell expansion](https://doi.org/10.1126/science.1260044).
- Heinzel et al., Nature Immunology (2017): [A Myc-dependent division timer complements a cell-death timer to regulate T cell and B cell responses](https://doi.org/10.1038/ni.3598).
- Miller et al., Nature Immunology (2019): [Subsets of exhausted CD8+ T cells differentially mediate tumor control and respond to checkpoint blockade](https://doi.org/10.1038/s41590-019-0312-6).
- Fischer et al., Blood (2007): [Inhibitory effect of tumor cell-derived lactic acid on human T cells](https://doi.org/10.1182/blood-2006-07-035972).

肿瘤现已加入可逆 G0、G1／S／G2／M、资源／压缩／损伤检查点及阶段代谢需求。这里的 G0 仅代表可逆静息；真实长期休眠、衰老、显式生长因子通路和分子检查点仍待后续扩展。
