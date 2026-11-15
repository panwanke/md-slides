# Markdown 幻灯片方言与语法规范 (Markdown Spec)

本文档是 `jc-slide-studio` 渲染与解析的权威语法参考。

## 1. 幻灯片分割
- 一级幻灯片分隔符：`---`（前后需有空行）
- 垂直/子幻灯片分隔符（可选）：`--`

## 2. 页面元数据与指令 (Frontmatter & Directives)
每页幻灯片顶部可包含属性配置块：
```markdown
<!-- slide: id=s01-title | layout=two-col | section=研究背景 | transition=fade -->
```

## 3. 讲稿块 (Speaker Notes)
使用标准通用语法块：
```markdown
::: notes
这里是演讲者的备忘讲稿，演讲时可见，幻灯片主画布默认隐藏。
:::
```

## 4. 章节与导航标记
使用二级与三级标题自动聚合为章节目录：
- `# 章节名`：一级大章节过渡页。
- `## 页面标题`：当前幻灯片的主要业务标题。

## 5. 动画片段 (Fragments)
使用 `::: fragment` 或特定的列表标记逐步呈现要点：
```markdown
::: fragment step=1 effect=fade
- 第一步呈现
:::
::: fragment step=2 effect=fade-up
- 第二步呈现
:::
```
