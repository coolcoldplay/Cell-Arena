# 可导入的免疫与血管机制实验

打开 [Cell-Arena](https://coolcoldplay.github.io/Cell-Arena/)，用顶部文件图标导入 JSON。导入按参数重新开局，不是恢复导出时刻。演示关闭自动换局；MCS 不是真实秒。

| 文件 | 观察目标 |
|---|---|
| [01-specific-recognition.json](01-specific-recognition.json) | 相同受体对不同抗原的特异性；追踪两靶比较实际接触。 |
| [02-reversible-hiding.json](02-reversible-hiding.json) | 初始低表达；约 200 MCS 将环境表达响应设为 0，观察同一基因的可逆表达恢复。 |
| [03-heritable-escape.json](03-heritable-escape.json) | 预先放置祖先及遗传缺失分支，观察选择；不声称该预存分支是现场突变。 |
| [03-control-kill-off.json](03-control-kill-off.json) | 与上述相同初态，关闭杀伤。后续分裂机会可以不同。 |
| [04-clonal-replacement.json](04-clonal-replacement.json) | 两个预存抗原变体、有限后台应答与血管，观察克隆曲线及桑基图。 |
| [05-contact-learning.json](05-contact-learning.json) | 固定接触的两个免疫细胞取样／传递后新增识别，1000 MCS 实测各新增 1 种，胞体轮廓从 1 色变为 2 色。已学识别不自动衰减，原始遗传码不变。 |
| [06-hypoxic-angiogenesis.json](06-hypoxic-angiogenesis.json) | 本阶段发生发展种子 77，分别看正常与肿瘤来源热图及血管统计。约 6000 MCS 可见出芽，密铺组织中不保证成熟。 |

01–04 明确关闭新接触学习与血管新生，保留各自机制对照。当前只有 **一个肽抗原槽**；C1/C2 是通道，S1/S2 是独立表面靶标，不是额外抗原槽。免疫轮廓显示原始＋已学模板可识别的场内抗原，不表示正在杀伤或携带这些抗原。

旧版 01–04 的四槽数值记录保存在 [历史结果](../../reports/immune-genetics/demo-results.json)，不能用作当前单槽结果。新学习／血管的实际记录见[阶段报告](../../reports/contact-angiogenesis-2026-11-13/README.md)。06 固定本阶段参数；模型规则会随修订变化，要复现旧轨迹须检出对应报告提交。
