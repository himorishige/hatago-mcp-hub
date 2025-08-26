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
        // Use global logger
        const { logger } = await import(
          '../../observability/minimal-logger.js'
        );

        // 設定を読み込み
        const config = await loadConfig(options.config);

        // CLIレジストリから設定をマージ
        const { UnifiedFileStorage } = await import(
          '../../storage/unified-file-storage.js'
        );
        const cliStorage = new UnifiedFileStorage();
        await cliStorage.init();
        const cliServers = await cliStorage.getServers();

        // マージされた設定を作成
        const mergedConfig = {
          ...config,
          servers: [...(config.servers || []), ...(cliServers || [])],
        };

        // MCPハブを作成
        const hub = new McpHub({ config: mergedConfig });
        await hub.initialize();

        // ツール一覧を取得
        const _tools = hub.getRegistry().getAllTools();
        const debugInfo = hub.getRegistry().getDebugInfo();

        // 構造化ログとして出力
        logger.info('🏨 MCP Hub Status', {
          totalServers: debugInfo.totalServers,
          totalTools: debugInfo.totalTools,
          namingStrategy: debugInfo.namingStrategy,
        });

        if (debugInfo.collisions.length > 0) {
          logger.warn('Tool name collisions detected', {
            collisions: debugInfo.collisions,
          });
        }

        logger.info('Available tools', { tools: debugInfo.tools });

        // クリーンアップ
        await hub.shutdown();

        // Force process exit to avoid hanging
        process.exit(0);
      } catch (error) {
        const { logger } = await import(
          '../../observability/minimal-logger.js'
        );
        logger.error('Failed to list tools', { error });
        process.exit(1);
      }
    });
}
