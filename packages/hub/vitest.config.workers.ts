import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      modules: true,
      kvNamespaces: ['CONFIG_KV'],
      durableObjects: {
        SESSION_DO: 'SessionDurableObject',
      },
    },
    include: ['src/**/*.workers.test.ts', 'src/**/*.workers.spec.ts'],
  },
});