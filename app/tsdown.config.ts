import { defineConfig } from 'tsdown';

const config: import('tsdown').UserConfigFn = defineConfig((cliOptions) => ({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  platform: 'node',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  external: ['node:*'],
}));

export default config;
