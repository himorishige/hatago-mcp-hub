import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  treeshake: true,
  sourcemap: false,
  dts: true, // Generate type definitions for library usage
  env: {
    HATAGO_BUILD_TARGET: 'node'
  },
  // Bundle @himorishige/hatago-* packages, exclude external libraries
  external: ['node:*', 'hono', '@hono/node-server'],
  esbuildOptions: {
    // Make the CLI executable
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
});
