import { defineConfig } from 'tsdown';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// Copy template files to dist
function copyTemplates() {
  const srcTemplatesDir = 'src/templates';
  const distTemplatesDir = 'dist/templates';

  function copyDirectory(src: string, dest: string) {
    try {
      mkdirSync(dest, { recursive: true });
      const entries = readdirSync(src);

      for (const entry of entries) {
        const srcPath = join(src, entry);
        const destPath = join(dest, entry);
        const stat = statSync(srcPath);

        if (stat.isDirectory()) {
          copyDirectory(srcPath, destPath);
        } else if (!entry.endsWith('.test.ts') && !entry.endsWith('.test.js')) {
          copyFileSync(srcPath, destPath);
        }
      }
    } catch (error) {
      console.warn('Failed to copy templates:', error);
    }
  }

  copyDirectory(srcTemplatesDir, distTemplatesDir);
}

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
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')
  },
  // Make CLI executable and copy templates
  onSuccess: () => {
    copyTemplates();
    // Make CLI executable
    try {
      execSync('chmod +x dist/node/cli.js');
    } catch (error) {
      console.warn('Failed to make CLI executable:', error);
    }
  },
  // Bundle as single file for CLI
  rolldown: {
    output: {
      inlineDynamicImports: true
    }
  }
});
