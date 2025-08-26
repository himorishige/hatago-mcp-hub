/**
 * CLI common utilities and helpers
 */

import type { MinimalLogger } from '../../observability/minimal-logger.js';

type Logger = MinimalLogger;

import { loadConfig as baseLoadConfig } from '../../config/loader.js';
import type { HatagoConfig } from '../../config/types.js';
import { McpHub } from '../../core/mcp-hub.js';

/**
 * Load configuration with default CLI options
 */
export async function loadConfigWithDefaults(
  configPath?: string,
  options?: {
    quiet?: boolean;
    profile?: string;
  },
): Promise<HatagoConfig> {
  return baseLoadConfig(configPath, options);
}

/**
 * Create and initialize an MCP Hub instance
 */
export async function createAndInitializeHub(
  config: HatagoConfig,
  _logger?: Logger,
): Promise<McpHub> {
  const hub = new McpHub({ config });
  await hub.initialize();
  return hub;
}

/**
 * Handle CLI errors consistently
 */
export async function handleCliError(
  error: unknown,
  componentName: string,
): Promise<never> {
  const { logError, createLogger } = await import('../../utils/logger.js');
  const logger = createLogger({ component: componentName });
  logError(logger, error, `${componentName} failed`);
  process.exit(1);
}

/**
 * Setup console redirect for STDIO mode
 */
export function setupStdioRedirect(): void {
  const originalConsoleError = console.error;
  console.log = (...args: unknown[]) => {
    originalConsoleError('[STDIO-REDIRECT]', ...args);
  };
  console.warn = (...args: unknown[]) => {
    originalConsoleError('[STDIO-REDIRECT-WARN]', ...args);
  };
}

/**
 * Setup shutdown handlers
 */
export function setupShutdownHandlers(
  cleanup: () => Promise<void>,
  logger?: Logger,
): void {
  const handleShutdown = async (signal: string) => {
    if (logger) {
      logger.info(`Received ${signal}, shutting down...`);
    } else {
      console.log(`Received ${signal}, shutting down...`);
    }
    await cleanup();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

/**
 * Merge CLI servers with config servers
 */
export async function mergeCLIServers(
  config: HatagoConfig,
  logger?: Logger,
): Promise<void> {
  const { UnifiedFileStorage } = await import(
    '../../storage/unified-file-storage.js'
  );
  const cliStorage = new UnifiedFileStorage('.hatago/registry.json');
  await cliStorage.init();
  const cliServers = await cliStorage.getServers();

  // Merge servers (config has priority)
  const configServerIds = new Set((config.servers || []).map((s) => s.id));
  for (const cliServer of cliServers) {
    if (!configServerIds.has(cliServer.id)) {
      if (!config.servers) config.servers = [];
      config.servers.push(cliServer);
      if (logger) {
        logger.info(`Added CLI server: ${cliServer.id}`);
      }
    } else if (logger) {
      logger.warn(
        `CLI server '${cliServer.id}' skipped (name conflict with config)`,
      );
    }
  }
}
