// Stage-1 lane entrypoint while shared package scripts remain integrator-owned.
// From frontend: node tests/e2e/run.mjs [--smoke] [Playwright arguments...]
// Stage-1 integration must pin @playwright/test 1.65.0 and wire test:e2e here.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
} catch {
  console.error('Missing @playwright/test. Stage-1 integration must add the pinned 1.65.0 dependency and lockfile.');
  process.exit(1);
}
const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
const result = spawnSync(process.execPath, [cli, 'test', ...args.filter((arg) => arg !== '--smoke')], {
  cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  stdio: 'inherit',
  env: { ...process.env, ...(smoke ? { IFIT_E2E_SMOKE: '1' } : {}) },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
