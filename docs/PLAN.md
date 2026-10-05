# High level steps for project

Each part below is a checklist to be worked through and checked off in order.
A part is not "done" until its tests pass and its success criteria are met.
Do not start a part until the previous one is checked off, except Part 1
which governs the others.

Key decisions locked in during planning (see root `AGENTS.md` for the full,
authoritative list):

- AI calls use the **Anthropic API** (`ANTHROPIC_API_KEY` in `.env`,
  model `claude-haiku-4-5-20251001`, overridable via `CHAT_MODEL`) — not
  OpenRouter.
- The Next.js frontend is built as a **static export** (`output: 'export'`)
  and served by FastAPI via `StaticFiles`. There is no Node process at
  runtime.
- Database is SQLite, file created on first run if missing.
- Everything ships in a single Docker container; `uv` manages the Python
  environment.

---

## Part 1: Plan

**Goal:** Turn the one-line brief into a checklist-driven plan the user has
reviewed, and document the existing frontend code.

- [x] Enrich this document with substeps, tests, and success criteria for
      every part
- [x] Create `frontend/AGENTS.md` describing the existing frontend code
- [x] Update root `AGENTS.md` to reflect the Anthropic-API and static-export
      decisions
- [x] User reviews and approves this plan before Part 2 starts

**Tests:** none (planning only).

**Success criteria:** user has explicitly approved this document.

---

## Part 2: Scaffolding

**Goal:** A Docker container that runs a FastAPI backend serving a static
"hello world" HTML page at `/`, plus one example API route, plus working
start/stop scripts.

- [x] Create `backend/` as a `uv`-managed Python project (`pyproject.toml`,
      `uv.lock`), FastAPI + uvicorn as dependencies
- [x] `backend/app/main.py` with:
  - [x] `GET /api/hello` returning a small JSON payload
  - [x] `StaticFiles` mount at `/` serving a placeholder static HTML page
        that calls `GET /api/hello` on load and renders the response
- [x] `Dockerfile` at the project root: multi-stage, final stage runs
      `uv run uvicorn` against the backend, exposes a single port
- [x] `docker-compose.yml` (or equivalent) to build and run the container
      locally, mounting `.env`
- [x] `scripts/start.sh`, `scripts/stop.sh` (Linux/Mac) and
      `scripts/start.ps1`, `scripts/stop.ps1` (Windows) that build/run and
      stop the Docker container
- [x] Update `scripts/AGENTS.md` and `backend/AGENTS.md` to describe what
      was actually built

**Tests:**
- `backend/tests/test_hello.py` (pytest + `httpx`/`TestClient`): asserts
  `GET /api/hello` returns 200 and the expected JSON shape
- Manual: `scripts/start.sh` brings the container up, `curl localhost:<port>/`
  returns the hello-world HTML, `scripts/stop.sh` tears it down cleanly

**Success criteria:**
- `docker build` succeeds from a clean checkout
- Start script boots the container and the hello-world page loads in a
  browser, including the live API call result
- Stop script cleanly stops/removes the container
- `pytest` passes inside the backend environment

---

## Part 3: Add in Frontend

**Goal:** The real Kanban demo (from `frontend/`) is built statically and
served by FastAPI at `/`, replacing the Part 2 placeholder page.

- [x] Add `output: 'export'` to `frontend/next.config.ts` (and any
      `images.unoptimized: true` / basePath changes required for a static
      export to work)
- [x] Add a build step (Dockerfile stage or script) that runs
      `npm ci && npm run build` in `frontend/` and copies the exported
      `out/` directory into the backend's static directory
- [x] Update `backend/app/main.py` to serve the exported frontend instead of
      the Part 2 placeholder
- [x] Remove/retire the Part 2 placeholder static page
- [x] Keep `frontend/`'s existing Vitest unit tests passing as-is
- [x] Add/extend Playwright e2e config (or a backend-side smoke test) so the
      Kanban board is verified against the **built and served** static
      output, not just `next dev`

**Tests:**
- `npm run test:unit` (Vitest) — existing kanban logic + component tests,
  unchanged, must pass
- `npm run test:e2e` (Playwright) — existing load / add-card / drag-card
  specs, pointed at the FastAPI-served static build instead of (or in
  addition to) `next dev`
- Backend: a test asserting `GET /` returns the exported `index.html` with
  the expected `<title>` content

**Success criteria:**
- `docker build` + start script serves the real Kanban board at `/`
- All existing frontend unit and e2e tests pass against the static build
- No Node process is required at container runtime (static files only)

---

## Part 4: Add in a fake user sign in experience

**Goal:** Visiting `/` requires login (`user` / `password`); logged-in state
gates the Kanban; logout returns to the login screen.

- [x] Add a login screen to the frontend (new route or conditional render at
      `/`) with username/password fields
- [x] Client-side session handling appropriate for a static export (e.g. a
      cookie or token set via a backend login endpoint, checked on load)
- [x] `POST /api/login` on the backend validating the hardcoded
      `user`/`password`, issuing a session cookie/token
- [x] `POST /api/logout` clearing the session
- [x] A way for the backend to verify the session on protected API calls
      (used later in Parts 6-10)
- [x] Logout control visible once logged in, returns user to the login
      screen and clears client state
- [x] Wrong credentials show an inline error, do not crash the app

**Tests:**
- Backend (pytest): `POST /api/login` with correct/incorrect credentials,
  `POST /api/logout`, and that a protected example route rejects
  unauthenticated requests
- Frontend (Vitest): login form validation/error states
- E2E (Playwright): full flow — load `/` unauthenticated → see login, not
  Kanban → log in with correct creds → see Kanban → log out → back to login;
  also wrong-credentials path shows an error and does not reveal the board

**Success criteria:**
- Kanban board is never reachable without a successful login
- Login persists across a page reload (session survives refresh)
- Logout fully clears access until logging in again
- All Part 2-3 tests still pass

---

## Part 5: Database modeling

**Goal:** A reviewed, documented schema for users and their Kanban board,
saved as JSON, with user sign-off before implementation.

- [x] Propose a schema covering: users (id, username, password placeholder),
      one board per user, columns (ordered, renameable), cards (id, title,
      details, column, order)
- [x] Save the schema as JSON (e.g. `docs/schema.json`) — table/column
      definitions, types, keys, relationships
- [x] Write `docs/DATABASE.md` explaining the approach: why SQLite, file
      location/creation-on-first-run behavior, how the single-MVP-user
      limitation maps onto a multi-user-capable schema, migration strategy
      (if any) for future changes
- [x] Present schema + doc to the user and get explicit sign-off

**Tests:** none (design artifact only — no code yet).

**Success criteria:** user has explicitly approved `docs/schema.json` and
`docs/DATABASE.md` before Part 6 starts.

---

## Part 6: Backend

**Goal:** API routes to read and mutate a logged-in user's Kanban board,
backed by the Part 5 schema, with the SQLite DB auto-created on first run.

- [x] Add a DB layer (e.g. SQLModel or SQLAlchemy + a migration tool, or
      plain `sqlite3` if kept simple per the "no over-engineering" standard)
      implementing the Part 5 schema
- [x] On backend startup, create the SQLite file and tables if they don't
      exist; seed the hardcoded MVP user
- [x] `GET /api/board` — returns the logged-in user's board (columns + cards)
- [x] `PUT /api/board` (or finer-grained routes: rename column, move card,
      add card, delete card — pick one approach and apply consistently)
- [x] All board routes require a valid session from Part 4
- [x] Input validation (e.g. Pydantic models) for request bodies

**Tests (pytest, backend only — no frontend involved):**
- DB file is created fresh on first run; tables match the Part 5 schema
- `GET /api/board` returns 401/403 when not logged in
- `GET /api/board` returns the seeded board when logged in
- Each mutation route: happy path persists correctly (re-fetch confirms),
  and invalid input (bad IDs, missing fields) returns a clean 4xx, not a
  500
- Concurrent-safe enough for single-user local use (no need for
  multi-process locking given the MVP scope)

**Success criteria:** full backend test suite green; manually confirmed via
`curl`/HTTP client that board state round-trips correctly through the API.

---

## Part 7: Frontend + Backend

**Goal:** The Kanban board in the browser is backed by the real API from
Part 6 — changes persist across reloads and logins.

- [x] Replace the frontend's in-memory `initialData` (`src/lib/kanban.ts`)
      with a fetch from `GET /api/board` on load
- [x] Wire rename-column, add-card, delete-card, and move-card (drag/drop)
      handlers in `KanbanBoard.tsx` to call the Part 6 API routes instead of
      only updating local state
- [x] Handle loading and error states (board fetch fails, mutation fails)
- [x] Confirm the static-export frontend can call the FastAPI backend from
      the same origin (no CORS issues) in the Docker setup

**Tests:**
- Frontend (Vitest): component tests updated to mock the API client and
  verify handlers call the right endpoints with the right payloads
- Backend (pytest): unchanged from Part 6, still green
- E2E (Playwright): log in, add/move/rename/delete cards, **reload the
  page**, and confirm the board reflects the changes (proves persistence,
  not just local state); log out and back in and confirm the same board
  reappears

**Success criteria:** every Kanban interaction persists through a full page
reload; no console errors; full test suite (unit + e2e + backend) green.

---

## Part 8: AI connectivity

**Goal:** The backend can call the Anthropic API and this is verified with a
trivial end-to-end request.

- [x] Add an Anthropic SDK dependency to the backend
- [x] Read `ANTHROPIC_API_KEY` and `CHAT_MODEL` (default
      `claude-haiku-4-5-20251001`) from `.env`
- [x] `POST /api/ai/ping` (or similar internal/test-only route) that sends a
      fixed prompt like "What is 2+2? Answer with only the number." and
      returns the model's reply
- [x] Fail clearly (clean error, not a crash) if the API key is missing

**Tests (pytest):**
- With a valid key (live call, acceptable for this narrowly-scoped
  connectivity check): the ping route returns a response containing "4"
- Missing/invalid key: route returns a clean error, not an unhandled
  exception

**Success criteria:** a real call to the Anthropic API succeeds and returns
the expected answer; this is demonstrated to the user (e.g. via `curl` or a
test run), confirming the key and model work end-to-end.

---

## Part 9: AI with Kanban context and structured output

**Goal:** The backend's AI route always sends the board state, the user's
question, and conversation history, and gets back structured output: a chat
reply plus an optional board update.

- [x] Define a structured output schema for the Anthropic response: a reply
      message (string) and an optional board mutation payload (reusing/
      extending the Part 5/6 board shape — e.g. a list of operations like
      rename-column, add-card, move-card, delete-card)
- [x] `POST /api/ai/chat` accepting `{ message, history }`, loading the
      logged-in user's current board, and calling Anthropic with: system
      prompt describing the assistant's role and the board schema, the
      current board JSON, the conversation history, and the new message
- [x] Parse and validate the structured response (e.g. Pydantic model
      matching the Anthropic structured-output schema); reject/retry on
      malformed output rather than silently failing
- [x] If the response includes a board update, apply it via the Part 6 DB
      layer and return the updated board alongside the chat reply
- [x] Persist conversation history per user (in DB or in-memory per session —
      decide based on MVP scope; document the choice)

**Tests (pytest, can mock the Anthropic call for deterministic cases plus at
least one live smoke test):**
- Given a board and a question with no intended mutation ("what's in my
  Backlog column?"), response includes a sensible reply and no board change
- Given a request like "add a card 'Test AI card' to Backlog", the board is
  actually mutated in the DB and the response reflects it
- Malformed/unexpected model output is handled gracefully (no 500s)
- History is included in multi-turn follow-up requests and influences the
  reply (e.g. a follow-up "undo that" style test if in scope, otherwise a
  simpler context-carries-over check)

**Success criteria:** `/api/ai/chat` reliably returns structured output,
correctly distinguishes "just answer" from "answer and update the board,"
and board updates are persisted and consistent with Part 6's data model.

---

## Part 10: AI chat sidebar in the UI

**Goal:** A sidebar chat widget in the frontend using Part 9's API, with the
Kanban board auto-refreshing when the AI updates it.

- [x] Sidebar component: message list, input box, send button, matching the
      existing color scheme and visual style (Tailwind, brand colors from
      `globals.css`)
- [x] Sends `{ message, history }` to `POST /api/ai/chat`, appends the
      reply to the visible conversation, maintains history client-side (or
      fetches it, depending on the Part 9 persistence decision)
- [x] Loading/error states while waiting on the AI response
- [x] When the API response includes a board update, re-fetch
      `GET /api/board` (or apply the returned board directly) so the Kanban
      view updates without a manual page reload
- [x] Sidebar is collapsible/toggleable and doesn't obstruct the board on
      smaller viewports

**Tests:**
- Frontend (Vitest): sidebar renders, sends messages, renders replies,
  handles loading/error states (mocked API client)
- E2E (Playwright): ask the AI to add/move a card via the sidebar, confirm
  the Kanban board updates live without a manual reload; ask a
  non-mutating question and confirm the board is unchanged
- Backend: unchanged from Part 9, still green

**Success criteria:** a user can carry on a chat in the sidebar, the AI can
modify the board autonomously based on the conversation, and the board
reflects those changes immediately in the UI. Full project test suite
(backend pytest, frontend Vitest, Playwright e2e) green end to end.

---

# Phase 2: Multi-user, multi-board expansion

Parts 11-16 below grow the MVP (Parts 1-10) into a more comprehensive PM
app: real self-service accounts, multiple boards per user, richer cards,
comments, search/filter, and a matching AI tool-schema extension. Full
design rationale and the trade-offs baked into this phase are in
`/home/maks/.claude/plans/drifting-wondering-heron.md` (the approved plan);
this section is the checklist/success-criteria summary in the same format
as Phase 1.

---

## Part 11: Real multi-user auth (signup + password hashing)

**Goal:** Self-service signup with real password hashing. The hardcoded
in-memory credential check in `main.py`'s `login` is retired in favor of a
DB lookup; `user`/`password` keeps working as one ordinary seeded account.
Still exactly one board per user — independently shippable before Part 12.

- [ ] Add `argon2-cffi` to `backend/pyproject.toml`
- [ ] `backend/app/auth.py`: `hash_password`/`verify_password` wrapping
      `argon2.PasswordHasher`
- [ ] `backend/app/db.py`: `_seed()` hashes the seeded password with
      `hash_password` instead of raw SHA-256
- [ ] `POST /api/signup` (username/password validation, 409 on duplicate,
      creates user + one default board, creates session)
- [ ] Rewrite `POST /api/login` to check the DB via `verify_password`
      instead of the hardcoded constants
- [ ] Frontend: `api.signup`, `LoginScreen` gains a login/signup mode toggle

**Tests:**
- Backend: signup success, duplicate username 409, short password 422,
  login against a fresh signup, seeded `user` account still logs in
- Frontend: signup toggle/submit/duplicate-username error path (Vitest)
- E2E: sign up → empty board → logout → login → same board

**Success criteria:** new user signs up and reaches an empty board; logout/
login round-trips; `user`/`password` still works; no plaintext/unsalted
hash written anywhere; full suite green.

---

## Part 12: Multi-board plumbing (schema, routing, board CRUD, switcher UI)

**Goal:** Users can have more than one board; every board route is
explicitly board-scoped; a board picker/switcher exists in the UI.

- [ ] `db.py`: guard-function migration dropping `boards.user_id UNIQUE` and
      adding `boards.name`
- [ ] Update `docs/schema.json` and `docs/DATABASE.md` for the new column,
      the dropped constraint, and the migration approach
- [ ] `board.py`: replace `board_id_for`/`get_board_id` with
      `user_owns_board`/`require_board`; board CRUD DB functions
      (`list_boards_db`, `create_board_db`, `rename_board_db`,
      `delete_board_db`)
- [ ] Routes move under `/api/boards`, including board list/create/rename/
      delete and `GET /api/boards/{board_id}` replacing `GET /api/board`
- [ ] `ai.py`: `POST /api/boards/{board_id}/ai/chat` replacing
      `POST /api/ai/chat`
- [ ] Frontend: `api.ts` functions gain a leading `boardId`; new
      `BoardSwitcher.tsx`; board-selection wrapper (extends `AuthGate.tsx`
      or a new `BoardShell.tsx`) picks/remembers the active board
      (`localStorage`); `KanbanBoard`/`ChatSidebar` take a `boardId` prop

**Tests:**
- Backend: board list/create/rename/delete, cross-user 404 isolation,
  deleting the last board leaves an empty list; existing board/AI tests
  updated for the new URLs and `boardId` plumbing
- Frontend: `BoardSwitcher.test.tsx`; existing component tests updated for
  the new `boardId` argument on every mocked `api.*` call
- E2E: create a second board, switch, confirm isolation, delete one,
  confirm fallback

**Success criteria:** create/rename/delete/switch boards; board data fully
isolated per board and per user (cross-user 404 proven); AI chat only
touches the currently open board; full suite green.

---

## Part 13: Card metadata (due date, labels, assignee) + detail panel

**Goal:** Cards carry a due date, assignee text, and reusable board-scoped
labels; a detail panel edits all of it plus title/details (not editable
today).

- [ ] `db.py`: additive `cards.due_date`/`cards.assignee_text` columns, new
      `labels`/`card_labels` tables
- [ ] `board.py`: `Card` model extended; `update_card_db`, `set_labels_db`,
      `list_labels_db`; routes for card update, set-labels, list-labels
- [ ] Frontend: `Card` type extended; new `CardDetailPanel.tsx` (editable
      title/details, due date, assignee, label chip editor); `KanbanCard.tsx`
      gets an "open details" button and inline badges

**Tests:**
- Backend: per-field update, clear-via-empty-string, label reuse + color
  cycling, cross-board 404s
- Frontend: `CardDetailPanel.test.tsx`, `KanbanCard.test.tsx` badge updates
- E2E: set due date/assignee/labels, reload, confirm persistence

**Success criteria:** every metadata field round-trips through a reload;
labels are reused (not duplicated) per board; title/details are editable
post-creation.

---

## Part 14: Comments

**Goal:** A per-card comment thread, author-attributed and timestamped.

- [ ] `db.py`: additive `comments` table
- [ ] `board.py`: `Card.commentCount`, `add_comment_db`, `list_comments_db`,
      comment routes
- [ ] Frontend: `api.listComments`/`addComment`; comment thread section in
      `CardDetailPanel.tsx`

**Tests:**
- Backend: add/list, author attribution, cross-board 404, empty-body
  validation
- Frontend: `CardDetailPanel.test.tsx` extended
- E2E: add a comment, reopen, confirm persisted

**Success criteria:** comments persist, are attributed to the real
logged-in user, and are isolated per card/board.

---

## Part 15: Search/filter bar (client-side only)

**Goal:** Filter the currently open board by text, label, assignee, and due
date — no backend change.

- [ ] `kanban.ts`: `FilterState` type and pure `filterBoard` function
- [ ] New `FilterBar.tsx` wired into `KanbanBoard.tsx`'s header; filtering
      affects only what's displayed, never the real board state used for
      mutations

**Tests:**
- `filterBoard` unit tests (each filter, combinations, empty passthrough)
- Frontend: `FilterBar.test.tsx`, `KanbanBoard.test.tsx` extended to confirm
  filtering never affects mutation payloads

**Success criteria:** filtering is instant, no network call, never mutates
server state, and filters compose with AND.

---

## Part 16: AI tool-schema extension for metadata ops

**Goal:** The AI can set due date, labels, and assignee on cards within the
currently open board — and only that; comments and board CRUD remain
human-only.

- [ ] `ai.py`: `SYSTEM_PROMPT` and `RESPOND_TOOL` schema extended with
      `set_due_date`/`set_labels`/`set_assignee`; `Operation` model and
      `_apply_operation` updated to match

**Tests:**
- Backend: `test_ai_chat.py` extended with fixture payloads per new op type
  and a combined-ops case; existing live smoke test unchanged

**Success criteria:** the AI can set due date/labels/assignee via chat,
changes persist and appear in the returned board; the AI never attempts a
comment or board-CRUD operation; full project test suite (backend pytest,
frontend Vitest, Playwright e2e) green end to end.
