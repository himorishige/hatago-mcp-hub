import { defineConfig } from 'tsdown';

const config: import('tsdown').UserConfigFn = defineConfig((cliOptions) => ({
  entry: ['src/index.ts'],
  platform: 'neutral',
  format: ['esm'],
  dts: true,
  sourcemap: true,
}));

export default config;
