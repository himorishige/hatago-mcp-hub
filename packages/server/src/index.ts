/**
 * @himorishige/hatago-server - MCP Hub Server Implementation
 *
 * This package provides the core server functionality for Hatago MCP Hub.
 * It can be used as a library or run directly via CLI.
 */

import { loadConfig } from './config.js';
import { startHttp } from './http.js';
import { startStdio } from './stdio.js';

export { loadConfig } from './config.js';
export { startHttp } from './http.js';
export { Logger } from './logger.js';
export { startStdio } from './stdio.js';
export { generateDefaultConfig } from './utils.js';

/**
 * Server options for starting the MCP Hub
 */
export interface ServerOptions {
  mode?: 'stdio' | 'http';
  config?: string;
  host?: string;
  port?: number;
  logLevel?: string;
  verbose?: boolean;
  quiet?: boolean;
  watchConfig?: boolean;
  tags?: string[];
}

/**
 * Start the MCP Hub server with the given options
 */
export async function startServer(options: ServerOptions = {}): Promise<void> {
  const {
    mode = 'stdio',
    config: configPath = './hatago.config.json',
    host = '127.0.0.1',
    port = 3535,
    logLevel = 'info',
    verbose = false,
    quiet = false,
    watchConfig = false,
    tags
  } = options;

  // Create logger
  const { Logger } = await import('./logger.js');
  const finalLogLevel = quiet ? 'error' : verbose ? 'debug' : logLevel;
  const logger = new Logger(finalLogLevel);

  // Load configuration
  const config = await loadConfig(configPath, logger);

  // Simple policy: STDIO requires a config file. If it doesn't exist, fail fast.
  if (mode === 'stdio' && (config as { exists?: boolean }).exists === false) {
    const err: NodeJS.ErrnoException = new Error(
      `ENOENT: no such file or directory, open '${config.path}'`
    );
    err.code = 'ENOENT';
    throw err;
  }

  // Start server based on mode
  if (mode === 'stdio') {
    logger.debug('Starting in STDIO mode');
    await startStdio(config, logger, watchConfig, tags);
  } else if (mode === 'http') {
    logger.debug(`Starting in HTTP mode on ${host}:${port}`);
    await startHttp({
      config,
      host,
      port,
      logger,
      watchConfig,
      tags
    });
  } else {
    throw new Error(`Invalid mode: ${mode}`);
  }
}
