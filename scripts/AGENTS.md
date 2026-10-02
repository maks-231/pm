# Scripts

- `start.sh` / `start.ps1` — `docker compose up --build -d`, then prints the
  local URL (http://localhost:8000). The Docker build handles compiling the
  frontend and backend itself (see root `Dockerfile`); you don't need
  `build-frontend.sh` first just to use these.
- `stop.sh` / `stop.ps1` — `docker compose down`
- `build-frontend.sh` (Mac/Linux only) — builds the Next.js static export
  (`frontend/npm ci && npm run build`) and copies it into `backend/static/`.
  Used for running the backend locally without Docker (`uv run uvicorn`) and
  by `frontend`'s `test:e2e:static` Playwright project. Not needed for
  `start.sh`/`stop.sh`.

Use the `.sh` scripts on Mac/Linux and the `.ps1` scripts on Windows
(PowerShell) for start/stop. Both just shell out to Docker Compose, so they
stay in sync by construction.

Run from the repo root or from anywhere; each script `cd`s to the repo root
before invoking Docker Compose.
