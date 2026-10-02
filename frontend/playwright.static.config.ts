import { defineConfig, devices } from "@playwright/test";

// Runs the existing e2e specs against the production-shaped static build:
// `scripts/build-frontend.sh` exports the Next.js app and copies it into
// backend/static, then the FastAPI backend serves it, exactly as it would
// in the Docker container. Requires `uv` (see backend/AGENTS.md).
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  // The Kanban board is backend-persisted and shared by the single
  // hardcoded user, so tests mutate shared state — they must run serially.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
  },
  webServer: {
    // Fresh DB per test run, see playwright.config.ts.
    command:
      "rm -f data/app.db && ../scripts/build-frontend.sh && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000",
    cwd: "../backend",
    url: "http://127.0.0.1:8000/api/hello",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
