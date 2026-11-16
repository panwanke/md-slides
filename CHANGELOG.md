# Changelog

All notable changes to `jc-slide-studio` will be documented in this file.

## [Unreleased]

- 登记 WorkBuddy 云服务集成调查结果：新增[调查报告](logic/report/2026-11-16-workbuddy-cloud-service-integration-report.md)与[云服务接入 Runbook](docs/ops/integrate-workbuddy-cloud-runbook.md)，决策 D006，ARA 路由/ops 已登记。复用 `wbapp_Y8YYMDc6ZZ7Nz6ksDsXHuG` 激活云服务，建 `decks` / `deck_revisions` + owner RLS，前端新增 `web/src/cloud/` 适配层；两类构建通过，**按用户要求暂不发布**（发布前仍有 Pyodide 运行时与 base 路径阻塞点）。
- 移除腾讯云托管链路：删除 `deploy/cloudrun/` CloudBase Run 部署副本（含 `cloudbaserc.json`）、`cloudbase/migrations/` 建表迁移、`studio/pg_client.py` 与 `studio/service_pg.py` 两个 PG 后端实现，清理 `JC_STUDIO_BACKEND=cloudbase_pg` 分支与 `docs/ops/` 自建部署物料；服务端存储收敛为 SQLite，线上托管统一由 WorkBuddy 承载。

- 恢复 jc-slides 出片前的逐字稿验收闸门：`check` 新增 `--strict`，把缺讲稿与字数越界（中文 100–400 字符 / 英文 80–320 words）升级为 error；`ok=false` 时返回退出码 1，供技能侧 `--check` 委托阻断出片。`layout=journal|section` 缺讲稿仍不阻断。
- 修正文档中缺 `--out` 的 `render` 命令示例（`--out` 为必填项），涉及双语 README、示例稿、内置模板及 CloudBase Run 部署副本。
- 技能侧 `build_deck.py` 委托契约对齐：透传 `--filename` 恢复「源目录名.html」产物命名；工具不可用或协议不匹配时显式报错而非静默回退旧渲染；`--format directory` 明确拒绝并说明当前仅支持单文件独立成片。

- 修复登录后无法新建演示稿问题：将系统原生 prompt 升级为应用内模态弹窗（Modal），新建成功后自动跳转打开编辑工作台，并优化空状态一键新建与重命名、删除模态交互。
- 新增形态 A（GitHub Pages 静态试用站）：浏览器内通过 Pyodide 运行同一套 Python 渲染引擎，可编辑 Markdown、实时预览、导入/导出，无需登录与后端；运行时随站点打包，不依赖外部 CDN。
- 新增形态 B 部署物料：`docs/ops/` 下 Dockerfile、systemd unit、nginx 模板与[自建服务部署 Runbook](docs/ops/deploy_service_runbook.md)；业务代码零改动。
- 新增 `tests/test_static_studio.py`：验证打包引擎与 CLI 输出逐字节等价、浏览器内可真实渲染（`JC_TEST_STATIC=1` 启用浏览器用例）。
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
