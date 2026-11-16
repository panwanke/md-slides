# 项目文档中心 (Documentation Hub)

欢迎查阅 `jc-slide-studio` (md-slides) 技术文档库。

<!-- ara-docs:begin -->
<!-- ara-docs:source-sha256=55c2aad2d5ad7bdacec3330e8b0f2bf64532608148a437597c5c3867e2adaa52 -->

> 自动生成：只修改 ara.yaml 的 documentation / workflows，再运行 render-docs --write。

## 1. 分类与放置

| 类别 | 判据与位置 |
|---|---|
| root | Stable specifications and entrypoints in docs/. |
| rules | Invariants and terminology in docs/rules/. |
| plans | Tactical execution plans in docs/plans/. |

### 命名

| 类别 | 文件名 |
|---|---|
| root | TOPIC.md |
| rules | TOPIC.md |
| plans | YYYY-MM-DD-*.md |

## 2. 任务 → 按顺序读取

| 登记 ID | 做什么时参考 | 读取顺序 |
|---|---|---|
| workflow.integrate_cloud_service | 在已发布应用上接入 WorkBuddy 云服务（登录 + 云端保存）并准备更新发布前 | [docs/ops/integrate-workbuddy-cloud-runbook.md](<ops/integrate-workbuddy-cloud-runbook.md>) → [logic/report/2026-11-16-workbuddy-cloud-service-integration-report.md](<../logic/report/2026-11-16-workbuddy-cloud-service-integration-report.md>) |
| read.understand_architecture | 在修改系统分层、服务与编辑器结构前 | [docs/architecture.md](<architecture.md>) |
| read.check_markdown_dialect | 在开发解析器、语法树与标记扩展时 | [docs/markdown-spec.md](<markdown-spec.md>) |
| read.inspect_protocol | 在开发前后端 WebSocket/REST 通信与 CLI JSON 输出时 | [docs/protocol.md](<protocol.md>) |
| read.setup_development_env | 在搭建本地开发调试环境与运行测试时 | [docs/development.md](<development.md>) |
| read.inspect_section_spec | 在查看或开发幻灯片分节与折叠导航功能时 | [docs/section-spec.md](<section-spec.md>) |
| read.inspect_editor_spec | 在查看或开发类似 Obsidian 的实时预览与专有标记可视化编辑时 | [docs/editor-spec.md](<editor-spec.md>) |
| read.inspect_cloud_service | 在排查或补齐已发布 WorkBuddy 网站应用的登录、云端保存、云数据库与云存储时 | [logic/report/2026-11-16-workbuddy-cloud-service-integration-report.md](<../logic/report/2026-11-16-workbuddy-cloud-service-integration-report.md>) → [docs/ops/integrate-workbuddy-cloud-runbook.md](<ops/integrate-workbuddy-cloud-runbook.md>) |
| read.publish_static_release | 在发布静态站、核对 WorkBuddy 应用绑定或排查跨项目误覆盖时 | [docs/ops/publish-static-release.md](<ops/publish-static-release.md>) |

<!-- ara-docs:block-sha256=296be2426b6eb0b66cee7e4a25d3ddfe88f09a2b06a2a56517eb256110dc96fc -->
<!-- ara-docs:end -->

## 补充阅读
- [2026-11-16 WorkBuddy 云服务集成调查与落地记录](../logic/report/2026-11-16-workbuddy-cloud-service-integration-report.md)
- [2026-11-15 初始化与更新 Skill 规划](plans/2026-11-15初始化+更新skill.md)
- [2026-11-15 账号系统与云端存储设计](<plans/2026-11-15-账号系统与云端存储设计.md>)
