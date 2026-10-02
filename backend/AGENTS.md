# Backend

FastAPI backend, managed with `uv`. Serves the built Next.js frontend as
static files, a hardcoded-credentials login flow, a SQLite-backed Kanban
board API, and a connectivity-only Anthropic AI route; the full chat
feature lands in Part 9 — see `docs/PLAN.md`.

## Structure

- `pyproject.toml` / `uv.lock` — dependencies (`fastapi`, `uvicorn[standard]`,
  `anthropic`, `python-dotenv` runtime; `pytest`, `httpx` dev)
- `app/main.py` — FastAPI app: `GET /api/hello`, auth routes, includes the
  board and AI routers, loads `.env` (see Environment below), and a
  `StaticFiles` mount at `/` serving `static/`
- `app/auth.py` — session logic: hardcoded `user`/`password` check, an
  in-memory `token -> username` store, and the `get_current_username`
  dependency used to guard routes
- `app/db.py` — SQLite schema (`docs/schema.json`), seed data, and
  `get_connection()` (see Database below)
- `app/board.py` — `/api/board` routes: read and mutate the logged-in
  user's board
- `app/ai.py` — `POST /api/ai/ping`: a connectivity check against the
  Anthropic API (see AI below)
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
- `tests/test_ai.py` — login gating, clean 503 when `ANTHROPIC_API_KEY` is
  unset, and a **live call** to the real Anthropic API asserting the reply
  contains "4". See AI below.

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

## Environment

`app/main.py` calls `load_dotenv()` against the repo-root `.env` on import.
Docker doesn't need this (docker-compose's `env_file: .env` injects the
variables directly into the container), but local/test runs (`uv run
uvicorn`, `uv run pytest`) aren't going through Docker, so without this
call they'd never see `.env` at all.

- `ANTHROPIC_API_KEY` — required for `/api/ai/ping` to work; the route
  returns a clean 503 (not a crash) if it's missing.
- `CHAT_MODEL` — optional, defaults to `claude-haiku-4-5-20251001`
  (`app/ai.py`'s `DEFAULT_MODEL`).

## AI

- `POST /api/ai/ping` — session-protected (like every other non-auth
  route). Sends a fixed "What is 2+2?" prompt to the configured model and
  returns `{reply}`. This exists purely to prove the API key and model
  work end to end; it's not part of the real chat feature (Part 9).
- Errors from the Anthropic SDK (`anthropic.APIError` and subclasses —
  bad key, rate limit, network) are caught and surfaced as a 502, not an
  unhandled exception.
- `tests/test_ai.py`'s connectivity test makes a **real network call** to
  Anthropic on every `pytest` run (per `docs/PLAN.md` Part 8, which calls
  this acceptable for a narrowly-scoped check). It costs a few tokens and
  needs `ANTHROPIC_API_KEY` set; there's no mocked fallback.

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

- `/api/ai/ping` is connectivity-only; the real board-aware chat with
  structured output lands in Part 9.
