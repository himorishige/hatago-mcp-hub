import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: [
    '@himorishige/hatago-core',
    '@himorishige/hatago-runtime',
    '@himorishige/hatago-transport',
    '@modelcontextprotocol/sdk',
    'commander',
    'chalk'
  ],
  esbuildOptions: {
    // Make the CLI executable
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
});
