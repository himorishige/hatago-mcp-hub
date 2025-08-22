/**
 * Status command - Show generation and session status
 */

import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { sanitizeLog } from '../../utils/security.js';

export function createStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show generation and session status')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options) => {
      try {
        const config = await loadConfig(options.config);

        // ConfigManagerを作成
        const { ConfigManager } = await import('../../core/config-manager.js');
        const configManager = new ConfigManager({
          maxGenerations: config.generation?.maxGenerations,
          gracePeriodMs: config.generation?.gracePeriodMs,
        });

        // 現在の設定を読み込み
        await configManager.loadNewConfig(config);

        // ステータスを表示
        const status = configManager.getGenerationStatus();
        console.log('\n🏨 === Generation Status ===');
        for (const gen of status) {
          const current = gen.isCurrent ? ' [CURRENT]' : '';
          console.log(`Generation ${gen.id}${current}`);
          console.log(`  Created: ${gen.createdAt.toISOString()}`);
          console.log(`  State: ${gen.state}`);
          console.log(`  References: ${gen.referenceCount}`);
        }

        await configManager.shutdown();
      } catch (error) {
        const safeError = await sanitizeLog(String(error));
        console.error('Failed to get status:', safeError);
        process.exit(1);
      }
    });
}
