import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts', 'apps/web/src/lib/**/*.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
  },
});
