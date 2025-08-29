#!/usr/bin/env node
/**
 * Hatago MCP Hub Server - CLI Entry Point
 * 
 * Usage:
 *   npx @hatago/server [options]
 *   hatago [options]
 * 
 * Options:
 *   --stdio              Run in STDIO mode (default, for Claude Code)
 *   --http               Run in HTTP mode (for development/debugging)
 *   --config <path>      Path to configuration file
 *   --host <string>      Host to bind (HTTP mode only, default: 127.0.0.1)
 *   --port <number>      Port to bind (HTTP mode only, default: 3929)
 *   --log-level <level>  Log level (silent|error|warn|info|debug|trace)
 *   --help               Show help
 *   --version            Show version
 */

import { parseArgs } from './utils.js';
import { startStdio } from './stdio.js';
import { startHttp } from './http.js';
import { loadConfig } from './config.js';
import { Logger } from './logger.js';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  // Help
  if (args.help) {
    console.log(`
Hatago MCP Hub Server

Usage:
  npx @hatago/server [options]
  hatago [options]

Options:
  --stdio              Run in STDIO mode (default, for Claude Code)
  --http               Run in HTTP mode (for development/debugging)
  --config <path>      Path to configuration file
  --host <string>      Host to bind (HTTP mode only, default: 127.0.0.1)
  --port <number>      Port to bind (HTTP mode only, default: 3929)
  --log-level <level>  Log level (silent|error|warn|info|debug|trace)
  --help               Show help
  --version            Show version

Environment Variables:
  HATAGO_CONFIG        Configuration file path
  HATAGO_HOST          HTTP server host
  HATAGO_PORT          HTTP server port
  HATAGO_LOG_LEVEL     Log level

Examples:
  # STDIO mode for Claude Code
  npx @hatago/server --stdio

  # HTTP mode for development
  npx @hatago/server --http --port 8080

  # With custom config
  npx @hatago/server --config ./my-config.json
`);
    process.exit(0);
  }
  
  // Version
  if (args.version) {
    // Version will be injected during build or read from package.json
    console.log('0.1.0'); // TODO: Replace with actual version during build
    process.exit(0);
  }
  
  // Setup logger
  const logLevel = args['log-level'] ?? process.env.HATAGO_LOG_LEVEL ?? 'info';
  const logger = new Logger(logLevel);
  
  try {
    // Load configuration
    const configPath = args.config ?? process.env.HATAGO_CONFIG ?? './hatago.config.json';
    const config = await loadConfig(configPath, logger);
    
    // Determine mode (default: stdio for Claude Code compatibility)
    const mode = args.stdio ? 'stdio' : args.http ? 'http' : 'stdio';
    
    if (mode === 'stdio') {
      logger.debug('Starting in STDIO mode');
      await startStdio(config, logger);
    } else {
      const host = args.host ?? process.env.HATAGO_HOST ?? '127.0.0.1';
      const port = Number(args.port ?? process.env.HATAGO_PORT ?? 3929);
      
      logger.debug(`Starting in HTTP mode on ${host}:${port}`);
      await startHttp({
        config,
        host,
        port,
        logger
      });
    }
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});