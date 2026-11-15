# 通信协议与接口规范 (Protocol Spec)

## 1. CLI 接口与 JSON 返回格式

所有 CLI 命令均支持 `--json` 参数，将诊断与执行结果以结构化 JSON 输出到 stdout（日志输出到 stderr）。

### 1.1 `doctor`
```bash
jc-slide-studio doctor --json
```
响应：
```json
{
  "protocolVersion": 1,
  "ok": true,
  "version": "0.1.0",
  "markdownSpecVersion": "1.0",
  "providers": {
    "themes": ["default", "academic", "dark"],
    "player": "ready"
  }
}
```

### 1.2 `check`
```bash
jc-slide-studio check <source.md> --json
```
响应：
```json
{
  "protocolVersion": 1,
  "ok": true,
  "source": "E:/.../deck.md",
  "slideCount": 35,
  "diagnostics": []
}
```

### 1.3 `render`
```bash
jc-slide-studio render <source.md> --out <directory> --json
```
响应：
```json
{
  "protocolVersion": 1,
  "ok": true,
  "source": "E:/.../deck.md",
  "output": "E:/.../deck_rendered.html",
  "slideCount": 35,
  "diagnostics": []
}
```

## 2. WebSocket 实时编辑协议

### 2.1 客户端 -> 服务端
- `{"type": "EDIT_PATCH", "revision": 12, "patch": {"nodeId": "node-3", "field": "title", "value": "新标题"}}`
- `{"type": "FULL_SYNC", "revision": 12, "content": "..."}`
- `{"type": "FOCUS_SLIDE", "slideId": "s03"}`

### 2.2 服务端 -> 客户端
- `{"type": "SYNC_ACK", "revision": 13, "saved": true}`
- `{"type": "BUILD_STATE", "building": false, "previewRevision": 13, "htmlUrl": "/preview/live"}`
- `{"type": "CONFLICT_DETECTED", "diskRevision": "external", "message": "文件已被外部修改"}`
- `{"type": "FOCUS_SOURCE", "line": 45, "column": 1, "range": [1024, 1080]}`
