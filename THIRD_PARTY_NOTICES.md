# 代码来源与第三方声明 / Third-party notices

Cell-Arena 基于 Artistoo 构建。下表说明直接包含、改写／移植与视觉参考的具体范围；科学论文引用另列于 [MODEL.md](MODEL.md#机制参考)。这些许可说明对应第三方代码及其改编部分，不为全部新增扩展另行指定一个统一的项目许可证。

## 1. Artistoo：直接包含的库与改编部分

- 作者：Johannes Textor、Inge Wortel。
- 版权：Copyright (c) 2019 Johannes Textor & Inge Wortel。
- 项目：[ingewortel/artistoo](https://github.com/ingewortel/artistoo)。
- 固定提交：[`e997d81213a5dcdfc40ad976a18958f412f00cc9`](https://github.com/ingewortel/artistoo/tree/e997d81213a5dcdfc40ad976a18958f412f00cc9)。
- 许可证：MIT，完整原文见 [vendor/LICENSE](vendor/LICENSE)。

| 本项目位置 | 使用方式与来源 |
|---|---|
| `vendor/artistoo.js` | 原样包含上游 [`build/artistoo.js`](https://github.com/ingewortel/artistoo/blob/e997d81213a5dcdfc40ad976a18958f412f00cc9/build/artistoo.js)，保留内部原有注释与第三方声明。 |
| `src/fast-cpm.js` | 对上游 `Adhesion`、`PerimeterConstraint`、`ActivityConstraint` 做等价专门化与存储优化。改编部分保留 Artistoo 来源和 MIT 声明。 |
| `src/cpm-kernel.c`、`build/cpm-kernel.wasm` | 移植／专门化 Artistoo 的顺序 CPM 复制、接受规则、约束能量与状态更新顺序，并加入本项目的核区等约束；随机数部分另见下节。邻接声明见 [`src/cpm-kernel.NOTICE`](src/cpm-kernel.NOTICE)。 |
| `src/wasm-cpm.js` | 本项目的 WebAssembly 桥接层，将成功复制按原顺序交给 Artistoo 原始状态维护钩子。 |
| `src/app.js`、`src/gpu-renderer.js` | Act 活性颜色沿用上游 `Canvas.drawActivityValues` 的绿—黄—红映射，分别用于 Canvas 与 WebGL2 显示。 |

`vendor/artistoo.js` 的 Git blob ID 为 `0ebf46bc3b16ea71eec7093c92070bc944a0c47e`，与上述固定提交的文件一致；SHA-256 为 `cf324da4b8a475853f02bcc842662ade65140132fe11d6db4e034ea17a5ca7e5`。本项目的“内核优化”和“WebAssembly 加速”包含对上游机制与代码的改编，不表示整个 CPM 内核均由本项目原创。

## 2. MT19937 / Mersenne Twister：随 Artistoo 带入的随机数实现

- 算法与原始实现作者：Makoto Matsumoto、Takuji Nishimura。
- 版权：Copyright (C) 1997 - 2002, Makoto Matsumoto and Takuji Nishimura, All rights reserved.
- 上游包内还保留了 Sean McCullough（[banksean](https://github.com/banksean)）的 JavaScript 命名空间封装署名。
- 本次使用的具体来源是上述固定版本 `build/artistoo.js` 开头的 `MersenneTwister` 实现和声明；[上游 package.json](https://github.com/ingewortel/artistoo/blob/e997d81213a5dcdfc40ad976a18958f412f00cc9/package.json) 列有 `mersenne-twister` 依赖。
- 许可证：BSD 三条款（BSD-3-Clause）；完整上游条款与免责声明单列于 [vendor/MT19937-LICENSE.txt](vendor/MT19937-LICENSE.txt)，原来的包内声明也保留。
- 范围：`vendor/artistoo.js` 内的随机数发生器；`src/cpm-kernel.c` 的 `random_value` 及其编译产物中的移植实现。C 内核沿用相同状态、twist／tempering 与随机数序列。

两个完整许可证都内嵌在独立 HTML 的“模型与来源 → 代码来源、版本与许可”中，并随静态构建复制到 `dist/licenses/`；因此离线单文件和公开网页都附带声明。

## 3. 视觉与科学参考

- [Artistoo · Cancer Invasion](https://artistoo.net/examples/CancerInvasion.html)：参考类型配色、关闭 Act 时的胞体显示、细胞边界观感，以及填满培养区域的上皮单层布局。新增的加权 Voronoi 初始分区与圆形迷宫由本项目实现。本仓库不包含该示例网页或其截图；本项目的情境、交互、代谢场和谱系规则见源代码及模型说明。
- [Artistoo · NoTorusDemo](https://artistoo.net/examples/NoTorusDemo.html)：参考窄通道与细胞尺寸比例及 Act 迁移显示；圆弧迷宫、接头与扩散切换由本项目实现，没有包含该示例脚本。
- Act 迁移模型、CTL 招募、代谢竞争、累积杀伤和癌前监视等论文：在 [MODEL.md](MODEL.md#机制参考) 与网页“模型与来源”中列出作者、题目／主题和原始论文链接，属于机制依据，不作为代码许可证使用。
- 局部吸引、分离、方向协同等群体运动启发是规则层面的参考；没有另行打包蚁群或鸟群算法库。
- U87 形态和胶质瘤连接网络的原始研究在 [MORPHOLOGY.md](MORPHOLOGY.md#原始研究与证据边界) 列出。动态突起与接触稳定规则是本项目的定性扩展，没有复制这些论文的仿真代码、图像或视频。

WebGL2、WebGPU 和 WebAssembly 是浏览器接口。WASI SDK/Clang 是开发时编译工具，GitHub Actions 是构建部署服务；本仓库不包含这些工具的可执行文件。项目新增的通讯、微环境、谱系、切面约束与交互仍是定性、未标定的模型扩展，边界见 [MODEL.md](MODEL.md)。

`src/experiment.js` 的参数验证、`src/i18n.js` 与 `src/about.en.html` 的双语界面、`src/recorder.js` 的画布录制与裁切均为本项目扩展，没有新增翻译、录屏或视频编解码依赖。录制使用浏览器自带 MediaRecorder；WebM 时长元数据按 [Matroska 元素规范](https://www.matroska.org/technical/elements.html) 写入，未引入外部视频处理库。
