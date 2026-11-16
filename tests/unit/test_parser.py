import pytest
from pathlib import Path

from md_slide_studio.document.parser import (
    parse_front_matter,
    strip_workspace,
    split_slides_with_ranges,
    parse_slide_meta,
    build_document_ast,
)


def test_parse_front_matter():
    text = "---\njc:\n  title: 'Test Deck'\n  theme: 'academic-paper'\n---\n# Slide 1"
    meta, rest, (start, end) = parse_front_matter(text)
    assert meta["jc"]["title"] == "Test Deck"
    assert meta["jc"]["theme"] == "academic-paper"
    assert rest.strip() == "# Slide 1"
    assert start == 0
    assert end > 0


def test_strip_workspace():
    text = "# TODO Section\n<!-- slides:start -->\n# Real Slide"
    rest, offset = strip_workspace(text)
    assert offset > 0
    assert rest.strip() == "# Real Slide"


def test_split_slides_with_ranges():
    text = "Slide 1\n---\nSlide 2\n---\nSlide 3"
    slides = split_slides_with_ranges(text)
    assert len(slides) == 3
    for s in slides:
        st, end = s["range"]
        assert text[st:end].strip() == s["raw"].strip()


def test_build_document_ast_fixture():
    fixture_path = Path("tests/fixtures/steps.md")
    assert fixture_path.is_file()
    text = fixture_path.read_text(encoding="utf-8")
    ast = build_document_ast(text, revision=1)
    assert ast["slideCount"] == 4
    assert ast["documentRevision"] == 1
    assert ast["slides"][0]["layout"] == "cover"
