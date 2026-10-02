import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  // The Kanban board is now backend-persisted and shared by the single
  // hardcoded user, so tests mutate shared state — they must run serially,
  // not in parallel workers, or they'd race each other.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  // Two servers: the backend owns auth/session/board state, the Next dev
  // server proxies "/api/*" to it (see next.config.ts) so the page can use
  // relative API paths exactly as it does in production.
  webServer: [
    {
      // Fresh DB per test run so specs see the known seed data, not
      // whatever a previous run left behind.
      command: "rm -f data/app.db && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000",
      cwd: "../backend",
      url: "http://127.0.0.1:8000/api/hello",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
