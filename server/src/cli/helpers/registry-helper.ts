/**
 * Helper functions for CLI commands to manage registry and workspace
 */

import chalk from 'chalk';
import { loadConfig } from '../../config/loader.js';
import { ServerRegistry } from '../../servers/server-registry.js';

import { UnifiedFileStorage } from '../../storage/unified-file-storage.js';

/**
 * Registry context for CLI operations
 */
export interface RegistryContext {
  registry: ServerRegistry;
  cliStorage: UnifiedFileStorage;
}

/**
 * Initialize workspace manager and registry
 */
export async function initializeRegistry(config?: {
  autoStart?: boolean;
  healthCheckIntervalMs?: number;
}): Promise<RegistryContext> {
  // Use .hatago/workspaces directory for workspace management

  // Create CLI storage
  const cliStorage = new UnifiedFileStorage('.hatago/registry.json');
  await cliStorage.init();

  // Create server registry with CLI storage for persistence
  const registry = new ServerRegistry(cliStorage, config);
  await registry.initialize();

  // Load servers from CLI registry
  const cliServers = await cliStorage.getServers();

  // Load servers from config file
  const configData = await loadConfig(undefined, { quiet: true });

  // Register config servers first (they have priority)
  for (const server of configData.servers || []) {
    try {
      await registry.registerServer(server);
    } catch (_error) {
      // Server might already be registered or other error
      // Continue with next server
    }
  }

  // Then register CLI servers (skip if name conflict)
  for (const server of cliServers) {
    try {
      await registry.registerServer(server);
    } catch (error) {
      // Skip if server already exists (name conflict)
      if (
        error instanceof Error &&
        error.message.includes('already registered')
      ) {
        console.warn(
          chalk.yellow(
            `⚠ CLI server '${server.id}' skipped (name conflict with config)`,
          ),
        );
      }
    }
  }

  return { registry, cliStorage };
}

/**
 * Cleanup registry and workspace manager
 */
export async function cleanupRegistry(context: RegistryContext): Promise<void> {
  await context.registry.onShutdown();
}

/**
 * Execute a CLI action with automatic registry setup and cleanup
 */
export async function withRegistry<T>(
  action: (context: RegistryContext) => Promise<T>,
  config?: {
    autoStart?: boolean;
    healthCheckIntervalMs?: number;
  },
): Promise<T> {
  const context = await initializeRegistry(config);

  try {
    return await action(context);
  } finally {
    await cleanupRegistry(context);
  }
}

/**
 * Handle CLI errors consistently
 */
export function handleCliError(error: unknown): never {
  console.error(
    chalk.red('Error:'),
    error instanceof Error ? error.message : String(error),
  );

  if (error instanceof Error && error.stack && process.env.DEBUG) {
    console.error(chalk.gray(error.stack));
  }

  process.exit(1);
}

/**
 * Format uptime for display
 */
export function formatUptime(uptimeMs?: number): string {
  if (!uptimeMs) {
    return '-';
  }

  const minutes = Math.floor(uptimeMs / 1000 / 60);
  const seconds = Math.floor(uptimeMs / 1000) % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Format server state with color
 */
export function formatServerState(state: string): string {
  switch (state) {
    case 'running':
      return chalk.green(state);
    case 'crashed':
      return chalk.red(state);
    case 'stopped':
      return chalk.gray(state);
    case 'starting':
    case 'stopping':
      return chalk.yellow(state);
    default:
      return state;
  }
}
