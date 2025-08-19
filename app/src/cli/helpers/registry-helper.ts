/**
 * Helper functions for CLI commands to manage registry and workspace
 */

import chalk from 'chalk';
import { ServerRegistry } from '../../servers/server-registry.js';
import { WorkspaceManager } from '../../servers/workspace-manager.js';

/**
 * Registry context for CLI operations
 */
export interface RegistryContext {
  workspaceManager: WorkspaceManager;
  registry: ServerRegistry;
}

/**
 * Initialize workspace manager and registry
 */
export async function initializeRegistry(config?: {
  autoStart?: boolean;
  healthCheckIntervalMs?: number;
}): Promise<RegistryContext> {
  const workspaceManager = new WorkspaceManager();
  await workspaceManager.initialize();

  const registry = new ServerRegistry(workspaceManager, config);
  await registry.initialize();

  return { workspaceManager, registry };
}

/**
 * Cleanup registry and workspace manager
 */
export async function cleanupRegistry(context: RegistryContext): Promise<void> {
  await context.registry.shutdown();
  await context.workspaceManager.shutdown();
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
