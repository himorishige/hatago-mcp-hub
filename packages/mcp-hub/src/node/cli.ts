#!/usr/bin/env node
/**
 * Hatago MCP Hub - CLI Entry Point
 *
 * This is the main entry point for npx execution.
 * Provides STDIO mode by default for MCP clients.
 */

import { startServer } from '../../../server/src/index.js';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Get package version
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
);

// Create CLI program
const program = new Command();

program
  .name('hatago')
  .description('Hatago MCP Hub - Unified MCP server management')
  .version(packageJson.version)
  .option('--stdio', 'Run in STDIO mode (default)')
  .option('--http', 'Run in HTTP mode')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-p, --port <port>', 'Port for HTTP mode', '3535')
  .option('-h, --host <host>', 'Host for HTTP mode', '127.0.0.1')
  .option('--verbose', 'Enable verbose logging')
  .option('--quiet', 'Minimize output')
  .option('--watch', 'Watch configuration file for changes')
  .action(async (options) => {
    try {
      // Determine mode
      const mode = options.http ? 'http' : 'stdio';

      // Set log level
      const logLevel = options.verbose
        ? 'debug'
        : options.quiet
          ? 'error'
          : 'info';

      // Start server
      await startServer({
        mode,
        config: options.config,
        port: parseInt(options.port, 10),
        host: options.host,
        logLevel,
        verbose: options.verbose,
        quiet: options.quiet,
        watchConfig: options.watch,
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  // Default to STDIO mode for npx execution
  startServer({
    mode: 'stdio',
    logLevel: 'info',
  }).catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
