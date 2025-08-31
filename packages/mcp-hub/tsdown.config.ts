import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/node/cli.ts', 'src/node/index.ts', 'src/workers/index.ts', 'src/browser/index.ts'],
  format: 'esm',
  target: 'node20',
  dts: true,
  bundle: true,
  // Keep external to avoid bundling large dependencies
  external: ['@modelcontextprotocol/sdk', 'hono', 'commander'],
  // Bundle workspace dependencies - include core and subpaths
  noExternal: ['@himorishige/hatago-core', /^@himorishige\/hatago-core\/.*/, /^@himorishige\//],
  clean: true,
  // Enable source maps for debugging
  sourcemap: true,
  // Platform-specific builds
  platform: 'node',
  // Minify for production
  minify: false, // Don't minify for easier debugging initially
  // Define environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  },
  // Make CLI executable
  onSuccess: 'chmod +x dist/node/cli.js',
  // Bundle as single file for CLI
  rolldown: {
    output: {
      inlineDynamicImports: true
    }
  }
});
