import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const frontend = __dirname;
const root = path.resolve(frontend, '..');
for (const file of [path.join(root, 'backend/.env'), path.join(frontend, '.env.local')]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

// Explicit smoke mode checks only local startup, layout and API liveness. Its
// inert settings are NOT authentication, database fixtures, or persistence tests.
const smokeOnly = process.env.IFIT_E2E_SMOKE === '1';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!smokeOnly && (!supabaseUrl || !publishableKey)) {
  throw new Error(
    'Browser journeys require real Supabase settings in backend/.env or the environment. ' +
    'For startup checks only, explicitly set IFIT_E2E_SMOKE=1. No persistence is tested in smoke mode.',
  );
}

const python = process.env.IFIT_E2E_PYTHON || path.join(
  root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
// JSON string quoting prevents spaces in checkout paths from breaking commands.
const quote = (value: string) => JSON.stringify(value);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: smokeOnly ? '**/smoke.spec.ts' : '**/*.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1, // Persistence journeys must own isolated accounts; never share saved auth.
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 10_000,
    trace: 'off', // Do not persist signed-in tokens or personal data in artifacts.
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } }],
  webServer: [
    {
      name: 'FastAPI',
      cwd: root,
      command: `${quote(python)} -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`,
      url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        SUPABASE_URL: supabaseUrl || 'http://127.0.0.1:54321',
        SUPABASE_PUBLISHABLE_KEY: publishableKey || 'sb_publishable_inert_smoke_only',
        FRONTEND_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      },
    },
    {
      name: 'Next.js',
      cwd: frontend,
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8000',
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl || 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey || 'sb_publishable_inert_smoke_only',
      },
    },
  ],
});
