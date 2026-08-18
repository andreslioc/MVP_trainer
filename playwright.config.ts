import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // El bundle del blueprint vive dentro del proyecto: sin esta exclusion
  // playwright podria recolectar especificaciones de blueprints/*/workspace/.
  testIgnore: ["**/blueprints/**"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `${BASE_URL}/health`,
    reuseExistingServer: true,
    timeout: 180000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
