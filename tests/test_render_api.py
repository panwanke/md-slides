"""Stateless rendering: engine equivalence and the /api/render contract."""

from pathlib import Path

from fastapi.testclient import TestClient

from md_slide_studio.render.engine import render_deck, render_text
from md_slide_studio.server.app import app, state

FIXTURE = Path(__file__).parent / "fixtures" / "steps.md"


def test_render_text_matches_render_deck_byte_for_byte():
    """Extracting the pipeline must not change the generated presentation."""
    content = FIXTURE.read_text(encoding="utf-8")
    from_file, _ = render_deck(FIXTURE, bundle=False)
    from_text, info = render_text(content, stem=FIXTURE.stem)

    assert from_file == from_text
    assert info["slideCount"] > 0
    assert info["title"]
    assert info["theme"]


def test_render_text_accepts_theme_override():
    content = FIXTURE.read_text(encoding="utf-8")
    _, info = render_text(content, theme="dracula")
    assert info["theme"] == "dracula"


def test_api_render_works_without_an_active_source_file():
    """The route is stateless: no `state.source_path`, no filesystem read."""
    previous = state.source_path
    state.source_path = None
    try:
        client = TestClient(app)
        response = client.post("/api/render", json={"content": "# Hello\n\n---\n\n# World"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is True
        assert payload["slideCount"] == 2
        assert "<section" in payload["html"]
        assert "jc-deck" in payload["html"]
    finally:
        state.source_path = previous


def test_api_render_returns_422_on_markdown_syntax_error():
    client = TestClient(app)
    response = client.post(
        "/api/render",
        json={"content": "::: fragment step=0 effect=fade\nbody\n:::"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]


def test_doctor_advertises_stateless_render():
    client = TestClient(app)
    assert client.get("/api/doctor").json()["statelessRender"] is True


def test_workbench_icon_endpoints_return_200():
    client = TestClient(app)
    svg_res = client.get("/icon.svg")
    assert svg_res.status_code == 200
    assert "image/svg+xml" in svg_res.headers.get("content-type", "")

    png_res = client.get("/icon-32.png")
    assert png_res.status_code == 200
    assert "image/png" in png_res.headers.get("content-type", "")

    ico_res = client.get("/favicon.ico")
    assert ico_res.status_code == 200
