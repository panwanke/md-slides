import pytest
from pathlib import Path

from jc_slide_studio.document.check import check_slide_deck


def test_check_valid_fixture():
    fixture = Path("tests/fixtures/steps.md")
    result = check_slide_deck(fixture)
    assert result["ok"] is True
    assert result["slideCount"] == 4


def test_check_missing_file():
    result = check_slide_deck("tests/fixtures/nonexistent.md")
    assert result["ok"] is False
    assert len(result["diagnostics"]) > 0


def test_check_placeholders(tmp_path):
    p = tmp_path / "test.md"
    p.write_text("# Slide 1\nTODO: 补充图件\n---\n# Slide 2\n", encoding="utf-8")
    result = check_slide_deck(p)
    assert any("TODO" in d["message"] for d in result["diagnostics"])


def test_check_notes_diagnostics_and_strict_gate(tmp_path):
    p = tmp_path / "notes.md"
    p.write_text(
        "---\nlang: zh\n---\n"
        "# 第一页\n\n::: notes\n太短\n:::\n"
        "---\n<!-- slide: layout=section -->\n# 章节页\n",
        encoding="utf-8",
    )
    result = check_slide_deck(p)
    assert result["ok"] is True
    messages = [d["message"] for d in result["diagnostics"]]
    assert any("too short" in m for m in messages)
    assert any("no speaker notes" in m for m in messages)

    strict = check_slide_deck(p, strict=True)
    assert strict["ok"] is False
    errors = [d for d in strict["diagnostics"] if d["level"] == "error"]
    assert len(errors) == 1  # section 页缺讲稿只警告


def test_check_notes_english_word_count(tmp_path):
    p = tmp_path / "en.md"
    p.write_text(
        "---\nlang: en\n---\n# One\n\n::: notes\n" + "word " * 40 + "\n:::\n",
        encoding="utf-8",
    )
    result = check_slide_deck(p)
    assert any("too short" in d["message"] for d in result["diagnostics"])
