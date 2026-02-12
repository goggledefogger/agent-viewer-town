import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w packages/server',
      port: 3001,
      reuseExistingServer: true,
      timeout: 10000,
    },
    {
      command: 'npm run dev -w packages/client',
      port: 5173,
      reuseExistingServer: true,
      timeout: 10000,
    },
  ],
});
