#!/usr/bin/env node
/**
 * Hatago MCP Hub - CLI Entry Point
 *
 * This is the main entry point for npx execution.
 * Provides subcommands for server management and configuration.
 */

import { startServer, generateDefaultConfig } from '../../../server/src/index.js';
import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';

// Get package version
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  version: string;
};

// Create CLI program
const program = new Command();

program
  .name('hatago')
  .description('🏮 Hatago MCP Hub - Unified MCP server management')
  .version((packageJson as { version: string }).version);

// Init command
program
  .command('init')
  .description('Create a default hatago.config.json file')
  .option('-c, --config <path>', 'Path to configuration file', './hatago.config.json')
  .option('-f, --force', 'Overwrite existing configuration file')
  .option('-m, --mode <mode>', 'Integration mode (stdio or http)')
  .action(async (options: unknown) => {
    const opts = options as { config?: string; force?: boolean; mode?: string };
    const configPath = opts.config || './hatago.config.json';
    const force = opts.force || false;

    // Check if file already exists
    if (existsSync(configPath) && !force) {
      console.error(`❌ Configuration file already exists: ${configPath}`);
      console.error('   Use --force to overwrite');
      process.exit(1);
    }

    try {
      // Determine mode
      let mode = opts.mode;

      // If mode not specified, ask the user
      if (!mode) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          console.log('\nSelect integration mode:');
          console.log('1) STDIO mode (for Claude Code, Cursor, etc.)');
          console.log('2) HTTP mode (for development/debugging)');
          console.log('');
          rl.question('Enter your choice [1-2] (default: 1): ', (input) => {
            rl.close();
            resolve(input.trim() || '1');
          });
        });

        mode = answer === '2' ? 'http' : 'stdio';
      }

      // Generate default config
      const defaultConfig = generateDefaultConfig();

      // Write to file
      writeFileSync(configPath, defaultConfig);

      console.log(`\n✅ Created configuration file: ${configPath}`);
      console.log('');
      console.log('Next steps:');
      console.log(`1. Edit ${configPath} to configure your MCP servers`);
      console.log('2. Run the server:');

      if (mode === 'stdio') {
        console.log(`   hatago serve --stdio --config ${configPath}`);
        console.log('');
        console.log('For Claude Code integration, add to your .mcp.json:');
        console.log(
          JSON.stringify(
            {
              mcpServers: {
                hatago: {
                  command: 'npx',
                  args: ['@himorishige/hatago-mcp-hub', 'serve', '--stdio', '--config', configPath]
                }
              }
            },
            null,
            2
          )
        );
      } else {
        console.log(`   hatago serve --http --config ${configPath}`);
        console.log('');
        console.log('For HTTP mode testing:');
        console.log('  - Default endpoint: http://127.0.0.1:3535/mcp');
        console.log('  - SSE endpoint: http://127.0.0.1:3535/sse');
        console.log('  - Health check: http://127.0.0.1:3535/health');
        console.log('');
        console.log('You can use MCP Inspector to test:');
        console.log('  https://inspector.mcphub.com/');
      }

      // Exit successfully
      process.exit(0);
    } catch (error) {
      console.error(
        `❌ Failed to create configuration file: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  });

// Serve command
program
  .command('serve')
  .description('Start Hatago MCP Hub server')
  .option('--stdio', 'Run in STDIO mode (default)')
  .option('--http', 'Run in HTTP mode')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-p, --port <port>', 'Port for HTTP mode', '3535')
  .option('-h, --host <host>', 'Host for HTTP mode', '127.0.0.1')
  .option('--verbose', 'Enable verbose logging')
  .option('--quiet', 'Minimize output')
  .option('--watch', 'Watch configuration file for changes')
  .option('--tags <tags>', 'Filter servers by tags (comma-separated)')
  .action(async (options: unknown) => {
    try {
      const opts = options as {
        http?: boolean;
        config?: string;
        port?: string;
        host?: string;
        verbose?: boolean;
        quiet?: boolean;
        watch?: boolean;
        tags?: string;
      };

      // Determine mode
      const mode = opts.http ? 'http' : 'stdio';

      // Set log level
      const logLevel = opts.verbose ? 'debug' : opts.quiet ? 'error' : 'info';

      // Parse tags if provided
      const tags = opts.tags ? opts.tags.split(',').map((t) => t.trim()) : undefined;

      // Preflight: STDIO requires a config file. Check existence and fail immediately.
      if (mode === 'stdio') {
        const pathToCheck = opts.config || './hatago.config.json';
        const abs = isAbsolute(pathToCheck) ? pathToCheck : resolve(process.cwd(), pathToCheck);
        if (!existsSync(abs)) {
          console.error('\n❌ Configuration file not found');
          console.error('');
          console.error('   Create a configuration file with:');
          console.error('     hatago init');
          console.error('');
          console.error('   Or specify a different config file:');
          console.error('     hatago serve --config path/to/config.json');
          console.error('');
          process.exit(1);
        }
      }

      // Start server
      await startServer({
        mode,
        config: opts.config,
        port: opts.port ? parseInt(opts.port, 10) : 3535,
        host: opts.host || '127.0.0.1',
        logLevel,
        verbose: opts.verbose,
        quiet: opts.quiet,
        watchConfig: opts.watch,
        tags
      });
    } catch (error) {
      // Handle specific errors with cleaner messages
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('ENOENT') && errorMessage.includes('hatago.config.json')) {
        console.error('\n❌ Configuration file not found');
        console.error('');
        console.error('   Create a configuration file with:');
        console.error('     hatago init');
        console.error('');
        console.error('   Or specify a different config file:');
        console.error('     hatago serve --config path/to/config.json');
        console.error('');
      } else if (errorMessage.includes('ENOENT')) {
        console.error(`\n❌ File not found: ${errorMessage.split("'")[1] || 'unknown'}`);
      } else {
        console.error('Failed to start server:', error);
      }
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  program.help();
}
