import pytest
from jc_slide_studio.document.parser import (
    build_document_ast,
    apply_source_patch,
    apply_node_patch,
)


def test_roundtrip_crlf_and_cjk():
    # Markdown with CRLF, Chinese, and Emoji
    crlf_md = (
        "---\r\n"
        "theme: academic-warm\r\n"
        "---\r\n"
        "\r\n"
        "# 第一页：实验背景 🔬\r\n"
        "\r\n"
        "这是第一段中文说明，包含 Emoji 🎯。\r\n"
        "\r\n"
        "---\r\n"
        "<!-- slide: layout=two-col | section=核心假说 -->\r\n"
        "## 第二页：认知控制理论 🧠\r\n"
        "\r\n"
        "- 假说 1: 冲突调节机制\r\n"
        "  - 子条目 A: 反应时差异显著\r\n"
        "  - 子条目 B: 错误率下降\r\n"
        "- 假说 2: 漂移率变化\r\n"
        "\r\n"
        "::: notes\r\n"
        "这里是演讲者讲稿，向评审老师解释假设 1 的机制。\r\n"
        ":::\r\n"
    )

    ast = build_document_ast(crlf_md)
    assert ast["slideCount"] == 2
    assert len(ast["sections"]) == 2

    # 1. Modify heading of slide 2
    patched_md = apply_node_patch(crlf_md, "slide-2-heading", "第二页：更新后的理论假说 🚀")
    assert "## 第二页：更新后的理论假说 🚀" in patched_md
    # Verify everything before slide 2 heading is byte-for-byte identical
    heading_node = next(n for n in ast["slides"][1]["nodes"] if n["nodeType"] == "heading")
    start = heading_node["sourceRange"][0]
    assert patched_md[:start] == crlf_md[:start]

    # 2. Modify speaker notes
    patched_notes = apply_node_patch(crlf_md, "slide-2-notes", "更新后的精简讲稿内容。")
    assert "更新后的精简讲稿内容。" in patched_notes
    notes_node = next(n for n in ast["slides"][1]["nodes"] if n["nodeType"] == "notes")
    notes_start = notes_node["sourceRange"][0]
    assert patched_notes[:notes_start] == crlf_md[:notes_start]


def test_roundtrip_nested_containers_and_code():
    md = """---
theme: dark
---

# Code & Containers

```python
def solve(x):
    # Notice: do not touch code fences
    return x * 2
```

::: box
重点提示内容
:::

::: fragment effect=zoom
这是逐步浮现的内容
:::
"""
    ast = build_document_ast(md)
    slide1 = ast["slides"][0]
    box_node = next(n for n in slide1["nodes"] if n["nodeType"] == "box")
    frag_node = next(n for n in slide1["nodes"] if n["nodeType"] == "fragment")

    # Update box
    patched = apply_node_patch(md, box_node["nodeId"], "修改后的重要提示卡片！")
    assert "修改后的重要提示卡片！" in patched
    assert "def solve(x):" in patched

    # Update fragment
    patched_frag = apply_node_patch(md, frag_node["nodeId"], "修改后的动画内容！")
    assert "修改后的动画内容！" in patched_frag
    assert "effect=zoom" in patched_frag
