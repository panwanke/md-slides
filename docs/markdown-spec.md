# Markdown 幻灯片方言与语法规范 (Markdown Spec)

本文档是 `md-slide-studio` 渲染与解析的权威语法参考。

## 1. 幻灯片分割
- 一级幻灯片分隔符：`---`（前后需有空行）
- 垂直/子幻灯片分隔符（可选）：`--`

## 2. 页面元数据与指令 (Frontmatter & Directives)
每页幻灯片顶部可包含属性配置块：
```markdown
<!-- slide: id=s01-title | layout=two-col | section=研究背景 | transition=fade -->
```
常用指令属性：
- `layout`: 布局类型，支持 `cover`、`toc`、`bullets`、`two-col`、`end`。
- `section`: 章节归属名，自动聚合至分节导航栏与目录页。
- `transition`: 切换过渡动画（如 `slide`、`fade`）。

## 3. 多栏排版 (Multi-column Layout)
在 `layout=two-col` 的页面中，使用 `+++` 作为分栏符：
```markdown
<!-- slide: layout=two-col -->
# 左右分栏标题

左栏主体内容、列表或说明文字。

+++

右栏补充卡片、公式或图表。
```

## 4. 讲稿块 (Speaker Notes)
使用标准通用语法块：
```markdown
::: notes
这里是演讲者的备忘讲稿，演讲时可见，幻灯片主画布默认隐藏。
:::
```

## 5. 容器卡片块 (Callout Boxes)
使用 `::: box` 语法渲染信息高亮卡片：
```markdown
::: box 核心洞察与结论
卡片内部支持 Markdown 列表、加粗与公式。
:::
```

## 6. 数学公式 (KaTeX Math)
原生内置 KaTeX 离线渲染，无需联网：
- **行内公式**：`$E = mc^2$` 或 `$H(X) = -\sum P(x_i) \log_2 P(x_i)$`
- **块级公式**：
  ```markdown
  $$
  f(x \mid \mu, \sigma^2) = \frac{1}{\sqrt{2\pi\sigma^2}} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right)
  $$
  ```

## 7. 结构图表 (Pele & Mermaid Diagrams)
原生内置 Obsidian 官方 Pele 图表引擎，将代码块渲染为高质量脱网 SVG：
- **代码块标记**：支持 `mermaid`、`pele` 或 `diagram` 语言标头：
  ````markdown
  ```mermaid
  flowchart LR
      A[源文书写] --> B[AST 解析]
      B --> C[SVG 渲染]
  ```
  ````
- **图型覆盖**：支持 Flowchart（流程图）、Sequence（时序图）、Class（类图）、State（状态图）、ER（实体关系）、Gantt（甘特图）、Mindmap（思维导图）、Timeline（时间轴）、GitGraph 等。
- **双向联动**：工作台预览区点击图表节点，左侧编辑器光标自动高亮定位至对应代码块。
- **容错降级**：若图表语法编写错误，自动呈现原始代码与错误提示，避免整页渲染崩溃。

## 8. 章节与导航标记
使用二级与三级标题自动聚合为章节目录：
- `# 章节名`：一级大章节过渡页。
- `## 页面标题`：当前幻灯片的主要业务标题。

## 9. 动画片段 (Fragments)
使用 `::: fragment` 或特定的列表标记逐步呈现要点：
```markdown
::: fragment step=1 effect=fade
- 第一步呈现
:::
::: fragment step=2 effect=fade-up
- 第二步呈现
:::
```
