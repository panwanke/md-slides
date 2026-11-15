# Changelog

All notable changes to `jc-slide-studio` will be documented in this file.

## [Unreleased]

- 重排工作台的文档操作、大纲和成片控制，并新增 Markdown 实时编辑、页面设置控件和可折叠容器。见 [编辑器规范](docs/editor-spec.md)。

## [0.1.0] - 2026-11-15
### Added
- **[M0] 基础工程与 ARA 治理体系**：
  - 建立标准 ARA 目录骨架与事实源（`logic/`, `trace/`, `evidence/`, `docs/`, `arc/`）
  - 注册至 `proj-tracker` (`project-md-slides`) 并固化 M0 契约文档
  - 建立核心工程配置 `pyproject.toml`
- **[M1] 核心引擎完全迁出与资产内置**：
  - 打包内嵌 36 套专业主题、离线中文字体、播放器 runtime.js 与动画资源
  - 独立实现解析器 `document.parser`、语法语义检查器 `document.check`、离线打包器 `render.delivery`
  - 提供单命令 CLI：`doctor`, `check`, `render`, `preview`, `edit`
- **[M2] 交互式编辑工作台**：
  - PPTX 风格手风琴分节折叠与跳转导航
  - 大纲/源码/成片三栏双向拖拽调整栏（Splitter）
  - 当前幻灯片版式（layout）下拉菜单快速切换与语法快捷卡片插入
  - 热重载 WebSocket 机制与源文档相对附件优先路由
- **[M3] 受控回写事务与双向源码映射**：
  - 实现 `/api/patch` 事务端点，支持节点级（`node_id`）与区间级（`start_offset`, `end_offset`）原子修改
  - 画布元素点击向工作台发送 postMessage 反向高亮并平滑定位 Markdown 源码区间
  - 通过 Windows CRLF、中文、Emoji、嵌套容器 Round-trip 往返测试（Gate 3）
- **[M4] 独立包发布与单命令运行**：
  - 注册 `jc-slide-studio` 独立控制台可执行文件至 Python 3.12 环境
  - 验证离线单命令运行零外部服务依赖（Gate 4）
- **[M5] jc-slides Skill 接入**：
  - 更新 `jc-slides` 至 v0.18.0，`build_deck.py` 升级为透明委托适配器
  - `ops.json` 契约新增 `studio` 交互工作台操作
