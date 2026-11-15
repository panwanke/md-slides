"""Account, deck and revision operations.

Every deck/revision query carries an ``owner_id`` constraint. Isolation is
enforced here, in the data layer, not by the front end.
"""

from __future__ import annotations

import hashlib
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from jc_slide_studio.studio.db import connect, now
from jc_slide_studio.studio.security import (
    hash_password,
    new_session_token,
    token_hash,
    valid_email,
    verify_password,
)

SESSION_LIFETIME_DAYS = 30
STARTER_CONTENT = "# 新演示稿\n\n在这里开始写作。\n"


class StudioError(Exception):
    """Base class for expected, user-facing failures."""


class ConflictError(StudioError):
    """The deck moved on since the client loaded it."""


def _count_slides(content: str) -> int:
    from jc_slide_studio.document.parser import (
        parse_front_matter,
        split_slides_with_ranges,
        strip_workspace,
    )

    try:
        _, body, _ = parse_front_matter(content)
        body, _ = strip_workspace(body)
        return len(split_slides_with_ranges(body))
    except (ValueError, TypeError):
        return 0


def _public_user(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "displayName": row["display_name"],
        "createdAt": row["created_at"],
    }


def _public_deck(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "slug": row["slug"],
        "theme": row["theme"],
        "slideCount": row["slide_count"],
        "revision": row["current_revision"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def create_user(email: str, password: str, display_name: str | None = None) -> Dict[str, Any]:
    email = email.strip().lower()
    if not valid_email(email):
        raise ValueError("邮箱格式不正确")
    if len(password) < 8:
        raise ValueError("密码至少 8 位")

    user_id = uuid.uuid4().hex
    try:
        with connect() as conn:
            conn.execute(
                "insert into users (id, email, password_hash, display_name, created_at) "
                "values (?, ?, ?, ?, ?)",
                (user_id, email, hash_password(password), display_name, now()),
            )
            row = conn.execute("select * from users where id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError as error:
        raise ValueError("该邮箱已注册") from error
    return _public_user(row)


def authenticate(email: str, password: str) -> Optional[Dict[str, Any]]:
    with connect() as conn:
        row = conn.execute(
            "select * from users where email = ?", (email.strip().lower(),)
        ).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return None
    return _public_user(row)


def create_session(user_id: str) -> str:
    token, digest = new_session_token()
    issued = datetime.now(timezone.utc)
    with connect() as conn:
        conn.execute(
            "insert into sessions (token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?)",
            (digest, user_id, issued.isoformat(timespec="seconds"),
             (issued + timedelta(days=SESSION_LIFETIME_DAYS)).isoformat(timespec="seconds")),
        )
    return token


def resolve_session(token: str | None) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    digest = token_hash(token)
    with connect() as conn:
        row = conn.execute(
            "select u.*, s.expires_at from sessions s "
            "join users u on u.id = s.user_id where s.token_hash = ?",
            (digest,),
        ).fetchone()
        if not row:
            return None
        if row["expires_at"] < now():
            conn.execute("delete from sessions where token_hash = ?", (digest,))
            return None
    return _public_user(row)


def delete_session(token: str | None) -> None:
    if not token:
        return
    with connect() as conn:
        conn.execute("delete from sessions where token_hash = ?", (token_hash(token),))


# ---------------------------------------------------------------------------
# Decks
# ---------------------------------------------------------------------------

def list_decks(owner_id: str) -> List[Dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "select * from decks where owner_id = ? and deleted_at is null "
            "order by updated_at desc, id desc",
            (owner_id,),
        ).fetchall()
    return [_public_deck(row) for row in rows]


def create_deck(
    owner_id: str,
    title: str,
    content: str = STARTER_CONTENT,
    theme: str | None = None,
    note: str | None = None,
) -> Dict[str, Any]:
    title = title.strip() or "未命名演示稿"
    slug = uuid.uuid4().hex[:12]
    timestamp = now()
    with connect() as conn:
        cursor = conn.execute(
            "insert into decks (owner_id, title, slug, theme, slide_count, current_revision, "
            "content_hash, created_at, updated_at) values (?, ?, ?, ?, ?, 1, ?, ?, ?)",
            (owner_id, title, slug, theme, _count_slides(content),
             hashlib.sha256(content.encode("utf-8")).hexdigest(), timestamp, timestamp),
        )
        deck_id = cursor.lastrowid
        conn.execute(
            "insert into deck_revisions (deck_id, owner_id, revision, content, note, created_at) "
            "values (?, ?, 1, ?, ?, ?)",
            (deck_id, owner_id, content, note, timestamp),
        )
        row = conn.execute("select * from decks where id = ?", (deck_id,)).fetchone()
    return _public_deck(row)


def get_deck(owner_id: str, deck_id: int) -> Optional[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            "select * from decks where id = ? and owner_id = ? and deleted_at is null",
            (deck_id, owner_id),
        ).fetchone()


def get_deck_content(owner_id: str, deck_id: int) -> Optional[Tuple[Dict[str, Any], str]]:
    deck = get_deck(owner_id, deck_id)
    if not deck:
        return None
    with connect() as conn:
        revision = conn.execute(
            "select content from deck_revisions where deck_id = ? and revision = ?",
            (deck_id, deck["current_revision"]),
        ).fetchone()
    content = revision["content"] if revision else ""
    return _public_deck(deck), content


def save_deck(
    owner_id: str,
    deck_id: int,
    content: str,
    base_revision: int,
    note: str | None = None,
) -> Dict[str, Any]:
    """Store a full-content snapshot under an optimistic lock.

    A full snapshot (rather than a diff) keeps restore and export to a single
    read. ``ConflictError`` means another writer advanced the revision first.
    """
    timestamp = now()
    next_revision = base_revision + 1
    with connect() as conn:
        deck = conn.execute(
            "select * from decks where id = ? and owner_id = ? and deleted_at is null",
            (deck_id, owner_id),
        ).fetchone()
        if not deck:
            return {}
        if deck["current_revision"] != base_revision:
            raise ConflictError("文档已被其他窗口更新，请刷新后重试")

        try:
            conn.execute(
                "insert into deck_revisions (deck_id, owner_id, revision, content, note, created_at) "
                "values (?, ?, ?, ?, ?, ?)",
                (deck_id, owner_id, next_revision, content, note, timestamp),
            )
        except sqlite3.IntegrityError as error:
            raise ConflictError("文档已被其他窗口更新，请刷新后重试") from error

        updated = conn.execute(
            "update decks set current_revision = ?, content_hash = ?, slide_count = ?, "
            "updated_at = ? where id = ? and owner_id = ? and current_revision = ?",
            (next_revision, hashlib.sha256(content.encode("utf-8")).hexdigest(),
             _count_slides(content), timestamp, deck_id, owner_id, base_revision),
        )
        if updated.rowcount != 1:
            raise ConflictError("文档已被其他窗口更新，请刷新后重试")
        row = conn.execute("select * from decks where id = ?", (deck_id,)).fetchone()
    return _public_deck(row)


def rename_deck(owner_id: str, deck_id: int, title: str) -> Dict[str, Any]:
    title = title.strip() or "未命名演示稿"
    with connect() as conn:
        updated = conn.execute(
            "update decks set title = ?, updated_at = ? "
            "where id = ? and owner_id = ? and deleted_at is null",
            (title, now(), deck_id, owner_id),
        )
        if updated.rowcount != 1:
            return {}
        row = conn.execute("select * from decks where id = ?", (deck_id,)).fetchone()
    return _public_deck(row)


def soft_delete_deck(owner_id: str, deck_id: int) -> bool:
    with connect() as conn:
        updated = conn.execute(
            "update decks set deleted_at = ? where id = ? and owner_id = ? and deleted_at is null",
            (now(), deck_id, owner_id),
        )
    return updated.rowcount == 1


def list_revisions(owner_id: str, deck_id: int) -> List[Dict[str, Any]]:
    if not get_deck(owner_id, deck_id):
        return []
    with connect() as conn:
        rows = conn.execute(
            "select revision, note, created_at, length(content) as bytes "
            "from deck_revisions where deck_id = ? and owner_id = ? "
            "order by revision desc limit 50",
            (deck_id, owner_id),
        ).fetchall()
    return [
        {"revision": row["revision"], "note": row["note"],
         "createdAt": row["created_at"], "bytes": row["bytes"]}
        for row in rows
    ]


def import_decks(owner_id: str, files: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Batch-import local .md files (the "cloud is the source of truth" path)."""
    created = []
    for item in files:
        name = (item.get("name") or "untitled.md").strip()
        content = item.get("content") or ""
        stem = name.rsplit(".", 1)[0] if "." in name else name
        created.append(create_deck(owner_id, stem or "未命名演示稿", content, note="导入本地文件"))
    return created
