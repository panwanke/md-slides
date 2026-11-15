# 系统架构与核心契约 (Architecture)

## 1. 系统总体架构

```
+-------------------------------------------------------------+
|                      Browser / Client                       |
|  +-------------------------------------------------------+  |
|  |           Web Studio (React + Vite + CM6)             |  |
|  |  [Page Navigator] [CodeMirror Editor] [Inspector]    |  |
|  |  [Preview Canvas (iframe + epool/reveal player)]      |  |
|  +-------------------------------------------------------+  |
+------------------------------^------------------------------+
                               | HTTP API / WebSocket
+------------------------------v------------------------------+
|               Python Service (FastAPI / Uvicorn)            |
|  +-------------------+  +-------------------+  +---------+  |
|  |   Server Layer    |  |   Session Layer   |  | Providers| |
|  | (API, WS, Static) |  | (Versions, Lock)  |  | (Themes) | |
|  +-------------------+  +-------------------+  +---------+  |
|  +-------------------+  +-------------------+               |
|  |  Document Parser  |  |   Render Engine   |               |
|  | (AST, Source Map) |  | (HTML, Navigation)|               |
|  +-------------------+  +-------------------+               |
+------------------------------^------------------------------+
                               | File I/O (Atomic Write)
                               v
                     [ Markdown Source (.md) ]
```

## 2. 三层状态分离
1. **持久来源 (Persistent Source)**：Markdown 文件，以及其显式引用的本地图片/样式。
2. **编辑状态 (Session State)**：内存中的文档版本、AST 节点树、源码位置映射、选区与事务历史。
3. **生成物 (Derived Artifacts)**：生成的 HTML 文件、静态打包资源、缩略图。

## 3. 核心子系统职责

### 3.1 Document (`src/jc_slide_studio/document/`)
- 解析 Markdown 文件为结构化 Slide AST。
- 计算并维护每个幻灯片、标题、段落、讲稿 (`::: notes`)、块级组件的源码位置区间 (`sourceRange: [start, end]`)。
- 执行局部安全替换：输入 `(nodeId, field, newValue)`，基于 AST 定位到确切文本范围，精准替换并产出新版本文档。

### 3.2 Render (`src/jc_slide_studio/render/`)
- 生成包含章节导航、页面转场、动画片段与播放器脚本的 HTML 页面。
- 提供离线打包能力（内嵌 CSS/JS/图片资源）。
- 支持生成单文件 HTML，严格禁止命名为 `index.html`。

### 3.3 Session & Server (`src/jc_slide_studio/session/` & `server/`)
- 管理编辑会话，支持版本自增与乐观锁。
- 监听外部文件变动，检测冲突。
- 提供 WebSocket 实时同步文档状态与构建状态。
- 提供静态文件服务（开发时热重载，生产时直接挂载 `web_dist/`）。
