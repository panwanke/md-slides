---
jc:
  title: "jc-slide-studio"
  title_zh: "Markdown 学术幻灯片工作台与独立离线渲染引擎"
  kicker: "交互式成片演示 · Live Presentation Demo"
  theme: academic-paper
  themes: "academic-paper,minimal-white,sunset-warm,catppuccin-mocha,editorial-serif,nord"
  lang: zh
  footer: "jc-slide-studio · Markdown Slide Engine"
---

<!-- slides:start -->
<!-- slide: layout=cover -->

::: notes
欢迎体验 jc-slide-studio 在线演示稿。按方向键或空格键切页，按 N 键查看演讲者备注。
:::

---
<!-- slide: layout=toc | section=核心架构 -->
# 目录导航

1. 项目定位与核心优势
2. 双向联动与受控编辑
3. 学术公式与图表排版
4. 分步动画与放映交互
5. 快速上手与本地安装

---
<!-- slide: layout=two-col | transition=slide -->
# 项目定位与核心特性

- **脱离环境独立运行**：作为标准 Python / Web 工具分发，零外部服务器依赖。
- **双向联动聚焦**：大纲、源码光标与成片画布三向协同，点击元素直达 Markdown 源码。
- **受控原子回写**：在预览与卡片中修改版式，通过事务安全更新源文件。
- **开箱即用打包**：内置 36 套专业学术主题、离线中文字体与播放运行时。

+++

::: box 为什么选择 Markdown 排版幻灯片？
- 纯文本版本控制，Git 历史一目了然
- 内容与样式解耦，支持一键切换 36 种主题配色
- 离线单文件 HTML 输出，随时随地在任何浏览器中放映
:::

::: notes
展示 Markdown 在学术汇报和技术演讲中的独特生产力优势。
:::

---
<!-- slide: layout=two-col | transition=fade | section=学术排版 -->
# 学术公式与数学模型

支持 KaTeX 高精度数学公式原生渲染，适合展示认知模型与计算公式：

漂移扩散模型（Drift Diffusion Model, DDM）：
$$dx(t) = v \cdot dt + s \cdot dW(t)$$

贝叶斯后验推断公式：
$$P(\theta \mid D) = \frac{P(D \mid \theta) P(\theta)}{\int P(D \mid \theta') P(\theta') d\theta'}$$

+++

::: box 参数语义说明
- $v$：漂移率（Drift Rate），表征证据积累速率
- $a$：边界距离（Boundary Separation），表征决策保守程度
- $z$：初始偏好（Starting Point Bias）
- $t_0$：非决策时间（Non-decision Time）
:::

::: notes
KaTeX 支持行内与块级公式，保持高对比度与矢量清晰度。
:::

---
<!-- slide: layout=bullets | transition=slide | section=动画交互 -->
# 分步动画与演示节奏控制

::: fragment step=1 effect=fade-up
- **第一步**：使用 `::: fragment` 语法标记动画组与触发步次。
:::

::: fragment step=2 effect=fade
- **第二步**：支持多种入场动效（`fade`, `fade-up`, 缩放与位移）。
:::

::: fragment step=3 effect=fade-up
- **第三步**：演示者可随时按左键撤回上一步，按右键或空格继续播放。
:::

::: notes
按方向右键或空格键，内容将按定义的步骤逐条平滑出现。
:::

---
<!-- slide: layout=two-col | transition=fade -->
# 命令行工具与工作台

```bash
# 环境体检
jc-slide-studio doctor

# 编译为单文件离线 HTML
jc-slide-studio render deck.md --out ./dist

# 启动本地实时编辑工作台
jc-slide-studio edit deck.md

# 启动云端/数据库幻灯片库
jc-slide-studio serve --port 9000
```

+++

::: box 质量守门与工程规范
- 37 项端到端测试与单元测试全面覆盖
- 支持 Playwright 真实浏览器操作自动化测试
- 标准 AST 语法树解析与双向源码无损映射
:::

---
<!-- slide: layout=end -->
# 谢谢观看

> [GitHub 仓库](https://github.com/panwanke/md-slides) · [在线演示](https://panwanke.github.io/md-slides/)

- 欢迎 Star 与提出 Issue
- 支持纯本地运行与离线分发
