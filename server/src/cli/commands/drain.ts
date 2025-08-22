/**
 * Drain command - Drain a generation
 */

import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { sanitizeLog } from '../../utils/security.js';

export function createDrainCommand(program: Command): void {
  program
    .command('drain <generation>')
    .description('Drain a generation (stop accepting new sessions)')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (generation, options) => {
      try {
        const config = await loadConfig(options.config);

        // ConfigManagerを作成
        const { ConfigManager } = await import('../../core/config-manager.js');
        const configManager = new ConfigManager({
          maxGenerations: config.generation?.maxGenerations,
          gracePeriodMs: config.generation?.gracePeriodMs,
        });

        // 世代をドレイン
        const genId = parseInt(generation, 10);
        await configManager.drainGeneration(genId);

        console.log(`🏨 Generation ${genId} has been drained`);
        console.log('It will be cleaned up after the grace period');

        await configManager.shutdown();
      } catch (error) {
        const safeError = await sanitizeLog(String(error));
        console.error('Failed to drain generation:', safeError);
        process.exit(1);
      }
    });
}
