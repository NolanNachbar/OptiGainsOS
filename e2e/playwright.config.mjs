// Regression tests from the overnight audit. Each asserts on DB state and on
// roles/labels (never CSS classes), so the coming restyle doesn't break them.
// Needs `npm run dev` on :5173. Runs as the test athlete (dev auth bypass).
// PLAYWRIGHT_BASE_URL overrides the port — used when another dev server (or
// another worktree's own dev server) already holds :5173.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 0,
  workers: 1, // one test account, shared rows: keep tests serial
  reporter: [['list']],
  use: {
    ...devices['iPhone 13 Pro Max'],
    browserName: 'webkit',
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
});
