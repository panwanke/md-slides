"""Built-in showcase deck and starter templates for md-slide-studio."""

from __future__ import annotations
from pathlib import Path
from typing import Dict

SHOWCASE_TITLE = "Markdown ⇄ HTML 演示全景"

_showcase_path = Path(__file__).with_name("showcase.md")
if not _showcase_path.is_file():
    _showcase_path = Path(__file__).resolve().parents[3] / "demo" / "showcase.md"
SHOWCASE_CONTENT = _showcase_path.read_text(encoding="utf-8")

TEMPLATES: Dict[str, Dict[str, str]] = {
    "showcase": {
        "title": "官方功能全景演示",
        "description": "包含双栏图文、LaTeX 公式、Pele 图表、分步动画与分节导览的完整范例",
        "content": SHOWCASE_CONTENT,
    },
    "academic": {
        "title": "学术组会与论文汇报",
        "description": "研究背景、理论模型、实验结果与研讨展望的标准化结构",
        "content": """---
md_slide:
  title: "学术研究与课题汇报"
  title_zh: "核心机制解析与实证结果讨论"
  theme: academic-paper
  lang: zh
---

<!-- slides:start -->
<!-- slide: layout=cover -->

---
<!-- slide: layout=toc | section=研究背景 -->
# 汇报大纲

1. 研究背景与核心问题
2. 实验范式与模型设计
3. 数据结果与统计检验
4. 讨论与后续工作

---
<!-- slide: layout=two-col -->
# 研究背景与痛点问题

- 现有方法在长序列任务下的表现退化
- 计算开销与参数效率难以兼顾
- 缺乏微观层面的可解释性验证

+++

::: box 核心假设与切入点
通过引入动态稀疏路由机制，在保持表征容量的同时，将计算复杂度显著降低。
:::

---
<!-- slide: layout=bullets | section=模型与实验 -->
# 核心方法与架构

- **多尺度特征对齐**：统一时序与离散语义空间的表征度量
- **自适应置信度门控**：根据先验不确定性动态调节权重
- **轻量化逆向解耦**：保障特征因果依赖不变

---
<!-- slide: layout=end -->
# 谢谢指导与交流

欢迎提出宝贵意见与建议。
""",
    },
    "pitch": {
        "title": "产品方案与商业 Pitch",
        "description": "聚焦用户痛点、产品价值、核心优势与落地路线图",
        "content": """---
md_slide:
  title: "新一代智能协作产品"
  kicker: "PRODUCT PITCH DECK"
  theme: minimal-white
  lang: zh
---

<!-- slides:start -->
<!-- slide: layout=cover -->

---
<!-- slide: layout=two-col -->
# 用户痛点与市场机遇

- 传统幻灯片排版耗时、协同版本混乱
- 导出与跨平台演示排版频频错位
- 缺乏对代码、数学公式与技术文档的原生支持

+++

::: box 我们的解决方案
让专业创作者只专注于 Markdown 思考与书写，排版与交互交给编译引擎全自动生成。
:::

---
<!-- slide: layout=bullets -->
# 核心竞争壁垒

- **单文件脱网自包含**：离线可用，开箱即播
- **36 套出版级主题**：一键切换风格，自动适应投影
- **开发者无缝流**：Git 纳管、CLI 命令、代码高亮原生支持

---
<!-- slide: layout=end -->
# 开启全新创作体验
""",
    },
    "blank": {
        "title": "空白演示稿",
        "description": "干净的初始画布，包含标准封面与内容页",
        "content": """---
md_slide:
  title: "未命名演示稿"
  theme: academic-paper
  lang: zh
---

<!-- slides:start -->
<!-- slide: layout=cover -->

---
<!-- slide: layout=normal -->
# 欢迎使用 Slide Studio

在这里开始书写您的幻灯片内容。

- 支持 Markdown 基础语法
- 支持使用 `---` 划分幻灯片
- 支持使用 `+++` 划分左右双栏
""",
    },
}
