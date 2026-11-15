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
