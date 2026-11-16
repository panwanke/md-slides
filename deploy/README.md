# MD Slide Studio · 部署与托管说明

本项目支持两种服务化部署形态：
1. **GitHub Pages（客户端纯静态试用）**：通过 WebAssembly (Pyodide) 在浏览器端直接运行渲染引擎，零服务端存储与账号开销。
2. **WorkBuddy / 容器化自建部署（服务端持久化与账号体系）**：运行 `md-slide-studio serve`，提供用户注册、多用户幻灯片库、SQLite 数据持久化与独立成片放映。

> [!IMPORTANT]
> 本目录仅提供部署管线代码与容器化配置模板，**不执行任何外部线上环境的自动化发布命令**。

---

## 容器化构建与运行

### 1. 构建 Docker 镜像

在项目根目录下执行：

```bash
docker build -t md-slide-studio -f deploy/Dockerfile .
```

### 2. 使用 Docker Compose 一键启动

```bash
cd deploy
docker compose up -d
```

服务将监听宿主机 `http://localhost:9000`，数据库与图片资源挂载至命名卷 `md_slide_studio_data`（容器内 `/data`）。

---

## 环境变量配置

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `MD_STUDIO_DATA_DIR` | `~/.md-slide-studio`（容器内 `/data`） | 数据持久化根目录（存放 `studio.db` 及上传图片资产） |
| `MD_STUDIO_DB` | `$MD_STUDIO_DATA_DIR/studio.db` | 自定义 SQLite 数据库文件绝对路径 |
| `PORT` / `--port` | `9000` | HTTP 服务监听端口 |
| `HOST` / `--host` | `0.0.0.0` | 监听地址（反向代理或容器内建议 `0.0.0.0`） |

---

## 健康检查与运维接口

- 健康检查地址：`GET http://localhost:9000/api/doctor`
- 当通过 `md-slide-studio serve` 启动时，`source` 字段为 `null`，前端自动进入「账号登录 / 幻灯片库」模式。
- 当通过 `md-slide-studio edit <file.md>` 启动时，`source` 绑定该文件，前端自动进入「单文件工作台」模式。
