create table if not exists studio_users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  display_name  text,
  created_at    text not null
);

create table if not exists studio_sessions (
  token_hash text primary key,
  user_id    text not null references studio_users(id) on delete cascade,
  created_at text not null,
  expires_at text not null
);

create table if not exists studio_decks (
  id               bigserial primary key,
  owner_id         text not null references studio_users(id) on delete cascade,
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

create table if not exists studio_deck_revisions (
  id         bigserial primary key,
  deck_id    bigint not null references studio_decks(id) on delete cascade,
  owner_id   text not null,
  revision   integer not null,
  content    text not null,
  note       text,
  created_at text not null,
  unique (deck_id, revision)
);

create index if not exists idx_studio_decks_owner on studio_decks (owner_id, updated_at desc);
create index if not exists idx_studio_revisions_deck on studio_deck_revisions (deck_id, revision desc);
create index if not exists idx_studio_sessions_user on studio_sessions (user_id);

alter table studio_users enable row level security;
alter table studio_sessions enable row level security;
alter table studio_decks enable row level security;
alter table studio_deck_revisions enable row level security;
