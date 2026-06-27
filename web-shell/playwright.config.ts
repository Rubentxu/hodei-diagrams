import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4100',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    port: 4100,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', ...devices['Desktop Chrome'] },
    },
  ],
});
