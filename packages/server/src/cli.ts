#!/usr/bin/env node
/**
 * Hatago MCP Hub Server - CLI Entry Point
 *
 * Usage:
 *   npx @himorishige/hatago-server [options]
 *   npx @himorishige/hatago-server init [options]
 *   hatago [options]
 *   hatago init [options]
 *
 * Commands:
 *   init                 Create a default hatago.config.json
 *
 * Options:
 *   --stdio              Run in STDIO mode (default, for Claude Code)
 *   --http               Run in HTTP mode (for development/debugging)
 *   --config <path>      Path to configuration file
 *   --watch              Watch config file for changes and auto-reload
 *   --host <string>      Host to bind (HTTP mode only, default: 127.0.0.1)
 *   --port <number>      Port to bind (HTTP mode only, default: 3535)
 *   --log-level <level>  Log level (silent|error|warn|info|debug|trace)
 *   --help               Show help
 *   --version            Show version
 */

import { existsSync, writeFileSync } from 'node:fs';
import { loadConfig } from './config.js';
import { startHttp } from './http.js';
import { Logger } from './logger.js';
import { startStdio } from './stdio.js';
import { generateDefaultConfig, type ParsedArgs, parseArgs } from './utils.js';

function handleInitCommand(args: ParsedArgs) {
  const configPath = (args.flags.config as string) ?? './hatago.config.json';
  const force = args.flags.force as boolean;

  // Check if config file already exists
  if (existsSync(configPath) && !force) {
    console.error(`❌ Configuration file already exists: ${configPath}`);
    console.error('   Use --force to overwrite');
    process.exit(1);
  }

  try {
    const defaultConfig = generateDefaultConfig();
    writeFileSync(configPath, defaultConfig);
    console.log(`✅ Created configuration file: ${configPath}`);
    console.log('');
    console.log('Next steps:');
    console.log(`1. Edit ${configPath} to configure your MCP servers`);
    console.log('2. Run the server:');
    console.log(`   npx @himorishige/hatago-server --config ${configPath}`);
    console.log('');
    console.log('For Claude Code integration, add to your .mcp.json:');
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            hatago: {
              command: 'npx',
              args: ['@himorishige/hatago-server', '--stdio', '--config', configPath]
            }
          }
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      `❌ Failed to create configuration file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }

  // Exit after successful init
  process.exit(0);
}

function showHelp() {
  console.error(`
Hatago MCP Hub Server

Usage:
  npx @himorishige/hatago-server [command] [options]
  hatago [command] [options]

Commands:
  init                 Create a default hatago.config.json file

Options:
  --stdio              Run in STDIO mode (default, for Claude Code)
  --http               Run in HTTP mode (for development/debugging)
  --config <path>      Path to configuration file
  --watch              Watch config file for changes and auto-reload
  --host <string>      Host to bind (HTTP mode only, default: 127.0.0.1)
  --port <number>      Port to bind (HTTP mode only, default: 3535)
  --log-level <level>  Log level (silent|error|warn|info|debug|trace)
  --help               Show help
  --version            Show version

Init Options:
  --force              Overwrite existing configuration file

Environment Variables:
  HATAGO_CONFIG        Configuration file path
  HATAGO_HOST          HTTP server host
  HATAGO_PORT          HTTP server port
  HATAGO_LOG_LEVEL     Log level

Examples:
  # Create default configuration
  npx @himorishige/hatago-server init

  # Create configuration in custom location
  npx @himorishige/hatago-server init --config ./my-config.json

  # STDIO mode for Claude Code
  npx @himorishige/hatago-server --stdio

  # HTTP mode for development
  npx @himorishige/hatago-server --http --port 8080

  # With custom config
  npx @himorishige/hatago-server --config ./my-config.json
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Handle commands
  if (args.command === 'init' || args.flags.init) {
    await handleInitCommand(args);
    return;
  }

  // Help
  if (args.flags.help) {
    showHelp();
    process.exit(0);
  }

  // Version
  if (args.flags.version) {
    // Version will be injected during build or read from package.json
    console.error('0.0.7'); // TODO: Replace with actual version during build
    process.exit(0);
  }

  // Setup logger
  const logLevel = (args.flags['log-level'] as string) ?? process.env.HATAGO_LOG_LEVEL ?? 'info';
  const logger = new Logger(logLevel);

  try {
    // Load configuration
    const configPath =
      (args.flags.config as string) ?? process.env.HATAGO_CONFIG ?? './hatago.config.json';
    const config = await loadConfig(configPath, logger);

    // Determine mode (default: stdio for Claude Code compatibility)
    const mode = args.flags.stdio ? 'stdio' : args.flags.http ? 'http' : 'stdio';

    // Get watch flag
    const watchConfig = args.flags.watch as boolean;

    if (mode === 'stdio') {
      logger.debug('Starting in STDIO mode');
      await startStdio(config, logger, watchConfig);
    } else {
      const host = (args.flags.host as string) ?? process.env.HATAGO_HOST ?? '127.0.0.1';
      const port = Number(args.flags.port ?? process.env.HATAGO_PORT ?? 3535);

      logger.debug(`Starting in HTTP mode on ${host}:${port}`);
      await startHttp({
        config,
        host,
        port,
        logger,
        watchConfig
      });
    }
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
      console.error(`\n❌ File not found: ${errorMessage.split("'")[1] ?? 'unknown'}`);
    } else {
      logger.error('Failed to start server:', errorMessage);
    }
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
