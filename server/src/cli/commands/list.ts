/**
 * List command - List available tools
 */

import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { McpHub } from '../../core/mcp-hub.js';

export function createListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List available tools')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options) => {
      try {
        // Logger作成
        const { createLogger, getLogLevel } = await import(
          '../../utils/logger.js'
        );

        const logger = createLogger({
          level: getLogLevel({ quiet: false }),
          component: 'hatago-cli-list',
        });

        // 設定を読み込み
        const config = await loadConfig(options.config);

        // MCPハブを作成
        const hub = new McpHub({ config, logger });
        await hub.initialize();

        // ツール一覧を取得
        const _tools = hub.getRegistry().getAllTools();
        const debugInfo = hub.getRegistry().getDebugInfo();

        // 構造化ログとして出力
        logger.info(
          {
            totalServers: debugInfo.totalServers,
            totalTools: debugInfo.totalTools,
            namingStrategy: debugInfo.namingStrategy,
          },
          '🏨 MCP Hub Status',
        );

        if (debugInfo.collisions.length > 0) {
          logger.warn(
            { collisions: debugInfo.collisions },
            'Tool name collisions detected',
          );
        }

        logger.info({ tools: debugInfo.tools }, 'Available tools');

        // クリーンアップ
        await hub.shutdown();

        // Force process exit to avoid hanging
        process.exit(0);
      } catch (error) {
        const { logError, createLogger } = await import(
          '../../utils/logger.js'
        );
        const logger = createLogger({ component: 'hatago-cli-list' });
        logError(logger, error, 'Failed to list tools');
        process.exit(1);
      }
    });
}
