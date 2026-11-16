import pytest
from pathlib import Path

from md_slide_studio.render.engine import render_deck


def test_render_deck_unbundled():
    fixture = Path("tests/fixtures/steps.md")
    html_text, out = render_deck(fixture, bundle=False)
    assert "<!DOCTYPE html>" in html_text
    assert "JCDeck" in html_text
    assert "按方向键逐条出现" in html_text


def test_render_deck_bundled(tmp_path):
    fixture = Path("tests/fixtures/steps.md")
    html_text, out_file = render_deck(fixture, out_dir=tmp_path, bundle=True)
    assert out_file.is_file()
    assert out_file.stat().st_size > 10000
    content = out_file.read_text(encoding="utf-8")
    assert "data:image/svg+xml;base64," in content
    assert "<style>" in content
