import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['src/e2e/**/*.test.ts', 'src/**/*.workers.test.ts', 'src/**/*.workers.spec.ts'],
    testTimeout: 10000
  }
});
