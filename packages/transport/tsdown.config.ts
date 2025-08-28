import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20.0.0',
  sourcemap: true,
  clean: true,
  dts: true,
  external: ['@modelcontextprotocol/sdk', '@hatago/core'],
});