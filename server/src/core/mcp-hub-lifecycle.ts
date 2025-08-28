/**
 * Lifecycle management for MCP Hub
 */

import type { SessionManager } from '@hatago/runtime';
import type { HatagoConfig } from '../config/types.js';
import type { Platform } from '../platform/types.js';
import type { ServerRegistry } from '../servers/server-registry.js';
import type { RegistryStorage } from '../storage/registry-storage.js';
import { logger } from '../utils/logger.js';
import type { McpHubConnectionManager } from './mcp-hub-connections.js';

/**
 * Lifecycle manager configuration
 */
export interface LifecycleManagerConfig {
  platform: Platform;
  config: HatagoConfig;
  storage?: RegistryStorage;
  sessionManager: SessionManager;
  serverRegistry: ServerRegistry;
  connectionManager: McpHubConnectionManager;
  saveInterval?: number;
}

/**
 * Manages MCP Hub lifecycle
 */
export class McpHubLifecycleManager {
  private platform: Platform;
  private config: HatagoConfig;
  private storage?: RegistryStorage;
  private sessionManager: SessionManager;
  private serverRegistry: ServerRegistry;
  private connectionManager: McpHubConnectionManager;
  private saveInterval: number;
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private saveTimer?: ReturnType<typeof setInterval>;
  private isInitialized: boolean = false;
  private isShuttingDown: boolean = false;

  constructor(config: LifecycleManagerConfig) {
    this.platform = config.platform;
    this.config = config.config;
    this.storage = config.storage;
    this.sessionManager = config.sessionManager;
    this.serverRegistry = config.serverRegistry;
    this.connectionManager = config.connectionManager;
    this.saveInterval = config.saveInterval || 60000; // Default 1 minute
  }

  /**
   * Initialize MCP Hub
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('MCP Hub already initialized');
      return;
    }

    logger.info('Initializing MCP Hub...');

    try {
      // Load registries from storage
      if (this.storage) {
        await this.loadRegistries();
      }

      // Connect to configured servers
      await this.connectConfiguredServers();

      // Start periodic tasks
      this.startPeriodicTasks();

      // Setup shutdown handlers
      this.setupShutdownHandlers();

      this.isInitialized = true;
      logger.info('MCP Hub initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MCP Hub:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up MCP Hub resources...');

    try {
      // Stop periodic tasks
      this.stopPeriodicTasks();

      // Save registries
      if (this.storage) {
        await this.saveRegistries();
      }

      // Clean expired sessions
      this.sessionManager.removeExpired();

      logger.info('Cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup:', error);
      // Don't throw, continue with shutdown
    }
  }

  /**
   * Shutdown MCP Hub
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down MCP Hub...');

    try {
      // Perform cleanup
      await this.cleanup();

      // Disconnect all servers
      await this.connectionManager.disconnectAll();

      // Clear all sessions
      this.sessionManager.clearSessions();

      // Final save
      if (this.storage) {
        await this.saveRegistries();
      }

      logger.info('MCP Hub shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    } finally {
      this.isShuttingDown = false;
      this.isInitialized = false;
    }
  }

  /**
   * Check if hub is ready
   */
  isReady(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }

  /**
   * Get lifecycle status
   */
  getStatus(): {
    initialized: boolean;
    shuttingDown: boolean;
    uptime: number;
    sessionCount: number;
    serverCount: number;
  } {
    return {
      initialized: this.isInitialized,
      shuttingDown: this.isShuttingDown,
      uptime: process.uptime(),
      sessionCount: this.sessionManager.getActiveSessionCount(),
      serverCount: this.serverRegistry.getAllServerIds().length,
    };
  }

  /**
   * Load registries from storage
   */
  private async loadRegistries(): Promise<void> {
    if (!this.storage) return;

    try {
      logger.info('Loading registries from storage');
      const data = await this.storage.load();

      if (data.servers && data.servers.length > 0) {
        logger.info(`Loaded ${data.servers.length} server configurations`);
        // Server connections will be established in connectConfiguredServers
      }
    } catch (error) {
      logger.warn('Failed to load registries:', error);
      // Continue with empty registries
    }
  }

  /**
   * Save registries to storage
   */
  private async saveRegistries(): Promise<void> {
    if (!this.storage) return;

    try {
      const servers = this.serverRegistry
        .getAllServerIds()
        .map((id) => {
          const info = this.serverRegistry.getServer(id);
          return info?.config;
        })
        .filter(Boolean);

      await this.storage.save({ servers });
      logger.debug('Registries saved to storage');
    } catch (error) {
      logger.error('Failed to save registries:', error);
    }
  }

  /**
   * Connect to configured servers
   */
  private async connectConfiguredServers(): Promise<void> {
    const servers = this.config.servers || [];

    if (servers.length === 0) {
      logger.info('No servers configured');
      return;
    }

    logger.info(`Connecting to ${servers.length} configured servers`);

    const results = await Promise.allSettled(
      servers.map((server) => this.connectionManager.connectServer(server)),
    );

    const successes = results.filter((r) => r.status === 'fulfilled').length;
    const failures = results.filter((r) => r.status === 'rejected').length;

    logger.info(`Connected to ${successes}/${servers.length} servers`);

    if (failures > 0) {
      logger.warn(`Failed to connect to ${failures} servers`);
    }
  }

  /**
   * Start periodic tasks
   */
  private startPeriodicTasks(): void {
    // Session cleanup every minute
    this.cleanupInterval = setInterval(() => {
      try {
        const removed = this.sessionManager.removeExpired();
        if (removed > 0) {
          logger.debug(`Removed ${removed} expired sessions`);
        }
      } catch (error) {
        logger.error('Error during session cleanup:', error);
      }
    }, 60000);

    // Registry save at configured interval
    if (this.storage) {
      this.saveTimer = setInterval(() => {
        this.saveRegistries().catch((error) => {
          logger.error('Failed to save registries:', error);
        });
      }, this.saveInterval);
    }
  }

  /**
   * Stop periodic tasks
   */
  private stopPeriodicTasks(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  /**
   * Setup shutdown handlers
   */
  private setupShutdownHandlers(): void {
    // Handle process termination
    const handleShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, initiating graceful shutdown`);

      try {
        await this.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error('Shutdown error:', error);
        process.exit(1);
      }
    };

    // Register handlers
    process.once('SIGINT', () => handleShutdown('SIGINT'));
    process.once('SIGTERM', () => handleShutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.shutdown().finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection:', reason);
      this.shutdown().finally(() => process.exit(1));
    });
  }
}

/**
 * Create lifecycle manager
 */
export function createLifecycleManager(
  config: LifecycleManagerConfig,
): McpHubLifecycleManager {
  return new McpHubLifecycleManager(config);
}
