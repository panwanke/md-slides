"""Account, deck store, versioning and isolation tests (library mode)."""

import pytest
from fastapi.testclient import TestClient

from md_slide_studio.server.app import app, state


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("JC_STUDIO_DB", str(tmp_path / "studio.db"))
    previous = state.source_path
    state.source_path = None  # `serve` mode: no local file bound
    try:
        with TestClient(app) as instance:
            yield instance
    finally:
        state.source_path = previous


def signup(instance: TestClient, email: str, password: str = "password123") -> dict:
    response = instance.post(
        "/api/auth/signup", json={"email": email, "password": password}
    )
    assert response.status_code == 201, response.text
    return response.json()["user"]


def test_signup_login_logout_roundtrip(client):
    assert client.get("/api/auth/me").status_code == 401

    user = signup(client, "reader@example.com")
    assert user["email"] == "reader@example.com"
    assert "password" not in user and "password_hash" not in user
    assert client.get("/api/auth/me").json()["user"]["email"] == user["email"]

    assert client.post("/api/auth/logout").json()["ok"] is True
    assert client.get("/api/auth/me").status_code == 401

    assert client.post("/api/auth/login", json={
        "email": "reader@example.com", "password": "password123",
    }).status_code == 200
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/login", json={
        "email": "reader@example.com", "password": "wrong-password",
    }).status_code == 401


def test_signup_validation(client):
    assert client.post("/api/auth/signup", json={
        "email": "not-an-email", "password": "password123",
    }).status_code == 400
    assert client.post("/api/auth/signup", json={
        "email": "short@example.com", "password": "123",
    }).status_code == 400
    signup(client, "duplicate@example.com")
    assert client.post("/api/auth/signup", json={
        "email": "duplicate@example.com", "password": "password123",
    }).status_code == 400


def test_deck_crud_save_and_readback(client):
    signup(client, "owner@example.com")
    initial_decks = client.get("/api/decks").json()["decks"]
    assert len(initial_decks) == 1
    assert "演示全景" in initial_decks[0]["title"]
    starter_id = initial_decks[0]["id"]

    created = client.post("/api/decks", json={"title": "组会汇报"}).json()["deck"]
    deck_id = created["id"]
    assert created["revision"] == 1
    assert created["slideCount"] >= 1

    listed = client.get("/api/decks").json()["decks"]
    assert [item["id"] for item in listed] == [deck_id, starter_id]

    loaded = client.get(f"/api/decks/{deck_id}").json()
    assert loaded["source"] == "组会汇报"
    assert loaded["revision"] == 1
    assert loaded["ast"]["slides"]

    content = "# 第一页\n\n内容 A\n\n---\n\n# 第二页\n\n内容 B\n"
    saved = client.put(f"/api/decks/{deck_id}", json={
        "content": content, "baseRevision": loaded["revision"],
    })
    assert saved.status_code == 200
    assert saved.json()["revision"] == 2

    reloaded = client.get(f"/api/decks/{deck_id}").json()
    assert reloaded["content"] == content  # written data reads back
    assert reloaded["revision"] == 2
    assert reloaded["ast"]["documentRevision"] == 2

    revisions = client.get(f"/api/decks/{deck_id}/revisions").json()["revisions"]
    assert [item["revision"] for item in revisions] == [2, 1]

    renamed = client.patch(f"/api/decks/{deck_id}", json={"title": "组会汇报 v2"})
    assert renamed.json()["deck"]["title"] == "组会汇报 v2"

    assert client.delete(f"/api/decks/{deck_id}").json()["ok"] is True
    assert [item["id"] for item in client.get("/api/decks").json()["decks"]] == [starter_id]


def test_optimistic_lock_rejects_stale_write(client):
    signup(client, "lock@example.com")
    deck_id = client.post("/api/decks", json={"title": "并发测试"}).json()["deck"]["id"]

    first = client.put(f"/api/decks/{deck_id}", json={
        "content": "# 写入一", "baseRevision": 1,
    })
    assert first.json()["revision"] == 2

    stale = client.put(f"/api/decks/{deck_id}", json={
        "content": "# 写入二", "baseRevision": 1,
    })
    assert stale.status_code == 409
    assert "更新" in stale.json()["detail"]
    # The stale content must not have landed.
    assert client.get(f"/api/decks/{deck_id}").json()["content"] == "# 写入一"


def test_owner_isolation(client):
    signup(client, "alice@example.com")
    deck_id = client.post("/api/decks", json={"title": "Alice 私有稿"}).json()["deck"]["id"]

    other = TestClient(app)
    signup(other, "bob@example.com")
    bob_decks = other.get("/api/decks").json()["decks"]
    assert len(bob_decks) == 1
    assert deck_id not in [item["id"] for item in bob_decks]
    assert other.get(f"/api/decks/{deck_id}").status_code == 404
    assert other.put(f"/api/decks/{deck_id}", json={
        "content": "# 越权", "baseRevision": 1,
    }).status_code == 404
    assert other.delete(f"/api/decks/{deck_id}").status_code == 404
    assert client.get(f"/api/decks/{deck_id}").status_code == 200


def test_import_local_markdown(client):
    signup(client, "import@example.com")
    response = client.post("/api/decks/import", json={"files": [
        {"name": "talk-a.md", "content": "# A\n\n正文 A\n"},
        {"name": "talk-b.md", "content": "# B\n\n正文 B\n"},
    ]})
    assert response.status_code == 201
    assert response.json()["count"] == 2

    decks = client.get("/api/decks").json()["decks"]
    titles = {item["title"] for item in decks}
    assert {"talk-a", "talk-b"}.issubset(titles)
    assert any("演示全景" in t for t in titles)
    target = next(item for item in decks if item["title"] == "talk-a")
    stored = client.get(f"/api/decks/{target['id']}").json()
    assert "正文" in stored["content"]


def test_preview_renders_stored_deck(client):
    signup(client, "preview@example.com")
    deck_id = client.post("/api/decks", json={
        "title": "预览", "content": "# 云端内容标记\n\n正文\n",
    }).json()["deck"]["id"]

    response = client.get(f"/api/decks/{deck_id}/preview")
    assert response.status_code == 200
    assert "云端内容标记" in response.text
    assert "data-jc-studio-click-map" in response.text
    assert "data-jc-studio-live" not in response.text  # embedded preview needs no WS


def test_library_mode_has_no_bound_local_file(client):
    assert client.get("/api/doctor").json()["source"] is None


def test_templates_api(client):
    signup(client, "tpl@example.com")
    res = client.get("/api/templates")
    assert res.status_code == 200
    templates = res.json()["templates"]
    keys = [t["id"] for t in templates]
    assert "academic" in keys
    assert "showcase" in keys

    res = client.post("/api/decks", json={"title": "学术汇报", "template": "academic"})
    assert res.status_code == 201
    deck = client.get(f"/api/decks/{res.json()['deck']['id']}").json()
    assert "学术" in deck["content"] or "JOURNAL CLUB" in deck["content"]


def test_deck_assets_upload_list_and_delete(client):
    signup(client, "assets@example.com")
    deck_id = client.post("/api/decks", json={"title": "带图演示稿"}).json()["deck"]["id"]

    assert client.get(f"/api/decks/{deck_id}/assets").json()["assets"] == []

    files = [
        ("files", ("figure1.png", b"\x89PNG\r\n\x1a\nfake-data", "image/png")),
        ("files", ("images/subfig.jpg", b"\xff\xd8\xfffake-jpeg", "image/jpeg")),
    ]
    upload_res = client.post(f"/api/decks/{deck_id}/assets", files=files)
    assert upload_res.status_code == 200
    saved = [item["path"] for item in upload_res.json()["saved"]]
    assert len(saved) == 2
    assert "figure1.png" in saved
    assert "images/subfig.jpg" in saved

    assets = client.get(f"/api/decks/{deck_id}/assets").json()["assets"]
    asset_paths = [a["path"] for a in assets]
    assert "figure1.png" in asset_paths
    assert "images/subfig.jpg" in asset_paths

    get_res = client.get(f"/api/decks/{deck_id}/assets/figure1.png")
    assert get_res.status_code == 200
    assert get_res.content == b"\x89PNG\r\n\x1a\nfake-data"

    preview_res = client.get(f"/api/decks/{deck_id}/preview")
    assert preview_res.status_code == 200
    assert f'<base href="/api/decks/{deck_id}/assets/">' in preview_res.text

    bad_upload = client.post(
        f"/api/decks/{deck_id}/assets",
        files=[("files", ("../evil.png", b"bad", "image/png"))],
    )
    assert bad_upload.status_code == 400

    del_res = client.delete(f"/api/decks/{deck_id}/assets/figure1.png")
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True
    remaining = [a["path"] for a in client.get(f"/api/decks/{deck_id}/assets").json()["assets"]]
    assert "figure1.png" not in remaining
    assert "images/subfig.jpg" in remaining


def test_folder_assets_resolve_from_markdown_directory(client):
    signup(client, "folder-assets@example.com")
    deck_id = client.post("/api/decks", json={
        "title": "Nested deck", "content": "# Images\n\n![Shared](<../shared/图 %231.svg>)\n",
    }).json()["deck"]["id"]
    endpoint = f"/api/decks/{deck_id}/assets"
    image = b'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'
    uploaded = client.post(
        endpoint,
        data={"documentPath": "talks/talk.md"},
        files=[("files", ("shared/图 #1.svg", image, "image/svg+xml"))],
    )
    assert uploaded.status_code == 200
    asset = uploaded.json()["saved"][0]
    assert asset["path"] == "../shared/图 #1.svg"
    assert client.get(asset["url"]).content == image
    assert client.get(f"/api/decks/{deck_id}").json()["assetBase"] == f"{endpoint}/talks/"
    preview = client.get(f"/api/decks/{deck_id}/preview")
    assert f'<base href="{endpoint}/talks/">' in preview.text
    assert 'src="../shared/图 %231.svg"' in preview.text

    direct = client.post(endpoint, files=[("files", ("local.svg", image, "image/svg+xml"))])
    assert direct.json()["saved"][0]["path"] == "local.svg"
    assert client.get(f"{endpoint}/talks/local.svg").content == image
