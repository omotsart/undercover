import { defineConfig } from "@playwright/test";

// The end-to-end tests run their own backend and dashboard on a fresh database,
// so they never touch the dev servers or the dev database.
export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/test-results",
  reporter: "list",
  workers: 1,
  use: { baseURL: "http://localhost:5174" },
  webServer: [
    {
      command:
        "uv run -m backend.seed && uv run -m uvicorn backend.main:app --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      env: { DATABASE_PATH: "e2e/e2e.db" },
    },
    {
      command: "npx vite dashboard --port 5174 --strictPort",
      url: "http://localhost:5174",
      env: { API_URL: "http://127.0.0.1:8001" },
    },
  ],
});
