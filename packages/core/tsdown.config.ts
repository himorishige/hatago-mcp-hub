import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/schemas.ts', 'src/types/rpc.ts'],
  format: ['esm'],
  clean: true,
  platform: 'node'
});
