import { defineConfig } from 'vitest/config';

const config: import('vitest/config').UserConfigExport = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

export default config;
