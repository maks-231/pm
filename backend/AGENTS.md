# Backend

FastAPI backend, managed with `uv`. Serves the built Next.js frontend as
static files, a hardcoded-credentials login flow, plus one example API
route; board/AI routes land in later plan parts — see `docs/PLAN.md`.

## Structure

- `pyproject.toml` / `uv.lock` — dependencies (`fastapi`, `uvicorn[standard]`
  runtime; `pytest`, `httpx` dev)
- `app/main.py` — FastAPI app: `GET /api/hello`, auth routes (see below), and
  a `StaticFiles` mount at `/` serving `static/`
- `app/auth.py` — session logic: hardcoded `user`/`password` check, an
  in-memory `token -> username` store, and the `get_current_username`
  dependency used to guard routes
- `static/` — **generated**, gitignored (only `.gitkeep` is tracked so the
  directory always exists). Populated by `scripts/build-frontend.sh` or the
  Docker build's frontend stage, never edited by hand. Empty on a fresh
  checkout until one of those runs — `/` will 404 until then.
- `tests/test_hello.py` — pytest + `TestClient` covering `/api/hello` and
  that `/` serves the built frontend's `index.html`. The second test
  requires `scripts/build-frontend.sh` to have run first.
- `tests/test_auth.py` — login (success/failure), logout, session checks,
  and that sessions are isolated per client/cookie.

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

- No database, auth, or AI routes yet (Parts 4-9).
