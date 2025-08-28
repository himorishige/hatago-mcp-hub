/**
 * Serve command - Start the Hatago MCP Hub server
 */

import type { Command } from 'commander';
import { StdioTransport } from '@hatago/transport';

interface ServeOptions {
  mode?: 'stdio' | 'http';
  config?: string;
  port?: number;
  host?: string;
  verbose?: boolean;
  quiet?: boolean;
}

export function setupServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the MCP Hub server')
    .option('-m, --mode <mode>', 'server mode (stdio or http)', 'stdio')
    .option('-c, --config <path>', 'path to configuration file')
    .option('-p, --port <port>', 'port to listen on (http mode)', '3000')
    .option('-h, --host <host>', 'host to bind to (http mode)', '127.0.0.1')
    .option('--stdio', 'use STDIO transport (default)')
    .option('--http', 'use HTTP transport')
    .option('--verbose', 'verbose output')
    .option('--quiet', 'quiet output')
    .action(async (options: ServeOptions) => {
      // Determine mode from flags
      if (options.http) {
        options.mode = 'http';
      } else if (options.stdio) {
        options.mode = 'stdio';
      }

      console.log(`Starting Hatago MCP Hub in ${options.mode} mode...`);

      if (options.mode === 'stdio') {
        await startStdioServer(options);
      } else {
        await startHttpServer(options);
      }
    });
}

async function startStdioServer(options: ServeOptions): Promise<void> {
  console.log('Starting STDIO server...');
  
  // Create and start STDIO transport
  const transport = new StdioTransport({
    command: process.argv[0],
    args: process.argv.slice(1)
  });

  await transport.connect();
  console.log('STDIO server started');
}

async function startHttpServer(options: ServeOptions): Promise<void> {
  const port = parseInt(options.port || '3000', 10);
  const host = options.host || '127.0.0.1';
  
  console.log(`Starting HTTP server on ${host}:${port}...`);
  
  // HTTP server implementation will be imported from main server package
  const { startHttpServer } = await import('../../../../server/src/cli/commands/serve.js');
  await startHttpServer({
    port,
    host,
    config: options.config,
    verbose: options.verbose,
    quiet: options.quiet
  });
}