# 规范与验收标准基线 (Spec and Acceptance)

## 1. 命令行接口规范 (CLI Spec)

```bash
# 诊断环境与资源
jc-slide-studio doctor --json

# 语法与结构静态检查
jc-slide-studio check <source.md> --json

# 离线渲染生成 HTML
jc-slide-studio render <source.md> --out <directory> [--filename <name.html>] --json

# 启动本地服务并打开预览
jc-slide-studio preview <source.md> [--port <port>]

# 启动本地编辑工作台
jc-slide-studio edit <source.md> [--port <port>]
```

## 2. 核心验收矩阵 (Acceptance Matrix)

| 维度 | 验收指标 | 验证方法 |
|---|---|---|
| **旧稿兼容性** | 既有学术汇报稿件页数、章节目录、notes、动画结构 100% 一致 | 自动化 diff 校验 DOM 结构与关键属性 |
| **源码映射精度** | 点击预览区任何标题、段落、列表项，编辑器光标精确跳至源码对应首字符 | 端到端自动化测试验证源码选择区 |
| **受控回写安全性** | 页面编辑文本后回写，未涉及的 Markdown 语法、公式、空行、注释零篡改 | 文本往返 (Round-trip) diff 仅存在被改字段 |
| **单进程分发** | 仅依赖 Python 环境，单命令即开即用，无需 Node 运行时 | 纯净 Python 3.12 环境安装 wheel 并启动测试 |
| **外部变更安全** | 外部编辑文件（如 VS Code 或 Agent 写入）时，工作台提示冲突且不盲目覆盖 | 模拟外部写入触发冲突告警测试 |
| **构建性能** | 常规改动防抖构建延迟 P95 < 1.0s | 本地基准测试计时 |
