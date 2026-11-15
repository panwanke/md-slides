"""Account, deck store, versioning and isolation tests (library mode)."""

import pytest
from fastapi.testclient import TestClient

from jc_slide_studio.server.app import app, state


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
    created = client.post("/api/decks", json={"title": "组会汇报"}).json()["deck"]
    deck_id = created["id"]
    assert created["revision"] == 1
    assert created["slideCount"] >= 1

    listed = client.get("/api/decks").json()["decks"]
    assert [item["id"] for item in listed] == [deck_id]

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
    assert client.get("/api/decks").json()["decks"] == []


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
    assert other.get("/api/decks").json()["decks"] == []
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
    assert {item["title"] for item in decks} == {"talk-a", "talk-b"}
    stored = client.get(f"/api/decks/{decks[0]['id']}").json()
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
