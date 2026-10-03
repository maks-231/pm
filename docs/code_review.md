# Code Review

Date: 2026-10-03
Scope: full repository (`backend/`, `frontend/`, `scripts/`, Docker/compose,
docs). Reviewed every source file in `backend/app/`, `frontend/src/`, all
test files, build/deploy scripts, and the architecture/decisions documented
in the root and per-directory `AGENTS.md` files. Verified behavior by
running the actual tooling rather than just reading code:

- `uv run pytest` (backend): **32/32 passed**, including the two tests that
  make live Anthropic API calls.
- `npm run test:unit` (frontend, Vitest): **19/19 passed**.
- `npm run lint` (frontend, ESLint): **2 errors, 1 warning**.
- `npx tsc --noEmit` (frontend, standalone): **fails** on every test file.

## Overall assessment

This is a small, well-scoped MVP and it reads like one: single source of
truth for board mutations (`app/board.py`'s `*_db` functions are called by
both the HTTP routes and the AI operation applier), no premature
abstraction, consistent error handling (404 for bad ids, 502 for upstream AI
failures, 503 for missing config), and a test suite that actually exercises
persistence (re-fetching after every mutation) rather than just checking
response bodies. The `AGENTS.md` files are accurate and current against the
code as it stands today.

The findings below are either things that are demonstrably broken right now
(lint/typecheck failures), or real user-facing bugs with concrete repro
steps. Nothing here suggests adding scope, abstractions, or defensive code
beyond what the MVP calls for — several things that might look like gaps
(no CSRF token, no DB-backed auth, no migrations) are already deliberate,
documented decisions in `AGENTS.md` / `docs/DATABASE.md` and are correctly
left alone.

## Findings

### 1. `npm run lint` currently fails (2 errors) — new React Compiler rule — FIXED
**Files:** `frontend/src/components/KanbanBoard.tsx:51`,
`frontend/src/components/KanbanColumn.tsx:29`
**Severity:** Medium (breaks a documented command; blocks a clean CI gate)
**Status:** Fixed. `KanbanBoard`'s mount effect now calls `api.getBoard()`
directly instead of through `loadBoard` (which still exists, unchanged, for
the "Try again" button's onClick). `KanbanColumn`'s title-draft resync now
happens during render (comparing against a `prevTitle` state value) instead
of in a `useEffect`, per React's "adjusting state when a prop changes"
guidance. `npm run lint` is green (only the pre-existing, unrelated
`getFirstColumn` unused-var warning remains — see Finding 6).

`eslint-config-next`'s `react-hooks/set-state-in-effect` rule now flags:

```ts
useEffect(loadBoard, []);                              // KanbanBoard.tsx:51
useEffect(() => setTitleDraft(column.title), [column.title]); // KanbanColumn.tsx:29
```

Both call `setState` synchronously in an effect body, which the rule flags
as a cascading-render smell. Functionally harmless today, but `npm run
lint` (listed as a standard command in `frontend/AGENTS.md`) is red right
now, which defeats its purpose as a gate.

**Action:** Rewrite `loadBoard`'s effect to do the fetch directly inside
`useEffect` (it already does async work; just stop extracting it to a
named function reused elsewhere), and replace `KanbanColumn`'s
prop-mirroring effect with `key={column.id}` reset or a derived-state
pattern, per the pattern React's docs link in the lint output.

### 2. Failed column rename leaves a stale, unsaved title in the input — FIXED
**File:** `frontend/src/components/KanbanColumn.tsx:28-38`
**Severity:** Medium (silent data-integrity illusion in the UI)
**Status:** Fixed. `KanbanBoard.handleRenameColumn` now returns the
`runMutation` promise (`Promise<boolean>`), and `KanbanColumn.commitTitle`
resets `titleDraft` back to `column.title` when that promise resolves
`false`, so a rejected rename no longer leaves the input showing an
unsaved edit.

```ts
const [titleDraft, setTitleDraft] = useState(column.title);
useEffect(() => setTitleDraft(column.title), [column.title]);

const commitTitle = () => {
  const trimmed = titleDraft.trim();
  if (trimmed && trimmed !== column.title) {
    onRename(column.id, trimmed);   // fire-and-forget, no success/failure feedback here
  } else {
    setTitleDraft(column.title);
  }
};
```

`onRename` → `KanbanBoard.handleRenameColumn` → `runMutation` only sets a
generic `mutationError` banner on failure; it never touches `titleDraft`.
Since the effect that resyncs `titleDraft` is keyed on `column.title`, and
`column.title` by definition did **not** change on a failed rename, the
input keeps showing the user's rejected edit as if it had saved — the only
signal anything went wrong is the top-of-page banner, easy to miss, and it
clears itself after the next successful mutation (see
`MUTATION_ERROR_MESSAGE` usage), not tied to this specific field.

**Repro:** rename a column to a 201+ character title (backend caps at 200,
`RenameColumnRequest.title = Field(max_length=200)` in `board.py:32`) → 422
→ input still shows the long title → reload the page and it reverts,
confusing the user in the meantime.

**Action:** on mutation failure, explicitly reset `titleDraft` back to
`column.title` (e.g. in the `.catch()` branch of the rename call, or by
having `runMutation` take an `onError` callback).

### 3. A failed "add card" silently discards what the user typed — FIXED
**Files:** `frontend/src/components/NewCardForm.tsx:13-21`,
`frontend/src/components/KanbanBoard.tsx:94-96`
**Severity:** Medium (data loss, no recovery path)
**Status:** Fixed. `KanbanBoard`'s `runMutation` now returns
`Promise<boolean>` (resolving `true`/`false` instead of only setting
`mutationError` as a side effect), `handleAddCard` returns that promise,
and `NewCardForm.handleSubmit` awaits it: the form only clears and
collapses on success. On failure it keeps the typed title/details, shows
an inline "Couldn't add the card. Please try again." message, and the
submit button shows "Adding…" and disables itself while in flight.

```ts
const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (!formState.title.trim()) return;
  onAdd(formState.title.trim(), formState.details.trim());
  setFormState(initialFormState);   // runs unconditionally
  setIsOpen(false);                 // runs unconditionally
};
```

`onAdd` (→ `handleAddCard` → `runMutation(api.addCard(...))`) is not
awaited and its result isn't plumbed back to the form — the form clears
and collapses immediately regardless of whether the request later
succeeds or fails. If it fails (backend validation: title/details over
200/2000 chars, or a network blip), the user's typed card is gone with no
way to recover it beyond the generic "That didn't save" banner.

**Action:** have `handleAddCard` return the mutation promise and only call
`setFormState(initialFormState)` / `setIsOpen(false)` in NewCardForm after
it resolves; keep the form open with the typed values and show an inline
error on rejection.

### 4. Standalone `tsc --noEmit` fails on every `*.test.ts(x)` file
**File:** `frontend/tsconfig.json`
**Severity:** Low (currently invisible — masks real regressions)

Vitest is configured with `globals: true` (`vitest.config.ts:10`), so
`describe`/`it`/`expect` work at **runtime** without an import. But
`tsconfig.json` has no `"types": ["vitest/globals", "@testing-library/jest-dom"]`
entry, so a plain `npx tsc --noEmit` reports ~40 errors
(`Cannot find name 'describe'/'expect'`) across every test file. There is
no `typecheck` script in `package.json`, so nothing currently runs this
check — which means a genuine type error introduced inside a test file
(as opposed to a missing-global error) would also go unnoticed, since
nobody is looking at `tsc` output at all.

**Action:** add `"types": ["vitest/globals", "@testing-library/jest-dom"]`
to `compilerOptions` in `tsconfig.json`, and add a `"typecheck": "tsc
--noEmit"` script so this is runnable (and pluggable into CI) going
forward.

### 5. AI retry path can send an empty-content message to the Anthropic API
**File:** `backend/app/ai.py:216-230`
**Severity:** Low (narrow edge case, currently untested against the real API)

```python
attempt_messages = [
    *messages,
    {
        "role": "assistant",
        "content": json.dumps(tool_use.input) if tool_use else "",
    },
    {"role": "user", "content": "Your previous response didn't match..."},
]
```

When the model responds with text instead of calling the forced tool
(`tool_use is None`), the retry injects an assistant turn with
`content: ""`. Anthropic's API has historically rejected messages with
empty text content. If that's still true, the retry call itself would
raise `anthropic.APIError`, which is caught and surfaced as a 502 — so the
user-facing outcome is the same "clean 502" either way, but the retry
never actually gets a chance to nudge the model as intended, and the
`detail` message in that 502 would read like a generic API failure rather
than "model wouldn't use the schema." This path is also not exercised by
`test_chat_handles_malformed_model_output_gracefully` (`FakeClient` never
validates content) nor by the live smoke test (which always complies with
the forced tool choice).

**Action:** substitute a short placeholder (e.g. `"(no tool call)"`) for
the empty string, or drop the assistant echo turn entirely and just append
the corrective user message.

### 6. Minor cleanup items (no action required beyond convenience)
- `frontend/src/components/KanbanBoard.test.tsx:18` — `getFirstColumn` is
  declared but never used (ESLint warning, not an error). Delete it or use
  it.
- Session cookie (`app/main.py:47-52`) has no `secure=True` or explicit
  `max_age`. Correct for the documented local-Docker-over-HTTP MVP; worth a
  one-line addition (`secure=True`) only if this ever gets deployed behind
  HTTPS.
- `get_connection()` opens a fresh SQLite connection per request with the
  default journal mode (no WAL). Fine at the MVP's single-user scale;
  flagging only so it's a conscious choice if concurrent usage ever grows
  enough to see `database is locked` errors.

## Explicitly not flagged (by design, already documented)

- Hardcoded `user`/`password` credentials and in-memory sessions —
  intentional per `AGENTS.md` "Limitations" and `backend/AGENTS.md`'s Auth
  section.
- `users.password_hash` is computed and stored but never read by the login
  route — documented as a deliberate placeholder in `docs/DATABASE.md`
  ("Part 4's login still checks a hardcoded pair... doesn't read this
  table") so that DB-backed auth later needs no schema change.
- No CSRF token on mutating routes — `SameSite=Lax` already blocks the
  cross-site fetch/XHR case this would protect against, and adding a token
  mechanism for a single hardcoded local user would be scope creep.
- No DB migration tool — `docs/DATABASE.md` explicitly defers this until
  past the MVP.

## Priority order for fixes

1. ~~Finding 1 (lint failures)~~ — **fixed**, `npm run lint` is green.
2. ~~Finding 3 (add-card data loss)~~ — **fixed**.
3. ~~Finding 2 (stale rename input)~~ — **fixed**.
4. Finding 4 (tsconfig types) — cheap, closes a blind spot for future
   changes.
5. Finding 5 (AI retry edge case) — narrow, low likelihood given forced
   `tool_choice`, but cheap to fix while in the area.
6. Finding 6 items — opportunistic, no urgency.
