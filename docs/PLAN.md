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
- [ ] User reviews and approves this plan before Part 2 starts

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
- [ ] Present schema + doc to the user and get explicit sign-off

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

- [ ] Sidebar component: message list, input box, send button, matching the
      existing color scheme and visual style (Tailwind, brand colors from
      `globals.css`)
- [ ] Sends `{ message, history }` to `POST /api/ai/chat`, appends the
      reply to the visible conversation, maintains history client-side (or
      fetches it, depending on the Part 9 persistence decision)
- [ ] Loading/error states while waiting on the AI response
- [ ] When the API response includes a board update, re-fetch
      `GET /api/board` (or apply the returned board directly) so the Kanban
      view updates without a manual page reload
- [ ] Sidebar is collapsible/toggleable and doesn't obstruct the board on
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
