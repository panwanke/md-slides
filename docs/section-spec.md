# 幻灯片分节与折叠导航规范 (Section Specification)

## 1. 功能背景与需求目标
在学术汇报与复杂演示稿中，幻灯片数量通常在 30–80 页之间。缺乏分节结构的纯列表导航会导致侧边栏过长，难以快速定位不同模块。
借鉴 PowerPoint (PPTX) 的分节（Sections）机制，`jc-slide-studio` 引入**幻灯片逻辑分节与折叠导航系统**：
- 支持将连续的若干页幻灯片聚合成一个有语义名称的“节”（Section）。
- 工作台侧边栏支持按节折叠与展开，支持一键“折叠/展开全部”。
- 点击某节内的幻灯片，工作台平滑跳转并聚焦。

## 2. Markdown 分节识别语法

### 2.1 显式属性声明
在任意幻灯片的元数据指令中声明 `section` 属性，将以此页作为新节的起始页：
```markdown
<!-- slide: section=理论背景与核心假设 -->
# 理论背景与核心假设
...
```

### 2.2 结构化版式自然分节
解析器支持按学术汇报常规版式自动推断分节，作者无需额外添加标记：
1. **封面节 (`cover`)**：首页封面自动聚入“封面与概述”节。
2. **目录节 (`toc`)**：目录页自动聚入“目录与大纲”节。
3. **过场节 (`section`)**：过场页（Section divider）自动作为新章节起点，标题自动取该页的 `# 标题`。
4. **结语页 (`end`)**：沿用当前章节。独立分节时可声明 `section=结语与致谢`。

## 3. AST 数据模型定义

在 `build_document_ast` 输出的语法树中追加 `sections` 集合：

```json
{
  "documentRevision": 1,
  "slideCount": 24,
  "sections": [
    {
      "id": "sec-1",
      "number": 1,
      "title": "封面与概述",
      "slideIndices": [1],
      "slides": [
        { "slideId": "slide-1", "index": 1, "title": "项目汇报", "layout": "cover" }
      ]
    },
    {
      "id": "sec-2",
      "number": 2,
      "title": "01 实验一行为结果",
      "slideIndices": [2, 3, 4],
      "slides": [...]
    }
  ]
}
```

## 4. 工作台交互实现
- 侧边栏为每个 Section 渲染可折叠的分组卡片。
- 支持保存作者当前的折叠状态（`collapsedSections`）。
- 顶部提供一键“折叠/展开全部”快捷操作。
