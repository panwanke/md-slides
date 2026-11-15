# jc-slide-studio (md-slides) Overview

## 项目定位与背景
`jc-slide-studio` 是专为学术研究汇报与复杂演示稿设计的 Markdown 幻灯片工作台与独立渲染引擎。

核心定位：
1. **脱离 Skill 独立运行**：工具具备独立 Git 仓库、版本和 CLI，不再依赖特定的 Agent Skill 目录结构。
2. **双向定位与实时反馈**：结合 CodeMirror 6 与预览 iframe，实现光标页跟随、切页聚焦、元素点击定位源码。
3. **受控可视化回写**：在预览中直接编辑标题、正文、讲稿与版式，通过文档事务原子回写 Markdown 源码，保持撤销历史一致且排版不劣化。

## 核心架构原则
- **持久来源唯一**：Markdown 是唯一的权威持久来源，语法树与 HTML 均为派生状态，可随时重建。
- **单进程即开即用**：静态前端打包嵌入 Python 发行包，无需用户或调用方单独启动 Node 进程。
- **协议契约稳定**：通过结构化 CLI (`doctor`, `check`, `render`, `preview`, `edit`) 与标准 JSON 响应对外交互。

## 范围与边界
- 属于 `software-tool` 类别。
- 不负责学术论证优劣、讲稿合规性等高阶内容判断（仍由上层 skill 与人负责）。
