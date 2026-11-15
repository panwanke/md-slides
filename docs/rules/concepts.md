# 核心概念与术语唯一定义源 (Concepts & Definitions)

- **Slide AST (幻灯片语法树)**：Markdown 源文件经专用方言解析器解析后生成的树状结构，每个节点代表一页幻灯片、标题、正文块、讲稿或组件。
- **Source Range (源码区间)**：形如 `[start_offset, end_offset]` 的字符偏移区间，精确指向某节点在原始 UTF-8 文本中的起止位置。
- **Document Revision (文档修订版本)**：每次保存或编辑事务自增的单调递增整数，用于乐观锁校验与冲突检测。
- **Preview Revision (预览就绪版本)**：当前已成功渲染并展示在预览 iframe 中的文档修订版本。
- **Controlled Writeback (受控回写)**：前端向后端发起包含 `(revision, nodeId, field, value)` 的 Patch 请求，后端定位源码区间并执行局部安全文本替换的过程。
- **Thin Adapter (薄适配器)**：上层 Agent Skill 中用于组装 CLI 命令并解析 JSON 结果的轻量胶水脚本，不包含渲染与编辑核心逻辑。
