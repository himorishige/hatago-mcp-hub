import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  treeshake: true,
  sourcemap: false,
  dts: true, // Generate type definitions for library usage
  env: {
    HATAGO_BUILD_TARGET: 'node'
  },
  // Bundle @hatago/* packages, exclude external libraries
  external: [
    'node:*',
    'hono',
    '@hono/node-server'
  ],
  // Add shebang to CLI file
  onSuccess: async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const cliPath = path.join(process.cwd(), 'dist/cli.js');
    const content = await fs.readFile(cliPath, 'utf-8');
    if (!content.startsWith('#!/usr/bin/env node')) {
      await fs.writeFile(cliPath, `#!/usr/bin/env node\n${content}`);
      // Grant execute permission
      await fs.chmod(cliPath, 0o755);
    }
  }
});