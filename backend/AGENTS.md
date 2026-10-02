# Backend

FastAPI backend, managed with `uv`. Serves the built Next.js frontend as
static files, a hardcoded-credentials login flow, and a SQLite-backed
Kanban board API; AI routes land in later plan parts — see `docs/PLAN.md`.

## Structure

- `pyproject.toml` / `uv.lock` — dependencies (`fastapi`, `uvicorn[standard]`
  runtime; `pytest`, `httpx` dev)
- `app/main.py` — FastAPI app: `GET /api/hello`, auth routes, includes the
  board router, and a `StaticFiles` mount at `/` serving `static/`
- `app/auth.py` — session logic: hardcoded `user`/`password` check, an
  in-memory `token -> username` store, and the `get_current_username`
  dependency used to guard routes
- `app/db.py` — SQLite schema (`docs/schema.json`), seed data, and
  `get_connection()` (see Database below)
- `app/board.py` — `/api/board` routes: read and mutate the logged-in
  user's board
- `static/` — **generated**, gitignored (only `.gitkeep` is tracked so the
  directory always exists). Populated by `scripts/build-frontend.sh` or the
  Docker build's frontend stage, never edited by hand. Empty on a fresh
  checkout until one of those runs — `/` will 404 until then.
- `data/` — **generated**, gitignored. Holds `app.db` (SQLite), created on
  first use by `get_connection()`. Persisted across container restarts via
  the `pm-data` volume in `docker-compose.yml`.
- `tests/conftest.py` — `isolated_db` (autouse: points `db.DB_PATH` at a
  per-test temp file) and `authed_client` (a `TestClient` already logged in)
- `tests/test_hello.py` — pytest + `TestClient` covering `/api/hello` and
  that `/` serves the built frontend's `index.html`. The second test
  requires `scripts/build-frontend.sh` to have run first.
- `tests/test_auth.py` — login (success/failure), logout, session checks,
  and that sessions are isolated per client/cookie.
- `tests/test_board.py` — DB schema creation, seeded board shape, every
  mutation's happy path + persistence-on-refetch, ownership/404s for
  unknown ids, validation errors, and that every route requires login.

## Database

- SQLite, one file at `data/app.db`. Schema and rationale documented in
  `docs/schema.json` / `docs/DATABASE.md`.
- `get_connection()` creates the schema (`CREATE TABLE IF NOT EXISTS`) and
  seeds the hardcoded user + their default board on every call rather than
  via a FastAPI startup hook — it's cheap and idempotent, and this way the
  DB is correctly initialized no matter how the app is invoked (uvicorn,
  `TestClient(app)` without the lifespan context, a one-off script).
- IDs are app-generated `TEXT` (`col-*`, `card-*`), matching the frontend's
  existing id convention — no translation layer at the API boundary.
- Card/column ordering is a `position` integer column, not array order.
  Reordering writes new positions in two passes (stage at negative values,
  then assign final ones) to avoid tripping the `(column_id, position)`
  UNIQUE constraint against rows not yet moved out of the way.
- Every board route depends on `get_current_username` (401 if not logged
  in) and checks the target column/card actually belongs to that user's
  board before mutating it (404 otherwise) — relevant once the schema's
  multi-user support is ever exercised for real.

## Board API

- `GET /api/board` — the logged-in user's board: `{columns: [{id, title,
  cardIds}], cards: {id: {id, title, details}}}`, matching
  `frontend/src/lib/kanban.ts`'s `BoardData` shape exactly.
- `PATCH /api/board/columns/{id}` — `{title}`, rename.
- `POST /api/board/columns/{id}/cards` — `{title, details?}`, append a card.
- `DELETE /api/board/cards/{id}` — remove a card.
- `PATCH /api/board/cards/{id}/move` — `{column_id, index}`, move/reorder a
  card; works for both same-column reorder and cross-column moves.
- All five return the full updated `BoardResponse` (except `GET`, which
  only returns it) so the frontend can replace its whole board state after
  any mutation without a second round trip.

## Auth

- `POST /api/login` — body `{username, password}`; on success sets an
  httponly `session_token` cookie (`SameSite=Lax`) and returns
  `{username}`; 401 on bad credentials.
- `POST /api/logout` — clears the session (both server-side and the cookie).
- `GET /api/session` — 200 + `{username}` if the cookie maps to a live
  session, 401 otherwise. This is also the pattern later protected routes
  (board, AI) will follow: depend on `get_current_username`.
- Sessions are an in-memory dict on the FastAPI process — intentional for
  this MVP (single process, local Docker container); restarting the
  container logs everyone out. Revisit if the app ever runs multi-process.

## Commands

Run from `backend/`:

- `uv sync` — install dependencies into `.venv`
- `uv run uvicorn app.main:app --reload` — run the dev server on :8000
- `uv run pytest` — run the test suite
- `uv add <package>` / `uv add --dev <package>` — add a runtime/dev dependency

## Docker

The root `Dockerfile` is multi-stage:
1. `node:22-slim` stage runs `npm ci && npm run build` in `frontend/`
   (static export, see `frontend/next.config.ts`'s `output: 'export'`)
2. `python:3.12-slim` stage runs `uv sync --locked --no-dev`, copies in
   `app/`, and copies the exported `frontend/out` directly into `./static`
   from the first stage — `backend/static/` on disk is irrelevant to the
   image, it's rebuilt fresh every time.

The container's `CMD` calls `/app/.venv/bin/uvicorn` directly (not
`uv run uvicorn`) — `uv run` re-syncs the environment, including dev
dependencies, on every invocation, which would require network access at
container startup. Dev-only dependencies (pytest, httpx) never ship in the
image; run tests locally via `uv run pytest` instead of inside the
container.

## Notes for future work

- No AI routes yet (Parts 8-9).
