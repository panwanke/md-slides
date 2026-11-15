"""Smoke-check the CloudBase PG backend from a developer machine.

Run with CLOUDBASE_ENV_ID / CLOUDBASE_API_KEY exported; no source changes are
needed. This exercises the same SQL that CloudRun executes in production.
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from jc_slide_studio.studio import service_pg as store  # noqa: E402


def main() -> None:
    os.environ["JC_STUDIO_BACKEND"] = "cloudbase_pg"
    email = f"pg-verify-{uuid.uuid4().hex[:8]}@example.com"

    user = store.create_user(email, "Test1234!", "PG Verify")
    print("create_user      ->", user["id"], user["email"])

    token = store.create_session(user["id"])
    print("resolve_session  ->", store.resolve_session(token)["email"])

    deck = store.create_deck(user["id"], "PG 验证", "# Hello PG\n\n---\n\n## 第二页")
    print("create_deck      ->", deck)

    decks = store.list_decks(user["id"])
    print("list_decks       ->", len(decks), decks[0]["title"])

    content = store.get_deck_content(user["id"], deck["id"])
    print("get_deck_content ->", repr(content[1][:24]))

    saved = store.save_deck(user["id"], deck["id"], "# Updated\n\n内容", 1)
    print("save_deck        ->", "revision", saved["revision"], "slides", saved["slideCount"])

    revisions = store.list_revisions(user["id"], deck["id"])
    print("list_revisions   ->", [(r["revision"], r["bytes"]) for r in revisions])

    try:
        store.save_deck(user["id"], deck["id"], "# stale\n", 1)
        print("optimistic lock  -> FAILED (no ConflictError)")
    except store.ConflictError:
        print("optimistic lock  -> OK (ConflictError raised)")

    renamed = store.rename_deck(user["id"], deck["id"], "已改名")
    print("rename_deck      ->", renamed["title"])

    print("soft_delete      ->", store.soft_delete_deck(user["id"], deck["id"]))
    print("list after delete->", store.list_decks(user["id"]))

    store.delete_session(token)
    print("after logout     ->", store.resolve_session(token))
    print("\nPG BACKEND OK")


if __name__ == "__main__":
    main()
