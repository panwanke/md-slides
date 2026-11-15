# 项目文档中心 (Documentation Hub)

欢迎查阅 `jc-slide-studio` (md-slides) 技术文档库。

<!-- ara-docs:begin -->
<!-- ara-docs:source-sha256=c73ed088967cee437ffe6ce334006b721cae6c869b2ee2eff1a1b27b52c099f2 -->

> 自动生成：只修改 ara.yaml 的 documentation / workflows，再运行 render-docs --write。

## 1. 分类与放置

| 类别 | 判据与位置 |
|---|---|
| root | Stable specifications and entrypoints in docs/. |
| rules | Invariants and terminology in docs/rules/. |
| plans | Tactical execution plans in docs/plans/. |
| ops | Repeatable procedures in docs/ops/. |

### 命名

| 类别 | 文件名 |
|---|---|
| root | TOPIC.md |
| rules | TOPIC.md |
| plans | YYYY-MM-DD-*.md |
| ops | VERB_OBJECT_RUNBOOK.md |

## 2. 任务 → 按顺序读取

| 登记 ID | 做什么时参考 | 读取顺序 |
|---|---|---|
| read.understand_architecture | 在修改系统分层、服务与编辑器结构前 | [docs/architecture.md](<architecture.md>) |
| read.check_markdown_dialect | 在开发解析器、语法树与标记扩展时 | [docs/markdown-spec.md](<markdown-spec.md>) |
| read.inspect_protocol | 在开发前后端 WebSocket/REST 通信与 CLI JSON 输出时 | [docs/protocol.md](<protocol.md>) |
| read.setup_development_env | 在搭建本地开发调试环境与运行测试时 | [docs/development.md](<development.md>) |
| read.inspect_section_spec | 在查看或开发幻灯片分节与折叠导航功能时 | [docs/section-spec.md](<section-spec.md>) |
| read.inspect_editor_spec | 在查看或开发类似 Obsidian 的实时预览与专有标记可视化编辑时 | [docs/editor-spec.md](<editor-spec.md>) |

<!-- ara-docs:block-sha256=dae8275ac712e3c8550f91e591093fdfbf6d966c13d2de4f5e6c0e282e73b5d0 -->
<!-- ara-docs:end -->

## 补充阅读
- [2026-11-15 初始化与更新 Skill 规划](plans/2026-11-15初始化+更新skill.md)
- [2026-11-15 账号系统与云端存储设计](<plans/2026-11-15-账号系统与云端存储设计.md>)
- [自建服务部署 Runbook](<ops/deploy_service_runbook.md>)
