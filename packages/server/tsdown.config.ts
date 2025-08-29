import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  treeshake: true,
  sourcemap: false,
  dts: false, // CLIには型定義不要
  env: {
    HATAGO_BUILD_TARGET: 'node'
  },
  // @hatago/* はバンドル、外部ライブラリは除外
  external: [
    'node:*',
    'hono',
    '@hono/node-server'
  ],
  // CLIファイルにシェバング追加
  onSuccess: async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const cliPath = path.join(process.cwd(), 'dist/cli.js');
    const content = await fs.readFile(cliPath, 'utf-8');
    if (!content.startsWith('#!/usr/bin/env node')) {
      await fs.writeFile(cliPath, `#!/usr/bin/env node\n${content}`);
      // 実行権限を付与
      await fs.chmod(cliPath, 0o755);
    }
  }
});