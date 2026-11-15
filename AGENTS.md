# AGENTS.md

<!-- ara-governance:begin v1 -->
## ARA 结构治理（本项目由 ARA 管理）

本项目由 ARA 框架管理（ara-research-structure）；目录职责与产物落点以本块 + `ara.yaml` 为准。

**目录导航**
<!-- ara-governance:tree:begin -->
```text
md-slides/
├── CHANGELOG.md             # 指针型版本/轮次变更索引
├── README.md                # 项目定位、快速启动与目录导航
├── pyproject.toml           # Python 核心包工程配置与脚本入口
├── THIRD_PARTY_NOTICES.md   # 第三方组件来源与许可证声明
├── ara.yaml                 # ARA 项目清单与契约接口
├── AGENTS.md                # 包含 ara-governance 治理块
│
├── src/                     # Python 核心引擎源码
│   └── jc_slide_studio/     # 核心包（cli, document, render, session, server, providers）
├── web/                     # Web 前端工作台（React + Vite + CodeMirror 6）
├── schemas/                 # 通信协议与 AST 结构模式
├── tests/                   # 单元、集成与浏览器测试
│
├── logic/                   # 【宏观设计、路线图与阶段报告】
│   ├── overview.md          # 软件整体概述
│   ├── product-rationale.md # 产品定位与价值主张
│   ├── roadmap.md           # 宏观 Phase 划分 (M0-M6) 与 Gate
│   ├── architecture.md      # 系统总体架构设计
│   ├── spec-and-acceptance.md # 规范与验收标准基线
│   ├── story/               # 叙事视图（学术演示稿等）
│   └── report/              # 实测与冒烟汇总报告
│
├── trace/                   # 【过程账本、决策与状态】
│   ├── decisions/           # 决策记录 (ADR, decision-ledger)
│   ├── dead_ends/           # 被否决方案
│   ├── pivots/              # 架构与方向转向
│   ├── records/             # 轮次验收快照
│   ├── research-dag.yaml    # 决策链路 DAG
│   └── status.json          # proj-tracker 权威状态
│
├── evidence/                # 【机器可验证实测产物】
│   ├── results/             # 基准测试与冒烟数据
│   ├── exploratory/         # 探索性产物（默认不入库）
│   ├── figures/             # 截图与成图验证
│   └── audit.yaml           # 证据审计登记
│
├── docs/                    # 【技术规范、操作手册与计划】
│   ├── README.md            # 文档中心总导航
│   ├── architecture.md      # 架构详细说明
│   ├── markdown-spec.md     # Markdown 方言与语法规范
│   ├── protocol.md          # CLI 与 WebSocket 协议规范
│   ├── development.md       # 本地开发与测试指南
│   ├── section-spec.md       # 幻灯片分节与折叠导航规范
│   ├── editor-spec.md        # 实时编辑与专有语法可视化规范
│   ├── rules/               # 硬约束清单与概念词典
│   ├── plans/               # 战术执行计划
│   └── ops/                 # 可重复运维 Runbook
│
└── arc/                     # 【归档区】
    ├── plans/               # 已完成战术计划归档
    └── story/               # 历史成片版本归档
```
<!-- ara-governance:tree:end -->

**强规则（新增产物落点，随项目演进）**
1. 新生成的任何文档和代码必须落在上述框架目录内；
2. 框架内没有合适位置 → 先与用户讨论确认落点，不擅自生成；
3. 定案后同步更新本块目录规则与 `ara.yaml`（layers / documentation / source.areas），规则随项目演进。
<!-- ara-governance:end -->
