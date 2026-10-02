# Frontend

A Next.js Kanban board, built as a static export (`output: 'export'` in
`next.config.ts`) and served by the FastAPI backend — see `backend/AGENTS.md`
and `scripts/build-frontend.sh`. Gated behind a login screen (hardcoded
`user`/`password`); the board is fully backend-persisted via `/api/board`
(Part 6) — no AI chat yet, that's later plan parts.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, strict mode
- Tailwind CSS v4 (`@tailwindcss/postcss`), custom CSS variables for the brand
  color scheme in `src/app/globals.css`
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag and drop
- Fonts: Space Grotesk (display / headings) and Manrope (body), loaded via
  `next/font/google`
- Vitest + Testing Library for unit/component tests, Playwright for e2e

## Structure

- `src/app/page.tsx` — renders `KanbanBoard`, the only route
- `src/app/layout.tsx` — root layout, fonts, page metadata
- `src/app/globals.css` — Tailwind import + CSS variables (colors, surface,
  shadow)
- `src/lib/kanban.ts` — data model (`Card`, `Column`, `BoardData`) and
  `resolveDropTarget` (pure function turning a dnd-kit drag-end event into
  the `{columnId, index}` payload `PATCH /api/board/cards/:id/move` expects)
- `src/components/KanbanBoard.tsx` — top-level client component. Fetches the
  board from `GET /api/board` on mount; every mutation (rename, add, delete,
  move) calls the matching `api.ts` function and replaces board state with
  the full `BoardData` the backend returns — no optimistic updates, no
  client-side reducer. Handles loading and error states (failed initial
  load shows a retry button; a failed mutation shows a dismissable-on-next-
  success banner, see `MUTATION_ERROR_MESSAGE`)
- `src/components/KanbanColumn.tsx` — one column: renameable title input
  (local draft state, committed to `onRename` on blur/Enter rather than per
  keystroke — the rename is a real network request now, not a local state
  update), droppable area, `SortableContext` of cards, empty-state
  placeholder, renders `NewCardForm`
- `src/components/KanbanCard.tsx` — one draggable card (title, details,
  remove button)
- `src/components/KanbanCardPreview.tsx` — static (non-sortable) card used in
  the `DragOverlay` while dragging
- `src/components/NewCardForm.tsx` — inline expand/collapse form for adding a
  card to a column
- `src/components/AuthGate.tsx` — client component owning auth state; checks
  `GET /api/session` on mount, renders `LoginScreen` or `KanbanBoard`
  (passing it a `onLogout` handler)
- `src/components/LoginScreen.tsx` — username/password form, calls
  `api.login`, shows an inline error on failure
- `src/lib/api.ts` — thin fetch wrapper for auth (`login`, `logout`,
  `getSession`) and board (`getBoard`, `renameColumn`, `addCard`,
  `deleteCard`, `moveCard`) endpoints; throws on non-OK responses

## Data model

```ts
type Card = { id: string; title: string; details: string };
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

This is also the API's response shape for `GET /api/board` and every
mutation route — see `backend/AGENTS.md`.

## Commands

Run from `frontend/`:

- `npm run dev` — dev server on :3000. API calls use relative `/api/...`
  paths; `next.config.ts`'s `rewrites()` proxies those to a backend on
  `127.0.0.1:8000` during dev only (no-op in the production export, where
  FastAPI serves both). Run the backend yourself (`cd ../backend && uv run
  uvicorn app.main:app --port 8000`) alongside `next dev`, or just use
  `npm run test:e2e`, which boots both for you.
- `npm run build` — static export to `out/` (no `next start`; the export has
  no Node server to run — preview it via the backend instead, see below)
- `npm run test:unit` — Vitest (jsdom), covers `src/lib/kanban.ts` and
  `KanbanBoard`
- `npm run test:e2e` — Playwright against a dev server it starts itself
  (`playwright.config.ts`), plus a backend it also starts (two `webServer`
  entries). Covers auth (login, wrong creds, logout, session survives
  reload) and board interactions (load, add-card, drag-to-move, persistence
  across reload/re-login). Needs `uv` on PATH.
- `npm run test:e2e:static` — same specs, but against the real static export
  served by the FastAPI backend (`playwright.static.config.ts`); runs
  `scripts/build-frontend.sh` and `uv run uvicorn` as its web server. This is
  the integration test that proves the build Docker ships actually works.
- Both e2e configs delete `backend/data/app.db` before starting their
  backend (fresh seeded board every run) and run with `workers: 1` — the
  board is now real shared backend state for the one hardcoded user, so
  tests mutate it in sequence rather than each getting an isolated copy.
  `reuseExistingServer: true` means this reset is skipped if a server was
  already running on that port; stop any other instance first (including
  `./scripts/stop.sh` if the Docker container is up) for a clean run.
- `npm run test:all` — unit + both e2e variants
- `npm run lint` — ESLint (`eslint-config-next`)

To preview the production build locally without Docker: run
`../scripts/build-frontend.sh` from `frontend/`, then
`cd ../backend && uv run uvicorn app.main:app --port 8000` and open
http://localhost:8000.

## Notes for future work

- No AI chat yet — in scope for later plan parts.
- Column IDs and card IDs are prefixed strings (`col-*`, `card-*`); keep this
  convention if the backend starts generating or validating IDs.
- Static export means no Next.js server features (SSR, API routes, dynamic
  route params, `next/image` optimization) are available — everything must
  work as client-rendered, pre-built HTML/JS.
- `next build` prints "Specified rewrites will not automatically work with
  output: export" twice — harmless. Next validates the presence of the
  `rewrites` key in config before invoking it, so it warns even though the
  function returns `[]` under `NODE_ENV=production` (which `next build`
  always sets). The export still comes out correct; nothing depends on the
  rewrite at runtime since FastAPI serves everything same-origin.
