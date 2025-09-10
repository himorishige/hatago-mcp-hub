import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'node-entry': 'src/node-entry.ts',
    'workers-entry': 'src/workers-entry.ts',
    'hub-streamable': 'src/hub-streamable.ts'
  },
  format: ['esm'],
  clean: true,
  dts: true,
  platform: 'node',
  target: 'node20',
  // Bundle internal workspaces; keep only true externals out.
  external: ['@modelcontextprotocol/sdk', 'hono']
});
