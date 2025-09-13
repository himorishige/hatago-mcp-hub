import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/node/index.ts', 'src/node/cli.ts', 'src/workers/index.ts', 'src/browser/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  treeshake: true,
  sourcemap: false,
  dts: true,
  env: {
    HATAGO_BUILD_TARGET: 'node'
  },
  // Bundle internal workspace packages; keep Node builtins and @himorishige packages external
  external: ['node:*', '@himorishige/hatago-core'],
  esbuildOptions: {
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
});
