# 架构设计详细说明 (Architecture Detail)

本文档补充详细模块职责与交互时序。

## 1. 模块层次结构

```text
src/jc_slide_studio/
├── cli.py                 # CLI 命令解析与分发
├── document/              # Markdown 解析、AST 遍历、源码区间映射与局部文本替换
├── render/                # HTML 模板装配、章节导航注入、动画解析、静态资源内嵌打包
├── session/               # 会话状态、版本管理、原子写盘、文件监听与外部变更冲突判定
├── server/                # FastAPI 应用实例、REST API 路由、WebSocket 状态广播
├── providers/             # 主题资源管理器、播放器运行时包、图件资源适配器
└── web_dist/              # 生产环境嵌入的已构建前端静态资源
```

## 2. 状态同步与构建时序

1. 工作台从 `GET /api/document` 加载文本和 AST。CodeMirror 6 用同一份 Markdown 保存编辑器状态、光标与撤销记录。
2. 键盘输入和可视化控件产生 CodeMirror 事务。工作台防抖后串行发送 `PUT /api/document`，并用未保存的编辑映射 AST 中的源码区间。
3. 服务端保存文档、返回新 AST，并通过 `/ws` 广播 `RELOAD` 版本号。工作台用版本号刷新 `/preview/workbench`，随后恢复页码与分步位置。
4. 成片元素通过 `postMessage` 向同源工作台报告页码和内容类型，工作台在 CodeMirror 中选中对应的源码。独立演示窗口使用 `/preview/live`。
