import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5177",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node node_modules/vite/bin/vite.js --port 5177",
      url: "http://127.0.0.1:5177",
      reuseExistingServer: false,
      env: { ORIGIN_API_TARGET: "http://127.0.0.1:8088" },
    },
    {
      command: "node node_modules/tsx/dist/cli.mjs scripts/e2e-server.ts",
      url: "http://127.0.0.1:8088/api/health",
      reuseExistingServer: false,
    },
  ],
});
