/**
 * Serve command - Start the Hatago MCP Hub server
 */

import { startServer } from '@hatago/server';
import type { Command } from 'commander';

interface ServeOptions {
  mode?: 'stdio' | 'http';
  config?: string;
  port?: string;
  host?: string;
  verbose?: boolean;
  quiet?: boolean;
  stdio?: boolean;
  http?: boolean;
}

export function setupServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the MCP Hub server')
    .option('-m, --mode <mode>', 'server mode (stdio or http)', 'stdio')
    .option('-c, --config <path>', 'path to configuration file')
    .option('-p, --port <port>', 'port to listen on (http mode)', '3929')
    .option('-h, --host <host>', 'host to bind to (http mode)', '127.0.0.1')
    .option('--stdio', 'use STDIO transport (default)')
    .option('--http', 'use HTTP transport')
    .option('--verbose', 'verbose output')
    .option('--quiet', 'quiet output')
    .action(async (options: ServeOptions) => {
      try {
        // Determine mode from flags
        let mode: 'stdio' | 'http' = 'stdio';
        if (options.http) {
          mode = 'http';
        } else if (options.mode) {
          mode = options.mode as 'stdio' | 'http';
        }

        // Determine log level
        const logLevel = options.quiet
          ? 'error'
          : options.verbose
            ? 'debug'
            : 'info';

        // Start server using @hatago/server
        await startServer({
          mode,
          config: options.config,
          port: options.port ? parseInt(options.port, 10) : 3929,
          host: options.host || '127.0.0.1',
          logLevel,
          verbose: options.verbose,
          quiet: options.quiet,
        });
      } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
      }
    });
}
