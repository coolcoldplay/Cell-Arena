# 并行 CPM / WebGPU 小原型

独立研究目录，正式应用不导入这里的任何文件。生产 C/WASM 内核、桥接层和分发入口保持原样；之前的细胞像素索引工作保留。实测结论和原始数据见 [研究报告](../../reports/parallel-cpm/README.md)。

在项目根目录启动：

```sh
cd /Users/user/Documents/Codex/Cell-Arena
python3 -m http.server 4177 --bind 127.0.0.1
```

使用支持 WebGPU 的浏览器打开 <http://127.0.0.1:4177/experiments/parallel-cpm/>。页面提供完整实验、JSON 下载和万细胞机械演示。无需安装 CUDA、重新编译 WASM 或修改正式应用。不要同时运行其他高负载测试。

控制台也可分别调用：

```js
await lab.validateFrozen({scene:'hot'})
await lab.targetedChecks({scheduler:'dense'})
await lab.compareFull({seeds:[17,29,77],steps:360})
await lab.capacityBenchmark({steps:60,warmup:12})
await lab.motilityAssay()
await lab.profileStages()
await lab.demo({steps:120})
```

`lab.runSuite()` 执行正式记录所用的主验证，返回来源文件 SHA-256、硬件浏览器信息和全部原始计时。另一个候选可通过 `scheduler:'boundary', batch:16` 测试；它未显示出端到端收益。批量敏感性可用 `lab.microBenchmark({tile:4,batches:[1,4,16]})` 检查。

## 文件和边界

- `kernel.wgsl`：四颜色随机分块更新，完整能量项、截面/核区/血管/形态约束、原子体积和周长、延迟连通性搜索。两种提案调度：均匀格点和带指数等待时间的边界事件。后者跨阶段保留剩余等待量，避免每块至少做一次导致边界过采样。
- `backend.js`：WebGPU 缓冲、编译、计时、复制日志、快照和诊断。错误和容量溢出直接终止，未验证的 GPU 结果不回放到模型。
- `harness.js`：真实模型适配、GPU 日志逐次回放、原有生物学步骤、差分验证、复制组织、基准和受控 Act 测试。
- `resident-reference.js`：直接加载仓库原有 WASM；与 GPU 常驻状态微基准对照。它受原内核容量限制，不虚构万细胞 CPU 数据。
- `render.js`：直接绘制 GPU 网格。演示冻结生物学参数，仅检查机械演化；画面绘制次数不作为真实可见 FPS。
- `../../tests/parallel-cpm.test.mjs`：验证周期组织复制时胞体几何、跨边界配对关系都正确。
- `NOTICE`：研究来源和代码署名。

本原型要求分块为 4 或 8，格点长宽均可被分块尺寸的两倍整除。局部读取半径不超过 3，不同活跃分块的写入相隔至少 5 个格点，因此网格及 Act 无需逐点原子读写；共享细胞的体积、周长仍使用原子操作。跨分块的能量计算可能读到不同时间的统计量，结果依赖 GPU 调度，不保证同种子轨迹重现。

局部判断不能证明连通性时，保留提案，在后续串行 GPU dispatch 中重新检查当前状态并做完整 BFS。搜索空间按整个网格分配，未通过删掉搜索、拒绝所有模糊提案或缩小核区来提速。这个处理本身也是实测瓶颈。

完整模型适配仍由 CPU 持有主状态，每 MCS 上传参数和网格，取回接受日志，调用 `C.setpixi`，然后执行原有接触、截面、血管、环境、代谢、免疫、分裂和死亡步骤。它是验证路径，尚不是生产级常驻 GPU 模型。

万细胞实验将真实周期组织扩展为多个副本，保留每个细胞的像素数、核区、种类和几何，不通过降低分辨率扩大数量。细胞和血管标识重映射，跨周期边界的胞体和配对连接映射到最近副本。该实验冻结生物学参数、没有大规模完整生物学流程，也不构成独立随机组织样本。带连接网络哈希的组织复制会明确报错，未静默移除连接。

纯 Node 验证：

```sh
node --test tests/parallel-cpm.test.mjs
node --test tests/*.test.mjs
```

这台 Mac 的可用 Node 位于 `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`；如 `node` 不在 PATH，可使用该绝对路径。
