"""SQLite persistence for accounts, sessions and slide decks.

The database path is resolved on every connection, so the same code runs
unchanged on a laptop and behind a reverse proxy:

* default: ``~/.jc-slide-studio/studio.db``
* ``JC_STUDIO_DATA_DIR``: directory containing ``studio.db``
* ``JC_STUDIO_DB``: full path to the database file (takes precedence)
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

SCHEMA = """
create table if not exists users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  display_name  text,
  created_at    text not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at text not null,
  expires_at text not null
);

create table if not exists decks (
  id               integer primary key autoincrement,
  owner_id         text not null references users(id) on delete cascade,
  title            text not null,
  slug             text not null,
  theme            text,
  slide_count      integer not null default 0,
  current_revision integer not null default 1,
  content_hash     text,
  created_at       text not null,
  updated_at       text not null,
  deleted_at       text,
  unique (owner_id, slug)
);

create table if not exists deck_revisions (
  id         integer primary key autoincrement,
  deck_id    integer not null references decks(id) on delete cascade,
  owner_id   text not null,
  revision   integer not null,
  content    text not null,
  note       text,
  created_at text not null,
  unique (deck_id, revision)
);

create index if not exists idx_decks_owner on decks (owner_id, updated_at desc);
create index if not exists idx_revisions_deck on deck_revisions (deck_id, revision desc);
create index if not exists idx_sessions_user on sessions (user_id);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def data_dir() -> Path:
    override = os.environ.get("JC_STUDIO_DATA_DIR")
    path = Path(override).expanduser() if override else Path.home() / ".jc-slide-studio"
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    override = os.environ.get("JC_STUDIO_DB")
    return Path(override).expanduser().resolve() if override else data_dir() / "studio.db"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Open a connection, ensure the schema, commit on success, rollback on error.

    ``executescript`` runs the idempotent DDL before any work starts. Doing it
    here (rather than at import time) keeps tests free to point ``JC_STUDIO_DB``
    at a temporary file after the application has been imported.
    """
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("pragma journal_mode=WAL")
    conn.execute("pragma foreign_keys=ON")
    conn.executescript(SCHEMA)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
