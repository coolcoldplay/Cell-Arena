# 本轮本地验证结果

日期：2026-11-12。模型 `2026-11-specific-immune-genetics-1`；对照旧版提交 `49951e23f23479490258b63abfa016ed00469598`。以下为发布前的本地验证记录；主分支发布另由 GitHub Actions 执行回归与构建。

## 规则与交互

- 完整 Node 回归：**372 / 372 通过**，`node --test --test-concurrency=2 tests/*.test.mjs`。包括旧形变、核区、通行、周期、血管、死亡、统计、参数锁与导入回放测试。
- 新系统浏览器检查：**15 / 15 通过**。五个演示导入推进、真实接触的特异杀伤、选中槽位／呈递／刹车卡片、中英切换、克隆历史、完整遗传导出、初态重导入、旧文件迁移提示与手机控件；未发现页面／Worker 错误，本地测试未发送统计请求。
- 手机全屏浏览器检查：**11 / 11 通过**。390×844 的竖屏页面旋转、844×390 横屏、等比完整画布、侧边统计、真实触控选中／拖动、实时 MCS、双指退出、原缩放恢复和桌面全屏回退。自动化使用 Chrome 设备模拟，未声称覆盖真实 iPhone Safari 的系统全屏 API；本机无界面 Chrome 拒绝原生全屏时，页面回退通过。
- 原始浏览器记录：`output/antigen-upgrade/browser/checks.json`、`output/antigen-upgrade/fullscreen/checks.json`。截图同目录；模型完整日志：`output/antigen-upgrade/regression-final.txt`。

“癌前改变后必定能识别”和“接触导致定向遗传逃逸”不再是有效旧断言：旧测试已改为明确的相容受体夹具／遗传缺失实验干预，仍检查实际接触、损伤、可遗传分支和扩张。没有通过取消形变、接触或代谢测试来让回归通过。

## 序列与情境

码空间 4/6/8 校准见 [length-calibration.json](length-calibration.json)；默认 6 位的取舍与局限见 [主说明](../../IMMUNE-GENETICS.md)。真实 CPM 小规模对照见 [length-tissue.json](length-tissue.json)：

| 长度 | 种子 | 4,000 MCS 肿瘤 | 免疫 | 累计免疫清除 | 新应答血管增援 |
|---:|---:|---:|---:|---:|---:|
| 4 | 17 | 101 | 23 | 25 | 3 |
| 4 | 31 | 94 | 15 | 43 | 0 |
| 6 | 17 | 72 | 34 | 67 | 4 |
| 6 | 31 | 97 | 16 | 38 | 2 |
| 8 | 17 | 106 | 14 | 2 | 2 |
| 8 | 31 | 93 | 18 | 41 | 0 |

相同初始细胞数、位置、调控参数、总分裂突变机会；有两个预置抗原分支和有限候选谱。长度改变会改变码空间与实际随机序列。此表说明可发生克隆替代和追加应答，不证明 6 位临床最优，也没有完全清除的保证。

四种子内置情境分别验证了冷肿瘤早期增长、热肿瘤早期消退、发生发展的不同后期走向。固定 240×180、1×、循环边界；热肿瘤仍保留累计杀伤寿命与有限扩增。默认 1.5× 情境也通过自动回归。原始数据为 [scenarios-final-onset.json](scenarios-final-onset.json)、[scenarios-final-presets.json](scenarios-final-presets.json)。其他带 draft/calibration 名称的 JSON 是参数试验过程，不代表最终预设。

五个可导入实验的固定种子实际结果见 [demo-results.json](demo-results.json)。可逆隐藏实验包含明确的 200 MCS 参数干预；遗传逃逸实验包含明确的预存缺失分支。关闭杀伤会改变存活与后续分裂机会，因此不要求两组后期累计突变数量相同；另有等机会单元对照验证杀伤强度不直接改变突变抽样。

## 固定负荷性能

环境：Intel i5-13500H、16 逻辑 CPU；Node 24.15；Chrome / ANGLE RTX 4050 Laptop GPU。固定 483 颗、768×576 物理格点；前后均关闭生长、杀伤、凋亡和血管到达以保持数量，形变、实际接触、微环境与识别继续运行。这些关闭项**只用于计时实验**，不是生产提速手段。各版本新进程串行执行，没有同时运行其它模拟探针。

Node：预热 32 步，三次独立 160 步，下面是三个结果的中位数。JS 堆在主动 GC 后读取，不是总进程／GPU 显存。

| 项目 | 旧版 | 本轮 | 变化 |
|---|---:|---:|---:|
| 每 MCS 计算 | 17.39 ms | 17.80 ms | +2.3% |
| 无显示 MCS/s | 57.50 | 56.18 | −2.3% |
| 快照打包 | 5.85 ms | 8.34 ms | +42.5%（+2.49 ms） |
| JS 堆 | 288.44 MiB | 290.26 MiB | +1.82 MiB |

新系统确有成本，主要可见于包含基因／状态摘要的快照。代码已共享不可变基因、缓存静态亲和力、限制后台记录与 UI 克隆历史、归档灭绝克隆；没有把动态营养／表达错误缓存成静态。

浏览器：同 483 颗、768×576 格点、1920×1440 显示、胞核／周期／抗原轮廓开启；CPU 微环境，WebGL2 绘图。2 秒预热后取 10 秒窗口，每档一窗，**不是稳定的硬件排名或置信区间**。

| 目标倍率 | 旧版 FPS → 本轮 FPS | 旧版实际 MCS/s → 本轮 | 帧间隔 P95 旧 → 新 | >50 ms 主线程长任务 |
|---|---:|---:|---:|---:|
| 1× | 29.98 → 30.09 | 29.98 → 29.99 | 44.3 → 42.2 ms | 0 / 0 |
| 8× | 36.64 → 31.24 | 38.14 → 35.73 | 34.3 → 45.3 ms | 0 / 0 |

8× 的实际推进在该负荷下下降约 6.3%；不能把新机制描述为免费或整体提速。目标 8× 不表示硬件必定达到 240 MCS/s。完整数据：[Node 前](performance-before.json)、[Node 后](performance-after.json)、[浏览器前](browser-performance-before.json)、[浏览器后](browser-performance-after.json)。后续仅调整文案、选中状态说明，不改变未选中时的这组生物计算或基准设置。

## 免疫扩增带来的间接负荷

另做真实热肿瘤种子 77、240×180 格点对照，只改 `immuneGrowth=0` 或 `0.65`。初始均 205 颗，其中免疫 18、肿瘤 37；在 6,000 MCS 附近取三个 64 步窗口。

| 设置 | 6,000 MCS 活细胞 / 免疫 / 肿瘤 | 累计免疫分裂 | 每步中位数 | 窗口末 JS 堆 |
|---|---:|---:|---:|---:|
| 关闭扩增 | 204 / 22 / 8 | 0 | 4.13 ms | 34.74 MiB |
| 保留扩增 | 244 / 71 / 0 | 46 | 5.90 ms | 35.62 MiB |

允许扩增组每步约多 43%。这是包含肿瘤存活、接触数量、胞体几何和谱系改变的**生态总负荷**，不能全部归因于每颗免疫细胞的固定成本；免疫数量还受血管到达影响。它说明必须把“规则本身的开销”与“规则导致细胞变多”分开。原始记录：[expansion-cost.json](expansion-cost.json)。

复测命令：

```sh
node scripts/calibrate-antigen-length.mjs
node scripts/probe-antigen-length-tissue.mjs
node scripts/probe-immune-scenarios.mjs final-onset --scenes=oncogenesis
node scripts/probe-immune-scenarios.mjs final-presets --scenes=hot,cold,random
node scripts/probe-immune-demos.mjs
node --expose-gc scripts/benchmark-immune-genetics.mjs before --baseline=49951e23f23479490258b63abfa016ed00469598
node --expose-gc scripts/benchmark-immune-genetics.mjs after
node scripts/benchmark-browser-performance.mjs immune-fixed-after dist/index.html 384 1920 --fixed
node --expose-gc scripts/probe-immune-expansion-cost.mjs
node scripts/check-immune-genetics.mjs
node scripts/check-mobile-fullscreen.mjs
```
