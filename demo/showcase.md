---
jc:
  title: "Markdown ⇄ HTML"
  title_zh: "从极简书写到交互成片：演示稿的解耦与重构"
  kicker: "通用演示 · Concept & Architecture"
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
<!-- slide: layout=toc | section=演进理念 -->
# 目录导航

1. 书写层与表现层的权衡
2. 结构解耦：Markdown AST 与 DOM
3. 数学表达：从 LaTeX 源码到矢量渲染
4. 动态交互：分步动画与状态机
5. 独立成片：自包含单文件 HTML 分发

---
<!-- slide: layout=two-col | transition=slide -->
# 书写层 vs. 表现层：职责解耦

- **Markdown（书写层）**
- 纯文本语义、低心智负担
- Git 纳管逐行 diff，多人协同无黑盒二进制冲突
- 专注于思考、论点组织与内容沉淀

+++

- **HTML / DOM（表现层）**
- CSS 响应式流式布局与 36 套全局主题体系
- 矢量动画、键盘事件与幻灯片状态机
- 跨平台免安装，任意现代浏览器即可放映

::: notes
内容与样式的彻底解耦：一次书写，即可通过不同主题与引擎编译为多种放映形态。
:::

---
<!-- slide: layout=two-col | transition=fade | section=数学公式 -->
# 数学公式原生渲染：LaTeX 到 KaTeX

行内公式示例：香农信息熵公式 $H(X) = -\sum_{i=1}^n P(x_i) \log_2 P(x_i)$，在文本段落行内自然混排。

块级高斯分布概率密度函数：
$$f(x \mid \mu, \sigma^2) = \frac{1}{\sqrt{2\pi\sigma^2}} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right)$$

经典欧拉恒等式：$e^{i\pi} + 1 = 0$

+++

::: box KaTeX 渲染机制优势
- **纯前端零延迟**：毫秒级生成 HTML 与 MathML 结构
- **排版无抖动**：同步字体度量，避免加载过程中的布局闪烁
- **矢量级清晰度**：4K 高清大屏投影边缘始终平滑锐利
:::

::: notes
公式支持行内与块级两种模式，无需转为光栅图片，保持高清晰度与复制性。
:::

---
<!-- slide: layout=bullets | transition=slide | section=动态交互 -->
# 编译管线：从源文到成片的三阶段

::: fragment step=1 effect=fade-up
- **Phase 1 · 词法与语法树解析**：扫描 Frontmatter 元数据、分节标题与 `+++` 分栏符，构建结构化 AST。
:::

::: fragment step=2 effect=fade
- **Phase 2 · 模板装配与资产注入**：注入 36 套学术/现代主题 CSS、离线 CJK 字体规则与放映运行时。
:::

::: fragment step=3 effect=fade-up
- **Phase 3 · 单文件完全自包含**：将依赖内联为单份脱网 HTML，随时随地在任何设备上播放。
:::

::: notes
按右键或空格键，各阶段将按预设节奏平滑逐条入场。
:::

---
<!-- slide: layout=two-col | transition=fade -->
# 极简标记与对应产物

```markdown
<!-- slide: layout=two-col -->
# 页面标题

左栏核心说明文字

+++

右栏补充卡片或图表
```

+++

::: box 极简语法的力量
- 无需繁重的闭合 HTML 标签
- 单个 `+++` 即可实现响应式双栏排版
- 单命令一键编译打包：`jc-slide-studio render deck.md`
:::

---
<!-- slide: layout=end -->
# Markdown 书写 · HTML 呈现

> [GitHub 仓库](https://github.com/panwanke/md-slides) · [在线演示](https://panwanke.github.io/md-slides/)

- 纯文本可持久化、无黑盒依赖
- 开箱即用离线运行与分发
