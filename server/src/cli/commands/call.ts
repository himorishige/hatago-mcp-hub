/**
 * Call command - Call a tool directly
 */

import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { McpHub } from '../../core/mcp-hub.js';

export function createCallCommand(program: Command): void {
  program
    .command('call <tool>')
    .description('Call a tool directly')
    .option('-c, --config <path>', 'Path to config file')
    .option('-a, --args <json>', 'Tool arguments as JSON')
    .action(async (tool, options) => {
      try {
        // Logger作成
        const { createLogger, getLogLevel } = await import(
          '../../utils/logger.js'
        );

        const logger = createLogger({
          level: getLogLevel({ quiet: false }),
          component: 'hatago-cli-call',
        });

        // 設定を読み込み
        const config = await loadConfig(options.config);

        // MCPハブを作成
        const hub = new McpHub({ config, logger });
        await hub.initialize();

        // ツールを呼び出し
        const server = hub.getServer();
        const args = options.args ? JSON.parse(options.args) : {};

        logger.info({ tool, args }, 'Calling tool');

        const result = await server.callTool({
          params: {
            name: tool,
            arguments: args,
          },
        });

        console.log('\n🏨 === Tool Result ===');
        console.log(JSON.stringify(result, null, 2));

        // クリーンアップ
        await hub.shutdown();
      } catch (error) {
        const { logError, createLogger } = await import(
          '../../utils/logger.js'
        );
        const logger = createLogger({ component: 'hatago-cli-call' });
        logError(logger, error, 'Failed to call tool');
        process.exit(1);
      }
    });
}
