import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/schemas.ts',
    'src/utils/deep-merge.ts',
    'src/utils/path-resolver.ts'
  ],
  format: ['esm'],
  clean: true,
  platform: 'node'
});
