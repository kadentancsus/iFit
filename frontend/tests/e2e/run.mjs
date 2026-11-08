// From frontend: npm run test:e2e -- [--smoke] [Playwright arguments...]
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
} catch {
  console.error('Missing @playwright/test. Run npm ci in frontend first.');
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
