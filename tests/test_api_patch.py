import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from md_slide_studio.server.app import app, state


@pytest.fixture
def client_with_doc(tmp_path: Path):
    doc_path = tmp_path / "patch_test.md"
    doc_path.write_text("""---
theme: academic-warm
---

# Slide 1

Initial body

---
## Slide 2 Heading

::: notes
Initial speaker notes
:::
""", encoding="utf-8")

    state.source_path = doc_path
    state.revision = 1
    return TestClient(app)


def test_api_patch_node_heading(client_with_doc):
    res = client_with_doc.post(
        "/api/patch",
        json={"node_id": "slide-2-heading", "value": "Patched Heading 2"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["revision"] == 2
    assert "## Patched Heading 2" in data["content"]
    assert "Slide 2 Heading" not in data["content"]


def test_api_patch_node_notes(client_with_doc):
    res = client_with_doc.post(
        "/api/patch",
        json={"node_id": "slide-2-notes", "value": "Updated speaker notes content"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "Updated speaker notes content" in data["content"]


def test_api_patch_range(client_with_doc):
    # Get current document content
    doc_res = client_with_doc.get("/api/document")
    content = doc_res.json()["content"]
    idx = content.find("Initial body")
    assert idx != -1

    res = client_with_doc.post(
        "/api/patch",
        json={
            "start_offset": idx,
            "end_offset": idx + len("Initial body"),
            "replacement": "Replaced body content",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "Replaced body content" in data["content"]
