# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Project Management MVP: single-board Kanban app with hardcoded-user login and an AI chat sidebar (Anthropic) that can read and edit the board via conversation. Full plan and per-part checklists/success criteria live in `docs/PLAN.md` — read it before starting new work. Business requirements, limitations, technical decisions, brand color scheme, and coding standards are in the root `AGENTS.md`; directory-specific implementation detail is in `backend/AGENTS.md`, `frontend/AGENTS.md`, and `scripts/AGENTS.md` — read the relevant one before working in that directory, they're kept up to date and are more detailed than this file.

Coding standards from `AGENTS.md` (apply everywhere): use latest library versions and idiomatic approaches; never over-engineer — no unnecessary defensive programming, no speculative features; be concise, no emojis anywhere; when debugging, find the root cause before fixing — don't guess.

## Architecture

**Single Docker container, two build stages, one runtime process.** The root `Dockerfile` builds the Next.js frontend as a static export (`frontend/`, `output: 'export'`) in a `node:22-slim` stage, then copies the exported HTML/JS into a `python:3.12-slim` stage where FastAPI serves it via `StaticFiles` at `/` *and* serves the JSON API from the same origin — no CORS, no separate frontend server at runtime. `docker-compose.yml` adds a named volume (`pm-data`) mounting to `backend/data` so the SQLite DB survives container restarts, and injects `.env` (`ANTHROPIC_API_KEY`, optional `CHAT_MODEL`). `scripts/start.sh` / `stop.sh` (and `.ps1` equivalents) wrap `docker compose`.

**Backend (`backend/app/`)** is plain FastAPI + raw `sqlite3` (no ORM) managed with `uv`:
- `auth.py` — hardcoded `user`/`password`, sessions are an in-memory `token -> username` dict (lost on restart; this is intentional for the MVP, not an oversight).
- `db.py` — schema + seed data, applied idempotently inside `get_connection()` on every call rather than a startup hook, so the DB is correctly initialized regardless of how the app is invoked (uvicorn, `TestClient` without lifespan, a script).
- `board.py` — the `/api/board` HTTP routes *and* the underlying DB-mutation functions (`rename_column_db`, `add_card_db`, `delete_card_db`, `move_card_db`). These functions are the single source of truth for board mutations — both the HTTP routes and `ai.py`'s operation-applier call them, so AI-driven edits and user-driven edits go through identical logic.
- `ai.py` — `/api/ai/ping` (connectivity check) and `/api/ai/chat`. Chat uses Anthropic tool-use (forced `tool_choice`) to get structured `{reply, operations[]}` output; a malformed response gets one retry then a clean 502. Conversation history is **client-owned and stateless on the server** — the frontend resends the growing array each request, nothing is persisted — matching the ephemeral in-memory sessions.

All non-auth routes depend on `get_current_username` (401 if unauthenticated) and verify the target row actually belongs to that user's board before mutating (404 otherwise).

**Frontend (`frontend/src/`)** is a client-rendered Next.js app (no SSR/API routes available — it's a static export):
- `components/AuthGate.tsx` gates everything on `GET /api/session`, rendering `LoginScreen` or `KanbanBoard`.
- `components/KanbanBoard.tsx` fetches the board on mount and treats the backend as the sole source of truth: every mutation calls the matching `lib/api.ts` function and replaces local state with the full board the backend returns — no optimistic updates, no client-side reducer.
- `components/ChatSidebar.tsx` sends `{message, history}` to `/api/ai/chat` and calls `onBoardUpdate(result.board)` on the response, so AI-driven edits refresh the UI immediately without a second round trip.
- Drag-and-drop (`@dnd-kit`) uses a custom `pointerWithin`-first collision strategy, not the default `closestCorners` — `closestCorners` compares rect corners rather than pointer position and misroutes drops onto empty columns (see the collision-detection comment in `KanbanBoard.tsx`).

**Dev-mode API proxying**: `next.config.ts`'s `rewrites()` proxies `/api/*` to `127.0.0.1:8000` only under `next dev` (no-op in the production export, which doesn't support rewrites — Next prints a harmless warning about this on every build).

## Commands

Backend (run from `backend/`):
```bash
uv sync                              # install deps
uv run uvicorn app.main:app --reload # dev server on :8000
uv run pytest                        # full suite
uv run pytest tests/test_board.py -v              # one file
uv run pytest tests/test_board.py::test_rename_column_persists  # one test
```

Frontend (run from `frontend/`):
```bash
npm install
npm run dev                # :3000, proxies /api to a backend you run separately
npm run build               # static export to out/ (no `next start` — see frontend/AGENTS.md)
npm run test:unit           # Vitest
npx vitest run src/components/KanbanBoard.test.tsx   # one file
npm run test:e2e            # Playwright; boots its own backend+frontend dev servers
npm run test:e2e:static     # Playwright against the real static export served by FastAPI
npx playwright test tests/kanban.spec.ts --config=playwright.static.config.ts  # one e2e file
npm run test:all            # unit + both e2e variants
npm run lint
```

Docker (run from repo root):
```bash
./scripts/start.sh   # docker compose up --build -d, prints http://localhost:8000
./scripts/stop.sh    # docker compose down
```

## Testing notes

- Both Playwright configs run with `workers: 1` and delete `backend/data/app.db` before starting their backend: the Kanban board is now real shared backend state for the single hardcoded user, so e2e specs mutate it in sequence rather than each getting an isolated copy. `reuseExistingServer: true` means that reset is skipped if a server is already up on that port (including the Docker container) — stop any other instance first for a deterministic run.
- Several backend tests (`test_ai.py`, part of `test_ai_chat.py`) and the frontend `ai-chat.spec.ts` e2e specs make **real calls to the Anthropic API** by design (per `docs/PLAN.md`'s acceptance of live smoke tests for narrowly-scoped AI connectivity checks). They need `ANTHROPIC_API_KEY` set and cost a few tokens per run; there's no mocked fallback for those specific cases. The rest of `test_ai_chat.py` mocks the Anthropic client (see `FakeClient` there).
- Backend tests get an isolated per-test SQLite file via the `isolated_db` autouse fixture in `tests/conftest.py`; use the `authed_client` fixture for anything behind a session.
