from pathlib import Path
from md_slide_studio.document.parser import (
    build_document_ast,
    update_slide_layout,
    apply_source_patch,
    apply_node_patch,
)
from md_slide_studio.render.engine import render_deck


def test_build_document_ast():
    md = """---
theme: academic-warm
---

# Title 1

Slide 1 content

---
<!-- slide: layout=two-col | section=实验设计 -->
## Title 2

Left content

+++

Right content
"""
    ast = build_document_ast(md)
    assert ast["frontmatter"]["theme"] == "academic-warm"
    assert ast["slideCount"] == 2

    slides = ast["slides"]
    assert slides[0]["index"] == 1
    assert slides[1]["index"] == 2
    assert slides[1]["layout"] == "two-col"
    assert slides[1]["metadata"]["section"] == "实验设计"

    sections = ast["sections"]
    assert len(sections) == 2
    assert sections[0]["title"] == "Title 1"
    assert sections[1]["title"] == "实验设计"


def test_update_slide_layout():
    md = "## Test Slide\n\nSome text"
    updated = update_slide_layout(md, "figure")
    assert "<!-- slide: layout=figure -->" in updated

    # Replace existing
    md2 = "<!-- slide: layout=bullets | section=Intro -->\n## Test 2"
    updated2 = update_slide_layout(md2, "two-col")
    assert "layout=two-col" in updated2
    assert "section=Intro" in updated2


def test_apply_source_patch():
    src = "Hello World"
    # replace World with Antigravity
    res = apply_source_patch(src, 6, 11, "Antigravity")
    assert res == "Hello Antigravity"


def test_apply_node_patch():
    src = """# Old Heading

Some text

::: notes
Old note text
:::
"""
    # 1. Update heading
    patched_heading = apply_node_patch(src, "slide-1-heading", "New Heading")
    assert "# New Heading" in patched_heading
    assert "Old Heading" not in patched_heading

    # 2. Update notes
    patched_notes = apply_node_patch(src, "slide-1-notes", "New note text")
    assert "New note text" in patched_notes
    assert "Old note text" not in patched_notes


def test_render_deck(tmp_path: Path):
    doc = tmp_path / "test.md"
    doc.write_text("""---
theme: academic-warm
title: Unit Test Deck
---

# Slide 1

Hello World
""", encoding="utf-8")

    html, out_file = render_deck(doc, bundle=False)
    assert "Unit Test Deck" in html
    assert "jc-deck" in html
    assert out_file is None
