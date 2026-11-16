export interface CloudTemplate {
  content: string;
  title: string;
}

const head = (title: string, theme: string) => `---\nmd_slide:\n  title: "${title}"\n  theme: ${theme}\n  lang: zh\n---\n\n`;

export const CLOUD_TEMPLATES: Record<string, CloudTemplate> = {
  academic: {
    title: '学术研究与成果汇报',
    content: head('学术研究与成果汇报', 'academic-paper') + `# 研究背景

在这里说明问题来源与研究意义。

---

## 方法

- 设计
- 参与者
- 流程

---

## 结果

::: notes
在此放入逐字稿。
:::

---

## 讨论

总结贡献、局限与下一步。
`,
  },
  showcase: {
    title: '从极简书写到交互成片',
    content: head('从极简书写到交互成片', 'aurora') + `# Markdown 即演示稿

同一套引擎，从 CLI 到浏览器一致渲染。

---

## 双栏布局

::: box 核心
编辑与预览同步。
:::

---

## 分步动画

::: fragment step=1 effect=fade
第一处要点
:::
`,
  },
  pitch: {
    title: '新产品架构与商业提案',
    content: head('新产品架构与商业提案', 'pitch-deck-vc') + `# 解决方案

一句话说明产品价值。

---

## 用户痛点

- 痛点一
- 痛点二

---

## 商业模式

收入来源与增长路径。
`,
  },
  blank: {
    title: '未命名演示稿',
    content: head('未命名演示稿', 'minimal-white') + `# 新演示稿

在这里开始写作。

---

## 第二页
`,
  },
};

export function starterContent(template?: string): CloudTemplate {
  return CLOUD_TEMPLATES[template || ''] ?? CLOUD_TEMPLATES.blank;
}
