# Database

## Why SQLite

Matches `AGENTS.md`'s technical decision: the whole app runs in one local
Docker container, single process, no separate DB server to operate. SQLite
is a single file, needs no network service, and Python's standard library
can talk to it directly.

## File location and creation

The database lives at `backend/data/app.db` (gitignored, like
`backend/static/`). On every `get_connection()` call (not just startup), the
app:
1. Creates `backend/data/` if missing.
2. Runs the base schema (`CREATE TABLE IF NOT EXISTS ...` for each table).
3. Runs the idempotent schema migrations in `db.py`'s `_migrate_schema`
   (see "Migrations" below).
4. Seeds the hardcoded demo user (`user`, Argon2-hashed `password`) and its
   demo board, but only at the moment that user row is first created — not
   whenever it happens to have zero boards (deleting your last board must
   stay empty, not resurrect the demo data).

This mirrors what `backend/static/` already does for the frontend build:
nothing to check in, nothing to manually initialize, works on a clean
checkout.

## Schema

See `docs/schema.json` for the full table-by-table definition. Summary:

- **users** — one row per person who can sign in. `password_hash` is a
  real Argon2id hash (`argon2-cffi`), read by `/api/login` and written by
  `/api/signup` and the demo seed (Part 11).
- **boards** — belongs to a user; a user can have any number of boards
  (Part 12 dropped the original `UNIQUE` constraint on `user_id`). Has a
  user-editable `name`.
- **columns** — belong to a board, ordered by a `position` integer (instead
  of relying on row insertion order or an array, which SQL doesn't give
  you for free).
- **cards** — belong to a column, also ordered by `position`. Moving a card
  between columns is an `UPDATE` of its `column_id` and `position`. Part 13
  added nullable `due_date` and `assignee_text` (freeform text, not a
  `users` foreign key — boards aren't shared, so there's no cross-account
  picker).
- **labels** — board-scoped, reusable by name (Part 13); `card_labels` is
  the join table, replaced wholesale (delete-then-insert) on every label
  update rather than diffed.
- **comments** — per-card, author-attributed, timestamped (Part 14). No
  automatic activity log beyond this — comments are the only
  collaboration-trace feature in scope.

IDs are app-generated `TEXT` strings (e.g. `col-<random>`, `card-<random>`),
not autoincrement integers, so they keep the frontend's existing `col-*` /
`card-*` convention (see `frontend/AGENTS.md`) all the way through the API —
no translation layer between DB ids and frontend ids.

## Multi-user, multi-board

As of Part 11/12, both of the original MVP's restrictions have been lifted:
anyone can sign up for their own account, and any user can have any number
of boards, switchable via the board picker in the UI. Boards are still not
shared/collaborative — each board belongs to exactly one user, with no
concept of inviting other accounts (see `AGENTS.md`'s Limitations).

## Migrations

Still no migration tool (e.g. Alembic) — the project deliberately uses raw
`sqlite3`, no ORM, and Alembic wants a model layer this project doesn't
have. Instead, `db.py`'s `get_connection()` runs the original
`CREATE TABLE IF NOT EXISTS` schema and then a small set of named,
idempotent guard functions (`_migrate_schema`):
- `_add_column_if_missing(conn, table, column, column_def)` — checks
  `PRAGMA table_info` before `ALTER TABLE ... ADD COLUMN`. Used for
  additive changes (e.g. `boards.name`, `cards.due_date`,
  `cards.assignee_text`).
- `_drop_boards_user_id_unique(conn)` — checks `sqlite_master.sql` for the
  table still containing `UNIQUE`; if so, rebuilds `boards` without it in
  one `executescript`. Used for the one breaking change multi-board support
  needed.

This runs on every connection, same as the base schema, so it's safe
regardless of how the app is booted. Because real user data exists via
signup as of Part 11, "delete `backend/data/app.db` and let it recreate" is
no longer an acceptable migration strategy for schema changes — new changes
should follow the same guard-function pattern instead.
