/**
 * Vitest configuration for core package
 * Use forked processes to avoid worker-thread limitations in sandbox.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks'
  }
});
