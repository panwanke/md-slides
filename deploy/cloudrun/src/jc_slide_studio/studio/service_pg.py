"""CloudBase PostgreSQL implementation of the deck-library store.

The public API mirrors :mod:`jc_slide_studio.studio.service` exactly, so the
HTTP layer only has to switch which module it imports. Local development keeps
using SQLite and its 37 tests untouched; enable this backend in the container
with ``JC_STUDIO_BACKEND=cloudbase_pg``.

The CloudBase SQL endpoint accepts one prepared statement per request, so every
multi-step mutation is written as a single statement with data-modifying CTEs.
That keeps deck + revision writes atomic without a cross-request transaction.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from jc_slide_studio.studio import pg_client
from jc_slide_studio.studio.db import now
from jc_slide_studio.studio.pg_client import PgError
from jc_slide_studio.studio.security import (
    hash_password,
    new_session_token,
    token_hash,
    valid_email,
    verify_password,
)
from jc_slide_studio.studio.service import (
    ConflictError,
    SESSION_LIFETIME_DAYS,
    STARTER_CONTENT,
    StudioError,
    _count_slides,
    _public_deck,
    _public_user,
)


def _one(sql: str, params: Tuple[Any, ...]) -> Optional[Dict[str, Any]]:
    rows = pg_client.query(sql, params)
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


def create_user(email: str, password: str, display_name: str | None = None) -> Dict[str, Any]:
    email = email.strip().lower()
    if not valid_email(email):
        raise ValueError("邮箱格式不正确")
    if len(password) < 8:
        raise ValueError("密码至少 8 位")

    row = _one(
        "insert into studio_users (id, email, password_hash, display_name, created_at) "
        "values ($1,$2,$3,$4,$5) on conflict (email) do nothing returning *",
        (uuid.uuid4().hex, email, hash_password(password), display_name, now()),
    )
    if row is None:
        raise ValueError("该邮箱已注册")
    return _public_user(row)


def authenticate(email: str, password: str) -> Optional[Dict[str, Any]]:
    row = _one("select * from studio_users where email = $1", (email.strip().lower(),))
    if not row or not verify_password(password, row["password_hash"]):
        return None
    return _public_user(row)


def create_session(user_id: str) -> str:
    token, digest = new_session_token()
    issued = datetime.now(timezone.utc)
    pg_client.query(
        "insert into studio_sessions (token_hash, user_id, created_at, expires_at) "
        "values ($1,$2,$3,$4)",
        (digest, user_id, issued.isoformat(timespec="seconds"),
         (issued + timedelta(days=SESSION_LIFETIME_DAYS)).isoformat(timespec="seconds")),
    )
    return token


def resolve_session(token: str | None) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    digest = token_hash(token)
    row = _one(
        "select u.*, s.expires_at from studio_sessions s "
        "join studio_users u on u.id = s.user_id where s.token_hash = $1",
        (digest,),
    )
    if not row:
        return None
    if row["expires_at"] < now():
        pg_client.query("delete from studio_sessions where token_hash = $1", (digest,))
        return None
    return _public_user(row)


def delete_session(token: str | None) -> None:
    if not token:
        return
    pg_client.query(
        "delete from studio_sessions where token_hash = $1", (token_hash(token),)
    )


# ---------------------------------------------------------------------------
# Decks
# ---------------------------------------------------------------------------


def list_decks(owner_id: str) -> List[Dict[str, Any]]:
    rows = pg_client.query(
        "select * from studio_decks where owner_id = $1 and deleted_at is null "
        "order by updated_at desc, id desc",
        (owner_id,),
    )
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
    row = _one(
        "with new_deck as ("
        " insert into studio_decks "
        " (owner_id, title, slug, theme, slide_count, current_revision, "
        "  content_hash, created_at, updated_at) "
        " values ($1,$2,$3,$4,$5,1,$6,$7,$7) returning *"
        "), revision as ("
        " insert into studio_deck_revisions "
        " (deck_id, owner_id, revision, content, note, created_at) "
        " select id, $1, 1, $8, $9, $7 from new_deck returning deck_id"
        ") select * from new_deck",
        (owner_id, title, slug, theme, _count_slides(content),
         hashlib.sha256(content.encode("utf-8")).hexdigest(), timestamp, content, note),
    )
    if row is None:
        raise StudioError("创建演示稿失败")
    return _public_deck(row)


def get_deck(owner_id: str, deck_id: int) -> Optional[Dict[str, Any]]:
    return _one(
        "select * from studio_decks where id = $1 and owner_id = $2 and deleted_at is null",
        (deck_id, owner_id),
    )


def get_deck_content(owner_id: str, deck_id: int) -> Optional[Tuple[Dict[str, Any], str]]:
    row = _one(
        "select d.*, r.content as content from studio_decks d "
        "left join studio_deck_revisions r "
        " on r.deck_id = d.id and r.revision = d.current_revision "
        "where d.id = $1 and d.owner_id = $2 and d.deleted_at is null",
        (deck_id, owner_id),
    )
    if not row:
        return None
    return _public_deck(row), row.get("content") or ""


def save_deck(
    owner_id: str,
    deck_id: int,
    content: str,
    base_revision: int,
    note: str | None = None,
) -> Dict[str, Any]:
    """Store a full-content snapshot under an optimistic lock, atomically."""
    current = _one(
        "select current_revision from studio_decks "
        "where id = $1 and owner_id = $2 and deleted_at is null",
        (deck_id, owner_id),
    )
    if not current:
        return {}
    if current["current_revision"] != base_revision:
        raise ConflictError("文档已被其他窗口更新，请刷新后重试")

    timestamp = now()
    next_revision = base_revision + 1
    try:
        row = _one(
            "with target as ("
            " select id from studio_decks where id = $1 and owner_id = $2 "
            "   and deleted_at is null and current_revision = $3 for update"
            "), revision as ("
            " insert into studio_deck_revisions "
            " (deck_id, owner_id, revision, content, note, created_at) "
            " select id, $2, $4, $5, $6, $7 from target returning deck_id"
            "), updated as ("
            " update studio_decks d "
            " set current_revision = $4, content_hash = $8, slide_count = $9, updated_at = $7 "
            " from target t, revision r "
            " where d.id = t.id and d.id = r.deck_id and d.current_revision = $3 "
            " returning d.*"
            ") select * from updated",
            (deck_id, owner_id, base_revision, next_revision, content, note, timestamp,
             hashlib.sha256(content.encode("utf-8")).hexdigest(), _count_slides(content)),
        )
    except PgError as error:
        if error.code == "DATABASE_23505":
            raise ConflictError("文档已被其他窗口更新，请刷新后重试") from error
        raise
    if row is None:
        raise ConflictError("文档已被其他窗口更新，请刷新后重试")
    return _public_deck(row)


def rename_deck(owner_id: str, deck_id: int, title: str) -> Dict[str, Any]:
    title = title.strip() or "未命名演示稿"
    row = _one(
        "update studio_decks set title = $1, updated_at = $2 "
        "where id = $3 and owner_id = $4 and deleted_at is null returning *",
        (title, now(), deck_id, owner_id),
    )
    return _public_deck(row) if row else {}


def soft_delete_deck(owner_id: str, deck_id: int) -> bool:
    rows = pg_client.query(
        "update studio_decks set deleted_at = $1 "
        "where id = $2 and owner_id = $3 and deleted_at is null returning id",
        (now(), deck_id, owner_id),
    )
    return len(rows) == 1


def list_revisions(owner_id: str, deck_id: int) -> List[Dict[str, Any]]:
    if not get_deck(owner_id, deck_id):
        return []
    rows = pg_client.query(
        "select revision, note, created_at, length(content) as bytes "
        "from studio_deck_revisions where deck_id = $1 and owner_id = $2 "
        "order by revision desc limit 50",
        (deck_id, owner_id),
    )
    return [
        {"revision": row["revision"], "note": row["note"],
         "createdAt": row["created_at"], "bytes": row["bytes"]}
        for row in rows
    ]


def import_decks(owner_id: str, files: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    created = []
    for item in files:
        name = (item.get("name") or "untitled.md").strip()
        content = item.get("content") or ""
        stem = name.rsplit(".", 1)[0] if "." in name else name
        created.append(create_deck(owner_id, stem or "未命名演示稿", content, note="导入本地文件"))
    return created
