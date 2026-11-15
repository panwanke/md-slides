---
jc:
  title: "单文件与分步动画演示"
  title_zh: "保存 MD 后，预览会自动更新"
  kicker: "功能示例"
  theme: academic-paper
  themes: "academic-paper,minimal-white"
  lang: zh
  footer: "jc-slides · 离线演示"
---

<!-- slides:start -->
<!-- slide: layout=cover -->

::: notes
此文件用于检查离线打开、切页、备注、主题和分步演示。
:::

---
<!-- slide: layout=two-col | transition=slide | reveal=items -->
# 按方向键逐条出现

- 第一条：单独一个 HTML 即可分享。
- 第二条：图片、样式和脚本都在文件里。
- 第三条：按左键可以逐步撤回。

::: notes
先按三次右键展开要点，再按一次进入下一页。
:::

---
<!-- slide: layout=bullets | transition=fade -->
# 图片与说明分步出现

::: fragment step=1 effect=fade-up
![示意图](steps.svg "第一步：显示图与图注")
:::

::: fragment step=2 effect=fade
::: box 解释
第二步：出现这张说明卡片。
:::
:::

::: fragment step=2 effect=none
与说明卡片同时出现的补充文字。
:::

::: notes
图和图注作为一个整体出现；两个第二步分组同时显示。
:::

---
<!-- slide: layout=end | transition=none -->
# Thank you
## 可以离线播放

- 快捷键 — F 全屏，S 演讲者窗口，N 备注，O 概览，T 主题

::: notes
本示例不依赖网络，PPTX 导出另行实现。
:::
