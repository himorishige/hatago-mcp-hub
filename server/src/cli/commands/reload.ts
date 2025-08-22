/**
 * Reload command - Reload configuration
 */

import type { Command } from 'commander';
import { sanitizeLog } from '../../utils/security.js';

export function createReloadCommand(program: Command): void {
  program
    .command('reload')
    .description('Reload configuration')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options) => {
      try {
        console.log('Reloading configuration...');

        // FileWatcherを使って設定を再読み込み
        const { FileWatcher } = await import('../../core/file-watcher.js');
        const watcher = new FileWatcher({
          watchPaths: [options.config || '.hatago/config.jsonc'],
        });

        const newConfig = await watcher.reload();
        console.log('🏨 Configuration reloaded successfully');
        console.log('New config:', JSON.stringify(newConfig, null, 2));

        await watcher.stop();
      } catch (error) {
        const safeError = await sanitizeLog(String(error));
        console.error('Failed to reload configuration:', safeError);
        process.exit(1);
      }
    });
}
