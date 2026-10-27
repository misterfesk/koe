import { defineConfig, devices } from "@playwright/test";

// PW_PORT lets parallel runs (e.g. a reviewer and the builder) use separate servers.
const port = Number(process.env.PW_PORT ?? 3200);
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 4,
  timeout: 45000,
  expect: { timeout: 7000 },
  use: { baseURL: "http://127.0.0.1:" + port, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Start from an empty database every run.
    command:
      `node -e "require('fs').rmSync('.data/e2e-${port}',{recursive:true,force:true})" && ` +
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port " +
      port,
    url: "http://127.0.0.1:" + port,
    reuseExistingServer: false,
    timeout: 60000,
    // A throwaway database, the AI and reminders off: tests are repeatable
    // and never call the provider.
    env: {
      DATABASE_URL: "file:./.data/e2e-" + port,
      KOE_AI: "off",
      KOE_SCHEDULER: "off",
      KOE_RATE_LIMIT: "off",
      // Pushes are recorded, not sent.
      KOE_PUSH_STUB: "on",
      // Talk answers from a script (tests only; refused unless APP_URL is local).
      KOE_AI_STUB: "on",
      KOE_SEARCH_STUB: "on",
      APP_URL: "http://127.0.0.1:" + port,
    },
  },
  reporter: [["list"]],
});
