# Database

## Why SQLite

Matches `AGENTS.md`'s technical decision: the whole app runs in one local
Docker container, single process, no separate DB server to operate. SQLite
is a single file, needs no network service, and Python's standard library
can talk to it directly. For an MVP with one seeded user and one board,
there's no case for anything heavier.

## File location and creation

The database lives at `backend/data/app.db` (gitignored, like
`backend/static/`). On backend startup, if the file doesn't exist, the app:
1. Creates `backend/data/` if missing.
2. Creates the file and runs the schema from `docs/schema.json` against it
   (`CREATE TABLE IF NOT EXISTS ...` for each table).
3. Seeds the single MVP user (`user`, with a hash of `password`) and an
   empty board with the five default columns, if no rows exist yet.

This mirrors what `backend/static/` already does for the frontend build:
nothing to check in, nothing to manually initialize, works on a clean
checkout.

## Schema

See `docs/schema.json` for the full table-by-table definition. Summary:

- **users** — one row per person who can sign in. `password_hash` is a
  placeholder: Part 4's login still checks a hardcoded `user`/`password`
  pair in memory and doesn't read this table. It's here so that switching
  auth to be DB-backed later doesn't require a schema change.
- **boards** — one per user. A `UNIQUE` constraint on `boards.user_id`
  enforces the MVP's "one board per user" limitation at the DB level.
  Dropping that constraint is the entire migration needed for multi-board
  support later.
- **columns** — belong to a board, ordered by a `position` integer (instead
  of relying on row insertion order or an array, which SQL doesn't give
  you for free).
- **cards** — belong to a column, also ordered by `position`. Moving a card
  between columns is an `UPDATE` of its `column_id` and `position`.

IDs are app-generated `TEXT` strings (e.g. `col-<random>`, `card-<random>`),
not autoincrement integers, so they keep the frontend's existing `col-*` /
`card-*` convention (see `frontend/AGENTS.md`) all the way through the API —
no translation layer between DB ids and frontend ids.

## Multi-user design, single-user MVP

The schema already supports many users and would support many boards per
user with one constraint removed. The MVP intentionally restricts this:
- `AGENTS.md`: "there will only be a user sign in (hardcoded to 'user' and
  'password') but the database will support multiple users for future."
- `AGENTS.md`: "there will only be 1 Kanban board per signed in user."

Both limitations are enforced by the schema itself (`boards.user_id UNIQUE`)
or by the application layer (Part 4's hardcoded credential check), not by
anything that would need rearchitecting later — just loosened.

## Migrations

No migration tool for the MVP. There's one schema, created fresh via
`CREATE TABLE IF NOT EXISTS` on first run; if the schema changes during
development, the simplest fix is deleting `backend/data/app.db` and letting
it recreate (acceptable — it's local, disposable data, not production). If
the project grows past the MVP, revisit with a real migration tool
(e.g. Alembic) at that point rather than guessing at future needs now.
