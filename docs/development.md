# 本地开发与测试指南 (Development Guide)

## 1. 环境准备

- **Python**: 3.11 或 3.12 (推荐使用 conda 环境，如 `py312`)
- **Node.js**: 18+ 与 pnpm / npm

## 2. 后端开发模式

```bash
# 激活环境
conda activate py312

# 安装本地可编辑依赖
pip install -e .

# 启动 CLI 调试
jc-slide-studio doctor
```

## 3. 前端工作台开发模式

```bash
cd web
npm ci
npm run dev
```

在项目根目录运行 `md-slide-studio edit tests/fixtures/steps.md --no-browser`。Vite 的 `http://localhost:3000/` 会将文档、预览和 WebSocket 请求代理到 `http://127.0.0.1:8000`。

## 4. 构建与发布

```bash
# 1. 构建前端静态资源
cd web
npm install
npm run build
# 构建产物将自动输出至 src/md_slide_studio/web_dist/

# 2. 构建 Python 独立分发包（含已构建的前端资源）
cd ..
python -m build
```

前端产物 `src/md_slide_studio/web_dist/` 已被 Git 忽略，避免将哈希构建物提交到源码库。在发布 Python wheel 包时，Hatchling 会自动读取本地已构建的 `web_dist` 打包入分发物，使 pip 安装的最终用户免装 Node.js 即可运行工作台。

## 5. 浏览器回归测试

```bash
pip install -e ".[dev]"
python -m playwright install chromium
python -m pytest
```

测试会在空闲端口启动 FastAPI，并对示例稿件的临时副本进行编辑。
