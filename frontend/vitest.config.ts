import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Browser journeys live under tests/e2e and run with Playwright instead.
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
  },
});
