# Code Review (OpenCode)

Date: 2026-10-04
Scope: full repository — `backend/` (all of `app/` and `tests/`), `frontend/`
(all of `src/`, e2e specs, configs), `scripts/`, `Dockerfile`,
`docker-compose.yml`, `.dockerignore`/`.gitignore`, and the docs set
(`PLAN.md`, `DATABASE.md`, `schema.json`, per-directory `AGENTS.md`).
This is an independent second review; `docs/code_review.md` (2026-10-03)
exists and its open items were re-verified rather than trusted (see
"Prior review re-checked" below).

Behavior was verified by running the tooling, not just reading code:

| Check | Result |
|---|---|
| `uv run pytest` (backend) | 32/32 passed, incl. the 2 live Anthropic calls |
| `npm run test:unit` (Vitest) | 19/19 passed |
| `npm run lint` (ESLint) | 0 errors, 1 warning (unused var in a test file) |
| `npx tsc --noEmit` (frontend) | **fails** — 57 error lines, all in `*.test.tsx` |
| `npm run test:e2e:static` (Playwright vs. FastAPI-served static build) | **11/11 passed** (incl. 2 live AI specs) — but only after stopping a stale container on port 8000; see Finding 9 |
| `docker build` + container smoke test | image builds clean; container serves `/` 200 with `<title>Kanban Studio</title>`, `/api/hello` 200, `/api/board` 401 unauthenticated |
| Cross-column move position invariant | **gap proven** (Finding 4), via sqlite inspection |
| Session cookie after server restart | **401 proven** (Finding 1), via TestClient |

## Overall assessment

The codebase is in good shape and reads like a deliberate MVP: one place
owns board mutations (`board.py`'s `*_db` functions, shared by the HTTP
routes and the AI operation applier), errors map to sensible status codes
(401/404/422/502/503 in the right places), and the test suite verifies
persistence by re-fetching after mutations rather than trusting response
bodies. The documentation set is unusually accurate against the code.

The two medium findings are both frontend UX failure modes that real users
will hit in normal operation (a container restart, an empty card-details
field). Everything else is low-severity polish or conscious tradeoffs that
should simply be acknowledged. Nothing here calls for new abstractions or
scope.

## New findings

### 1. Stale-session 401 trap: API failures never route the user back to login
**Files:** `frontend/src/lib/api.ts:7-22`,
`frontend/src/components/KanbanBoard.tsx:45-56`,
`frontend/src/components/AuthGate.tsx`
**Severity:** Medium (the most likely error a real user ever sees)

Sessions are intentionally in-memory (`auth.py:12`), so **every container
restart / `docker compose up --build` invalidates all sessions** while the
browser keeps its `session_token` cookie. Proven: after clearing
`auth._sessions` (simulating a restart), a previously valid cookie gets
`401` from `GET /api/board`.

The frontend has no 401 handling anywhere after the initial mount check:
- `KanbanBoard`'s load failure renders "Couldn't load your board" with a
  **"Try again" button that can never succeed** — the retry re-fetches with
  the same dead session, forever. Only a full page reload (which re-runs
  `AuthGate`'s session check) recovers.
- A mid-session expiry during a mutation shows "That didn't save. Please
  try again." — equally unrecoverable.
- `api.ts`'s `request()` collapses every non-OK status into a generic
  `ApiError`, so callers couldn't distinguish 401 even if they wanted to.

**Action:** make `request()` treat 401 specially (e.g. throw a dedicated
`UnauthorizedError`, or invoke an auth-expired callback registered by
`AuthGate`) and transition to the logged-out state, so any expired-session
response lands the user back on the login screen instead of a dead-end
error message.

### 2. Adding a card with no details persists the placeholder text "No details yet."
**File:** `frontend/src/components/KanbanBoard.tsx:106-107`
**Severity:** Medium (silent data corruption, user-visible)

```ts
const handleAddCard = (columnId: string, title: string, details: string) =>
  runMutation(api.addCard(columnId, title, details || "No details yet."));
```

Leaving the Details field empty writes the literal string `"No details
yet."` into the database as the card's content. It's indistinguishable
from real user data, it survives reloads, and it's inconsistent with both
the backend (`AddCardRequest.details` defaults to `""`) and the AI path
(`_apply_operation` happily creates cards with empty details) — so the
same action produces different data depending on which UI created the
card. The e2e persistence test (`kanban.spec.ts:86`) also seeds cards with
this phantom text.

**Action:** pass `details` through as-is (empty string is valid all the way
down). If an empty details paragraph looks bad in `KanbanCard`, handle it
at render time (conditional render), not by inventing data.

### 3. Whole-board replacement races with concurrent mutations
**Files:** `frontend/src/components/KanbanBoard.tsx:66-77`,
`frontend/src/components/ChatSidebar.tsx:34-36`, `backend/app/ai.py:257-293`
**Severity:** Low (single-user MVP makes it unlikely; DB stays correct)

Every mutation returns the full board and the frontend blindly replaces
state with whichever response arrives **last**. Two plausible overlaps:
- A chat request is in flight (Anthropic calls take seconds) while the
  user drags a card. The chat route snapshots the board for its response
  after applying its operations (`ai.py:290`); depending on interleaving,
  the chat response can overwrite the drag's response in the UI with a
  board that predates the drag.
- Two quick manual mutations whose responses arrive out of order produce
  the same last-writer-wins stale render.

The database stays consistent (each request re-serializes from SQLite), so
this is a transient UI inconsistency that the next mutation or reload
fixes — acceptable for the MVP, but it's currently an unacknowledged
tradeoff rather than a conscious one.

**Action:** none required now; document it. If it ever bites, the cheap
fix is ignoring responses that arrive out of order (a per-request sequence
number in `KanbanBoard`), not optimistic locking.

### 4. Cross-column move leaves position gaps in the source column
**File:** `backend/app/board.py:173-203`
**Severity:** Low (no observable misbehavior today; violates a documented
invariant)

`move_card_db` re-numbers the **target** column's cards but never touches
the source column's remaining cards. Proven against a live DB: after
moving `card-1` (position 0) out of Backlog, `card-2` remains at
`position = 1` — the column's positions are no longer the "0-based display
order" that `docs/schema.json` specifies.

Ordering, uniqueness, and MAX+1 appends all keep working, and the next
same-column move re-normalizes everything, so this is cosmetic. But the
gap means the documented invariant is only "eventually" true, which is
exactly the kind of thing that surprises a future reader querying the DB
directly.

**Action:** either re-compact the source column inside `move_card_db`
(three extra UPDATEs), or add one sentence to `schema.json`/`DATABASE.md`
saying positions are an ordering, not a contiguous index, except
immediately after a same-column reorder.

### 5. Chat `max_tokens=1024` can truncate large structured replies
**File:** `backend/app/ai.py:193`
**Severity:** Low (likelihood grows with board size)

The forced-tool response carries `reply` plus the full `operations` array.
A request like "move every card in Backlog to Done, prefixed with the
week's theme" on a well-populated board can push the tool input past 1024
output tokens. Truncated JSON fails `StructuredReply.model_validate`, gets
one retry (which will likely truncate again), then surfaces as a
mystifying 502.

**Action:** bump to 4096. One-word change, no downside at this scale.

### 6. `ChatRequest.history` is unbounded
**File:** `backend/app/ai.py:142-144`
**Severity:** Low

`message` is capped (`max_length=4000`) but `history` has no item-count or
size limit. The client resends the entire growing conversation every turn,
so token usage (cost, latency) grows without bound over a long session,
and nothing stops a pathological client from POSTing megabytes of history.

**Action:** cap it (e.g. `Field(max_length=50)` on the list, matching the
MVP's "conversation is scrollback" framing), consistent with the
validation already applied to `message`.

### 7. Login/logout failure handling conflates or swallows errors
**Files:** `frontend/src/components/LoginScreen.tsx:23-24`,
`frontend/src/components/AuthGate.tsx:34-37`
**Severity:** Low

- `LoginScreen`'s bare `catch` shows "Incorrect username or password." for
  **any** failure — including the backend being down or unreachable, which
  tells the user to retry credentials that were never the problem.
- `AuthGate.handleLogout` awaits `apiLogout()` and only then sets
  logged-out state; if that request fails, the user clicks "Log out" and
  nothing happens (plus an unhandled promise rejection). Since logout is
  primarily a client-side state transition anyway, it should happen
  unconditionally.

**Action:** distinguish 401 from other errors on login; set logged-out
state in a `finally` (or before the request) on logout.

### 8. Drag-and-drop is mouse-only; card markup nests interactive roles
**Files:** `frontend/src/components/KanbanBoard.tsx:58-62`,
`frontend/src/components/KanbanCard.tsx:29-31`
**Severity:** Low (a11y gap, acceptable to defer for an internal MVP)

Only `PointerSensor` is registered — dnd-kit's `KeyboardSensor` isn't — so
cards can't be moved without a mouse. Separately, dnd-kit's `attributes`
give the card `<article>` `role="button"` while it contains a real Remove
`<button>`, producing nested interactive elements (the e2e spec at
`kanban.spec.ts:58-61` already works around the resulting accessible-name
ambiguity with a raw CSS selector).

**Action:** when a11y is in scope, add `KeyboardSensor` +
`sortableKeyboardCoordinates` (a few lines, per dnd-kit docs) and give the
card a dedicated drag handle.

### 9. E2E configs silently reuse whatever is already on port 8000
**Files:** `frontend/playwright.config.ts:28,34`,
`frontend/playwright.static.config.ts:26`
**Severity:** Low (documented, but the failure mode is silent and
confusing — it cost this review one full test run to diagnose)

Both Playwright configs set `reuseExistingServer: true` while their
backend command begins with `rm -f data/app.db`. If anything is already
serving on the port — most likely the project's own Docker container left
running via `scripts/start.sh` — Playwright skips the command entirely:
**no DB reset, no fresh server, and the specs run against the container's
live, polluted board.** The resulting failures (drag specs looking for
seed cards that no longer exist, AI specs timing out against the wrong
backend) point at the code, not the environment. `frontend/AGENTS.md`
documents the pitfall, but documentation didn't prevent it in practice —
a config that's correct by construction beats a warning people must
remember.

**Action:** cheapest robust fix is `reuseExistingServer: false` for the
backend entry, so a taken port fails fast with a clear error instead of
silently testing the wrong server. Alternatively, run the e2e backend on
a dedicated port (e.g. 8001) so it can never collide with the Docker
container's 8000.

### 10. Backend test suite isn't green on a clean checkout; live tests can't be opted out
**Files:** `backend/tests/test_hello.py:15-20`,
`backend/tests/test_ai.py:20-27`, `backend/tests/test_ai_chat.py:175-184`
**Severity:** Low (documented, but friction for anyone new)

- `test_static_index_is_served` requires `backend/static/` to be populated
  by `scripts/build-frontend.sh` first — but that directory is gitignored,
  so `uv run pytest` on a fresh clone fails. `backend/AGENTS.md` documents
  the dependency; a newcomer still red-lights their first run.
- The three live-API tests (and the two `ai-chat.spec.ts` e2e specs) make
  real paid Anthropic calls on every run, per the plan's acceptance — but
  there's no pytest marker, so there's no way to run the suite offline
  (`-m "not live"`) without it failing.

**Action:** mark live tests (`@pytest.mark.live`, registered in
`pyproject.toml`) and consider skipping the static-index test with a clear
reason when `static/index.html` is absent, instead of failing.

### 11. No root-level README / quickstart
**Severity:** Low (docs gap)

The coding standard says "keep README minimal" but there isn't one at the
repo root at all. The prerequisites (Docker; `.env` containing
`ANTHROPIC_API_KEY`) and the two commands that matter
(`scripts/start.sh` / `scripts/stop.sh`) are only discoverable by reading
`AGENTS.md` files aimed at agents, and `frontend/README.md` describes a
frontend-only world that no longer exists.

**Action:** add a ~10-line root README: what it is, prerequisites,
start/stop, where the docs live.

### 12. Docker hygiene notes (informational, no action needed for MVP)
- `Dockerfile:14` installs `uv` unpinned (`pip install uv`) — builds aren't
  bit-reproducible across `uv` releases. Pin if that ever matters.
- The container runs as root (no `USER` directive) — standard caveat,
  fine for a local-only MVP.
- `docker-compose.yml` has no `restart:` policy — after a Docker daemon
  restart the app stays down until `start.sh` is re-run.
- `.dockerignore` doesn't exclude `backend/data/` or `backend/static/`.
  Harmless today (the Dockerfile never COPYs them — the image gets a fresh
  static build from the frontend stage), but excluding them would keep the
  build context honest.

## Prior review re-checked (`docs/code_review.md`, 2026-10-03)

All three "FIXED" items verified as actually fixed in code, and the test
suite agrees. The open items remain open:

- **Finding 4 (tsconfig test types) — still open, confirmed.**
  `tsconfig.json` has no `"types": ["vitest/globals",
  "@testing-library/jest-dom"]`; `npx tsc --noEmit` fails with 57 error
  lines, all in test files. Still no `typecheck` script in `package.json`,
  so the failure stays invisible. Cheap fix, closes a real blind spot.
- **Finding 5 (AI retry sends empty assistant content) — still open,
  confirmed** at `ai.py:220` (`content: json.dumps(tool_use.input) if
  tool_use else ""`). Outcome is still a clean-ish 502 either way, but the
  retry never gets a fair chance when the model answers with text.
- **Finding 6 (minor items) — partially confirmed:** the unused
  `getFirstColumn` in `KanbanBoard.test.tsx:18` is the one remaining lint
  warning. Cookie `secure` flag and journal-mode notes remain
  correct-as-documented for the MVP.

## Explicitly not flagged (deliberate, documented decisions)

- Hardcoded `user`/`password`, in-memory session store, sessions lost on
  restart — `AGENTS.md` "Limitations", `backend/AGENTS.md` "Auth".
- `users.password_hash` seeded with unsalted SHA-256 but never read —
  documented placeholder in `DATABASE.md`; the weak algorithm only matters
  if DB-backed auth is later built by comparing these hashes directly
  (don't — use a real password hash when that day comes).
- No CSRF token (`SameSite=Lax` covers the cross-site POST case), no
  migration tool, no WAL journal mode, per-connection schema/seed checks
  in `get_connection()`, N+1 reads in `serialize_board` — all correct
  calls at this scale, most already documented.
- Client-owned, server-stateless chat history — documented in `ai.py`'s
  header comment; consistent with the ephemeral-session model.

## What looks good

- **Single mutation path.** AI-proposed operations and UI-driven edits go
  through the same `*_db` functions with the same ownership checks —
  there's no second, weaker validation path for the AI.
- **Transaction discipline.** The `*_db` functions never commit; callers
  own the boundary, so a multi-operation chat turn commits atomically.
- **The two-phase position rewrite** in `move_card_db` correctly sidesteps
  the `(column_id, position)` UNIQUE constraint, and the empty-column drop
  regression has a dedicated e2e test with a root-cause comment.
- **Tests assert persistence**, not just responses (re-fetch after every
  mutation; a fresh `GET /api/board` after AI mutations).
- **Secrets hygiene:** `.env` is gitignored (verified untracked) and
  dockerignored; the image gets secrets only via compose `env_file`.
- **Docs match reality** — the `AGENTS.md` files, `PLAN.md`, `DATABASE.md`
  and `schema.json` accurately describe the code as it exists today.

## Suggested priority

1. Finding 1 (401 trap) — real user-facing dead end on every restart.
2. Finding 2 ("No details yet.") — stop persisting placeholder data.
3. Prior Finding 4 (tsconfig types + `typecheck` script) — cheap, unhides
   a whole category of future regressions.
4. Finding 5 (`max_tokens` bump) and Prior Finding 5 (retry empty
   content) — two one-line robustness fixes in the same function.
5. Finding 9 (`reuseExistingServer: false`) — one-line guard against a
   whole afternoon of confusing e2e failures.
6. Findings 4, 6, 7, 10, 11 — small, independent polish.
7. Findings 3, 8, 12 — acknowledge/document; revisit past MVP.
