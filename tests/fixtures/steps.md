---
jc:
  title: "md-slide-studio 官方发布"
  title_zh: "为极客、学者与创作者打造的新一代 Markdown 演示工作台"
  kicker: "PRODUCT LAUNCH · 2026 RELEASE"
  theme: academic-paper
  themes: "academic-paper,minimal-white,pitch-deck-vc,aurora,tokyo-night,catppuccin-mocha"
  lang: zh
  presenter: "md-slide-studio 团队"
  presenter_affil: "Real-time Presentation Workbench"
  footer: "md-slide-studio · Markdown Slide Engine"
---

<!-- slides:start -->
<!-- slide: layout=cover -->

::: notes
尊敬的各位学者、开发者与演讲者，欢迎体验 md-slide-studio 官方产品发布与特性全景演示。本工作台专为学术汇报、技术分享与方案路演量身打造，彻底解耦书写与表现。在放映过程中，您可以按空格键或方向键切页，按 N 键展开讲稿视窗，按 T 键快速切换 36 套全局主题。
:::

---
<!-- slide: layout=two-col | transition=slide | section=演进理念 -->
# 传统演示的沉重枷锁 vs. Markdown 纯粹生产力

- **传统 PPT / Keynote 的困境**
  - **二进制黑盒冲突**：多人协同无法进行 Git 逐行 diff 与合并审查。
  - **心智负担过载**：80% 精力耗费在拖拽像素与字体对齐，打断思考心流。
  - **跨设备环境崩溃**：会场电脑缺少字体或 Office 版本不一致导致公式乱码错位。

+++

::: box md-slide-studio 的破局思路
- **内容与表现彻底解耦**：纯文本聚焦论点组织，样式交由专业排版引擎。
- **Git 原生纳管**：每一处改动均可版本回溯，团队协作无黑盒冲突。
- **现代 Web 标准驱动**：自适应流式排版，任意现代浏览器即开即播。
:::

::: notes
传统幻灯片软件将内容、排版和二进制格式紧密捆绑，带来了严重的维护难题。md-slide-studio 重新梳理了演示文稿的核心诉求：让作者回归纯文本书写，让表现交由强大的现代 CSS 与 Web 状态机，兼顾创作效率与极致的视觉呈现。
:::

---
<!-- slide: layout=two-col | transition=fade | section=多维排版 -->
# 多维排版系统与原生学术表现力

- **多样化布局架构**
  - 支持封面、目录导览、双栏对比、要点列表、独立大图与封底。
  - **极简双栏语法**：只需在正文中插入单个 `+++` 分栏符，即刻自适应生成响应式双栏。
- **原生矢量数学公式**
  - 行内公式自然混排：香农信息熵 $H(X) = -\sum_{i=1}^n P(x_i) \log_2 P(x_i)$。
  - 块级高斯分布密度函数：
    $$f(x \mid \mu, \sigma^2) = \frac{1}{\sqrt{2\pi\sigma^2}} \exp\left(-\frac{(x - \mu)^2}{2\sigma^2}\right)$$

+++

::: box 36+ 套内置高质感主题体系
- **学术沉稳**：`academic-paper` · `editorial-serif`
- **现代极简**：`minimal-white` · `swiss-grid`
- **极客暗色**：`tokyo-night` · `catppuccin-mocha` · `nord`
- **商业路演**：`pitch-deck-vc` · `aurora`
- 支持顶栏主题选择器即时预览，放映时按快捷键 `T` 一键全局换肤。
:::

::: notes
学术与专业演示对公式、图表和版式有着严苛的清晰度要求。md-slide-studio 原生集成 KaTeX 渲染引擎，数学符号均以矢量级精度生成，即便在 4K 投影下边缘依然锐利如初。结合 36 套涵盖各行业审美的主题，只需一键即可切换整套视觉基调。
:::

---
<!-- slide: layout=two-col | transition=slide | section=交互工作台 -->
# 实时编辑与双向无缝跳转

- **毫秒级极速实时编辑 (Live Editing)**
  - 基于 CodeMirror 6 高性能编辑核心，内置 Markdown 语法高亮。
  - 键入内容时，增量 AST 解析器毫秒级重构页面，所写即所见，彻底告别“修改-保存-切屏刷新”的割裂体验。
- **成片反向寻源定位 (Click-to-Source)**
  - 在右侧成片画布中直接点击任意标题、段落、图片或卡片，左侧源码光标瞬间精准跳转到对应行！
- **大纲结构双向联动 (Outline Sync)**
  - 左侧树形大纲点击快速切页，放映进度即时响应；滚动或切页时光标自动跟随对齐。

+++

::: box 双向交互带来的生产力飞跃
- **所见即所寻**：长篇演示稿无需在数百行 Markdown 中人肉翻找，点哪改哪。
- **全功能撤销恢复**：支持完整的编辑历史撤销（Ctrl+Z / Ctrl+Y），安全可控。
- **源码与实时双模式**：随意在富交互模式与纯 Markdown 文本之间自由切换。
:::

::: notes
双向联动是本工作台最核心的交互突破。用户在右侧预览画布中校对幻灯片时，只要点击任何觉得需要调整的文字或卡片，左侧编辑器便会瞬间定位高亮该段落的 Markdown 源码。这让长篇幻灯片的润色与修改体验提升到了前所未有的流畅度。
:::

---
<!-- slide: layout=two-col | transition=fade | section=动态演示 -->
# 分步动画与图文节奏控制

::: fragment step=1 effect=fade-up
- **按方向键逐条出现 (Sequential Fragments)**：按方向键或空格键逐条展开要点，掌控观众注意力与演讲节奏。
:::

::: fragment step=2 effect=fade
- **动态图文交错解析**：说明卡片与图表可设置相同或不同的 step 批次，实现多层次动态演进。
:::

::: fragment step=3 effect=fade-up
- **双向撤回微步机制**：按左键不仅支持切回上一页，更能逐步撤回已呈现的要点，便于回溯推导。
:::

+++

::: fragment step=1 effect=fade-up
![架构流程图](steps.svg "图注：md-slide-studio 端到端编译与运行时流水线")
:::

::: fragment step=2 effect=fade
::: box 声明式分步语法
只需标记 `::: fragment step=1 effect=fade-up`，无需手写繁杂的 CSS 关键帧，引擎自动编排状态机。
:::
:::

::: notes
在做复杂学术机制推导或技术方案讲解时，一口气展示所有信息往往会导致观众注意力分散。md-slide-studio 提供了直观的 fragment 分步机制，图件、图注与文字卡片均可按步精确编排，并支持随时方向键单步回退，让演说张弛有度。
:::

---
<!-- slide: layout=two-col | transition=slide | section=独立成片 -->
# 独立成片：自包含单个 HTML 导出

- **单个 HTML 打包全部依赖**
  - CSS 样式、交互脚本、KaTeX 数学字体、动画运行库与矢量图片全部内嵌打包。
  - 产物仅为一个轻量级单文件 `.html`，体积通常仅数百 KB。
- **真正的零依赖 · 脱网自由放映**
  - 彻底摆脱网络依赖：即使会场没有 Wi-Fi 或处于飞行模式，双击即可秒开全屏放映。
  - 无需安装 Node.js、Python 或任何演示插件，任何现代浏览器均可完美播放。
- **极简分发与极速分享**
  - 微信、邮件、AirDrop 秒发，跨设备跨平台完美还原，杜绝字体丢失与排版崩溃。

+++

::: box 一键命令行与界面导出
- **终端一键打包命令**：
  ```bash
  md-slide-studio render deck.md --out ./dist
  ```
- **工作台界面导出**：
  在编辑工作台右上角点击「导出离线 HTML」，即刻生成单文件成片。
- **Git 友好度极致**：
  源码始终只有纯文本 `.md`，分支合并、历史追溯轻松愜意。
:::

::: notes
单文件自包含 HTML 是 md-slide-studio 的核心交付形态。导出的单个 HTML 真正做到了免安装、脱网可用、跨平台一致，再也不必提心吊胆带上字体包或担心投影仪电脑的 Office 版本不匹配，将演示的便携性推向极致。
:::

---
<!-- slide: layout=end | transition=none -->
# 开启您的 Markdown 演示新体验

## 专注思考 · 极简书写 · 极致呈现

- **全场景快捷键掌控**：`F` 全屏放映 · `S` 演讲者双屏模式 · `N` 备忘讲稿 · `O` 页面概览 · `T` 主题切换
- **双屏演讲者视窗**：主大屏放映幻灯片，副屏呈现演讲备忘与计时器，从容把握全场节奏
- **开箱即用**：欢迎在当前工作台中直接修改本页内容，体验实时响应与极致书写流！

::: notes
感谢大家的聆听！md-slide-studio 致力于将纯文本的自由书写与现代 Web 的卓越表现深度结合。现在您就可以在当前页面的编辑器中尝试输入新的内容或修改卡片文字，亲身感受实时编辑与双向跳转带来的流畅创作体验。
:::
