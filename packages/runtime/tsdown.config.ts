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
  platform: 'node', // Use node platform to properly handle Node.js built-ins
  target: 'node20',
  external: [
    '@hatago/core',
    '@modelcontextprotocol/sdk',
    // Node.js built-ins are automatically externalized with platform: 'node'
  ],
});