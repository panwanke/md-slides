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
jc-slide-studio check <source.md> --json [--strict]
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

`--strict` 将「缺逐字稿」与「逐字稿字数越界」升级为 error（`ok=false`），用于 jc-slides 出片前的验收闸门；缺省仅为 warning。字数规则：中文 100–400 字符（去空白），英文 80–320 words；`layout=journal|section` 缺讲稿不阻断。任何 `ok=false` 时 `check` 返回退出码 1，`--json` 仍输出完整诊断。

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

## 3. 无状态渲染接口

`POST /api/render` 与 `/api/document`、`/preview/*` 的区别：**不依赖 `state.source_path`**，
Markdown 由请求体提供，服务端不读写任何文档文件。三种来源（本地文件、数据库行、远端载荷）
因此共用同一套渲染管线。

请求：

```json
{ "content": "# 标题\n\n---\n\n# 第二页", "theme": "dracula", "standalone": true }
```

成功响应（200）：

```json
{
  "ok": true,
  "html": "<!DOCTYPE html>...",
  "slideCount": 2,
  "title": "deck",
  "theme": "dracula"
}
```

Markdown 语法错误（422）：

```json
{ "detail": "Fragments require a positive step and effect=none|fade|fade-up" }
```

`standalone` 默认是 `false`。设为 `true` 时，响应内嵌动画和公式运行时以及公式字体。调用方根据当前工作文件夹或附件目录内嵌文档图片。

`POST /api/ast` 接受 `{"content": "..."}` 并返回 `{"ast": ...}`，用于本地服务工作台打开浏览器选中的 Markdown。

`GET /api/doctor` 额外返回 `statelessRender: true`，供客户端探测该能力。

Python 侧对应 `render.render_text(content, *, theme, extra_scripts, stem, standalone)`，
返回 `(html, info)`；`render_deck(path)` 只是「读文件 → `render_text` → 可选打包落盘」的薄封装，
两者生成的 HTML 逐字节一致（回归测试见 `tests/test_render_api.py`）。

## 4. 前端存储适配层

`web/src/store/types.ts` 定义 `DeckStore`：

```ts
interface DeckStore {
  load(): Promise<LoadedDeck>;
  save(content: string): Promise<SavedDeck>;
}
```

`EditorSession` 只依赖该接口，不再直接 `fetch('/api/document')`。
当前有两个实现：

| 实现 | 位置 | 数据来源 |
|---|---|---|
| `LocalFileStore` | `web/src/store/localFile.ts` | `GET/PUT /api/document`，单文件本地模式 |
| `RemoteDeckStore` | `web/src/store/remote.ts` | `GET/PUT /api/decks/{id}`，带 `baseRevision` 乐观锁 |

`App.tsx` 在构造 `EditorSession` 时显式传入实例；`Shell.tsx` 依据 `/api/doctor.source`
选择模式（有值 = 本地单文件，无值 = 登录 + 幻灯片库）。

## 5. 账号与幻灯片库接口（库模式）

会话为 HttpOnly Cookie `jc_studio_session`（30 天，SameSite=Lax，HTTPS 下自动 Secure）。
所有 deck 相关接口都带属主约束，前端不传 `owner_id`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/signup` | `{email, password, displayName?}`，密码 ≥ 8 位 |
| POST | `/api/auth/login` | `{email, password}` |
| POST | `/api/auth/logout` | 撤销会话 |
| GET | `/api/auth/me` | 当前用户；未登录 401 |
| GET | `/api/decks` | 当前用户的 deck 列表（不含正文） |
| POST | `/api/decks` | `{title, content?}`，同时写入 revision 1 |
| POST | `/api/decks/import` | `{files:[{name,content}]}`，一次最多 50 个本地 .md |
| GET | `/api/decks/{id}` | `source/fullPath/content/revision/ast`，另含图片相对路径的基准 URL `assetBase` |
| PUT | `/api/decks/{id}` | `{content, baseRevision}` → `revision + ast`；版本落后返回 409 |
| PATCH | `/api/decks/{id}` | `{title}` 重命名 |
| DELETE | `/api/decks/{id}` | 软删除 |
| GET | `/api/decks/{id}/revisions` | 最近 50 个版本元数据（不含正文） |
| GET | `/api/decks/{id}/preview` | 按会话取正文 → 渲染 HTML，供预览 iframe；`?embedded=0` 用于全屏演示 |
| GET | `/api/decks/{id}/assets` | 列出演示稿附件，包含相对 Markdown 的 `path` 和用于读取或删除的 `url` |
| POST | `/api/decks/{id}/assets` | 用 multipart 表单的 `files` 字段上传附件。导入文件夹时另外提交原 Markdown 在文件夹内的 `documentPath` |
| GET / DELETE | `/api/decks/{id}/assets/{assetPath}` | 按附件的 `url` 读取或删除 |

**写入协议**：每次保存写入一条完整 Markdown 快照（`deck_revisions`），
`decks.current_revision` 用 `WHERE current_revision = baseRevision` 做乐观锁。
落后写入返回 409，前端 `DeckConflictError` 会停止自动重试并把状态标为「版本冲突，请刷新页面」。

**数据文件**：默认 `~/.jc-slide-studio/studio.db`（SQLite，WAL）。
`JC_STUDIO_DB` 指定完整路径，`JC_STUDIO_DATA_DIR` 指定目录。密码用 PBKDF2-SHA256（20 万轮 + 随机盐），
数据库只存会话令牌的 SHA-256 摘要。

**尚未包含**：附件/图片的对象存储、分享链接、找回密码、多端实时协同。
这些不影响上述契约，可后续叠加。
