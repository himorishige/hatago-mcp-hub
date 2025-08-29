import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'platform/index': 'src/platform/index.ts',
    'platform/node': 'src/platform/node.ts',
    'platform/workers': 'src/platform/workers.ts',
  },
  format: ['esm'],
  clean: true,
  platform: 'neutral', // Platform-neutral build
  target: 'es2022',
  external: ['node:*'], // Externalize Node.js built-ins
});