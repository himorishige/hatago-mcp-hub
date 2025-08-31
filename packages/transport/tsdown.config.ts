import { defineConfig } from 'tsdown';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20.0.0',
  sourcemap: true,
  clean: true,
  dts: true,
  external: ['@modelcontextprotocol/sdk', '@himorishige/hatago-core']
});
