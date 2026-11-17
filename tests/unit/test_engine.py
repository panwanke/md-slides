import pytest
from pathlib import Path

from md_slide_studio.render.engine import inline, render_deck


def test_inline_formatting_composes_with_existing_markdown():
    source = '***==<span style="color:#B33E38">Signal</span>==*** ~~draft~~ ``a`b``'
    assert inline(source) == (
        '<strong><em><mark><span style="color:#B33E38">Signal</span></mark></em></strong>'
        ' <del>draft</del> <code>a`b</code>'
    )


def test_inline_color_only_accepts_hex_and_preserves_literal_content():
    assert inline('<span style="color:red" onclick="fn()">text</span>') == (
        '&lt;span style="color:red" onclick="fn()"&gt;text&lt;/span&gt;'
    )
    assert inline('`==draft==` and $a==b==c$') == '<code>==draft==</code> and $a==b==c$'


def test_inline_editor_formats_are_rendered():
    assert inline('***both*** ~~removed~~') == '<strong><em>both</em></strong> <del>removed</del>'
    style = '<span style="color:#dc2626;background-color:#fef08a">**text**</span>'
    assert inline(style) == style.replace('**text**', '<strong>text</strong>')
    assert inline('<span style="background-color:#fef08a">text</span>') == (
        '<span style="color:#252d33;background-color:#fef08a">text</span>'
    )
    assert '<span' not in inline('<span style="color:red" onclick="bad()">text</span>')
    assert '<span' not in inline('`<span style="color:#dc2626">text</span>`')


def test_render_deck_unbundled():
    fixture = Path("tests/fixtures/workbench-e2e.md")
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
