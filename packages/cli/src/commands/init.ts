/**
 * Init command - Initialize Hatago configuration
 */

import { existsSync, writeFileSync } from 'node:fs';
import { generateDefaultConfig } from '@himorishige/hatago-server';
import type { Command } from 'commander';

interface InitOptions {
  config?: string;
  force?: boolean;
  verbose?: boolean;
}

export function setupInitCommand(program: Command): void {
  program
    .command('init')
    .description('Create a default hatago.config.json file')
    .option('-c, --config <path>', 'path to configuration file', './hatago.config.json')
    .option('-f, --force', 'overwrite existing configuration file')
    .option('--verbose', 'verbose output')
    .action((options: InitOptions) => {
      const configPath = options.config ?? './hatago.config.json';
      const force = options.force ?? false;

      // Check if file already exists
      if (existsSync(configPath) && !force) {
        console.error(`❌ Configuration file already exists: ${configPath}`);
        console.error('   Use --force to overwrite');
        process.exit(1);
      }

      try {
        // Generate default config
        const defaultConfig = generateDefaultConfig();

        // Write to file
        writeFileSync(configPath, defaultConfig);

        console.log(`✅ Created configuration file: ${configPath}`);
        console.log('');
        console.log('Next steps:');
        console.log(`1. Edit ${configPath} to configure your MCP servers`);
        console.log('2. Run the server:');
        console.log(`   hatago serve --config ${configPath}`);
        console.log('');
        console.log('For Claude Code integration, add to your .mcp.json:');
        console.log(
          JSON.stringify(
            {
              mcpServers: {
                hatago: {
                  command: 'npx',
                  args: ['@himorishige/hatago-cli', 'serve', '--stdio', '--config', configPath]
                }
              }
            },
            null,
            2
          )
        );
      } catch (error) {
        console.error(
          `❌ Failed to create configuration file: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });
}
