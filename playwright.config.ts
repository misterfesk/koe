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
    command:
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port " +
      port,
    url: "http://127.0.0.1:" + port,
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [["list"]],
});
