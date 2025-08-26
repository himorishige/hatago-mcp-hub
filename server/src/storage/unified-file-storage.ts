/**
 * Unified file-based storage for both CLI servers and runtime states
 */

import { existsSync, promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { ServerConfig } from '../config/types.js';
import { ServerConfigSchema } from '../config/types.js';
import { logger } from '../observability/minimal-logger.js';
import { ErrorHelpers } from '../utils/errors.js';
import type { RegistryStorage, ServerState } from './registry-storage.js';

/**
 * Server entry in registry
 */
const ServerEntrySchema = z.object({
  id: z.string(),
  type: z.enum(['local', 'npx', 'remote']),
  config: ServerConfigSchema,
  addedAt: z.string(),
  modifiedAt: z.string(),
});

/**
 * Unified registry schema
 */
const UnifiedRegistrySchema = z.object({
  version: z.number(),
  servers: z.array(ServerEntrySchema),
  states: z.record(z.string(), z.any()), // Server states
  lastModified: z.string(),
});

type UnifiedRegistry = z.infer<typeof UnifiedRegistrySchema>;

/**
 * Unified file storage implementation
 */
export class UnifiedFileStorage implements RegistryStorage {
  private filePath: string;
  private lockPath: string;
  private registry: UnifiedRegistry | null = null;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly saveDebounceMs = 1000;
  private readonly lockTimeout = 5000;
  private readonly lockRetryInterval = 100;

  constructor(filePath = '.hatago/registry.json') {
    this.filePath = filePath;
    this.lockPath = `${filePath}.lock`;
  }

  /**
   * Acquire file lock with timeout
   */
  private async acquireLock(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.lockTimeout) {
      try {
        await fs.writeFile(this.lockPath, process.pid.toString(), {
          flag: 'wx',
        });
        return;
      } catch {
        try {
          const lockStat = await fs.stat(this.lockPath);
          const lockAge = Date.now() - lockStat.mtimeMs;
          if (lockAge > this.lockTimeout) {
            await this.releaseLock();
            continue;
          }
        } catch {
          // Lock file doesn't exist, retry
        }
        await new Promise((resolve) =>
          setTimeout(resolve, this.lockRetryInterval),
        );
      }
    }
    throw ErrorHelpers.lockAcquisitionFailed(this.filePath, this.lockTimeout);
  }

  /**
   * Release file lock
   */
  private async releaseLock(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        logger.warn('Failed to release lock:', error);
      }
    }
  }

  /**
   * Execute operation with file lock
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquireLock();
    try {
      return await operation();
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Initialize storage
   */
  async init(): Promise<void> {
    const dir = dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    if (existsSync(this.filePath)) {
      await this.load();
    } else {
      this.registry = {
        version: 1,
        servers: [],
        states: {},
        lastModified: new Date().toISOString(),
      };
      await this.save();
    }
  }

  /**
   * Load registry from file
   */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      const validated = UnifiedRegistrySchema.parse(parsed);

      // Convert date strings in states back to Date objects
      for (const state of Object.values(validated.states) as ServerState[]) {
        if (state.lastStartedAt) {
          state.lastStartedAt = new Date(
            state.lastStartedAt as unknown as string,
          );
        }
        if (state.lastStoppedAt) {
          state.lastStoppedAt = new Date(
            state.lastStoppedAt as unknown as string,
          );
        }
        if (state.lastFailureAt) {
          state.lastFailureAt = new Date(
            state.lastFailureAt as unknown as string,
          );
        }
      }

      this.registry = validated;
      logger.debug(
        `Loaded ${this.registry.servers.length} servers from registry`,
      );
    } catch (error) {
      logger.error('Failed to load registry:', error);
      this.registry = {
        version: 1,
        servers: [],
        states: {},
        lastModified: new Date().toISOString(),
      };
    }
  }

  /**
   * Save registry to file
   */
  private async save(): Promise<void> {
    if (!this.registry) return;

    try {
      this.registry.lastModified = new Date().toISOString();
      const content = JSON.stringify(this.registry, null, 2);
      await fs.writeFile(this.filePath, content, 'utf-8');
    } catch (error) {
      logger.error('Failed to save registry:', error);
    }
  }

  /**
   * Debounced save
   */
  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.save().catch(console.error);
      this.saveDebounceTimer = null;
    }, this.saveDebounceMs);
  }

  // === Server Configuration Methods ===

  /**
   * Add or update a server
   */
  async addServer(config: ServerConfig): Promise<void> {
    if (!this.registry) await this.init();

    await this.withLock(async () => {
      if (existsSync(this.filePath)) await this.load();
      if (!this.registry) return;

      const now = new Date().toISOString();
      const existingIndex = this.registry.servers.findIndex(
        (s) => s.id === config.id,
      );

      if (existingIndex >= 0) {
        const addedAt = this.registry.servers[existingIndex].addedAt;
        this.registry.servers[existingIndex] = {
          id: config.id,
          type: config.type,
          config,
          addedAt,
          modifiedAt: now,
        };
        logger.info(`Updated server ${config.id}`);
      } else {
        this.registry.servers.push({
          id: config.id,
          type: config.type,
          config,
          addedAt: now,
          modifiedAt: now,
        });
        logger.info(`Added server ${config.id}`);
      }

      await this.save();
    });
  }

  /**
   * Remove a server
   */
  async removeServer(id: string): Promise<boolean> {
    if (!this.registry) await this.init();

    return await this.withLock(async () => {
      if (existsSync(this.filePath)) await this.load();
      if (!this.registry) return false;

      const initialLength = this.registry.servers.length;
      this.registry.servers = this.registry.servers.filter((s) => s.id !== id);

      // Also remove the state
      delete this.registry.states[id];

      if (this.registry.servers.length < initialLength) {
        await this.save();
        logger.info(`Removed server ${id}`);
        return true;
      }
      return false;
    });
  }

  /**
   * Get all servers
   */
  async getServers(): Promise<ServerConfig[]> {
    if (!this.registry) await this.init();
    return this.registry?.servers.map((s) => s.config) || [];
  }

  /**
   * Get a specific server
   */
  async getServer(id: string): Promise<ServerConfig | undefined> {
    if (!this.registry) await this.init();
    const entry = this.registry?.servers.find((s) => s.id === id);
    return entry?.config;
  }

  /**
   * Check if a server exists
   */
  async hasServer(id: string): Promise<boolean> {
    if (!this.registry) await this.init();
    return this.registry?.servers.some((s) => s.id === id) || false;
  }

  // === Server State Methods ===

  async saveServerState(serverId: string, state: ServerState): Promise<void> {
    if (!this.registry) await this.init();
    if (!this.registry) return;

    this.registry.states[serverId] = state;
    this.debouncedSave();
  }

  async getServerState(serverId: string): Promise<ServerState | null> {
    if (!this.registry) await this.init();
    return (this.registry?.states[serverId] as ServerState) || null;
  }

  async getAllServerStates(): Promise<Map<string, ServerState>> {
    if (!this.registry) await this.init();
    const states = new Map<string, ServerState>();
    if (this.registry) {
      for (const [id, state] of Object.entries(this.registry.states)) {
        states.set(id, state as ServerState);
      }
    }
    return states;
  }

  async deleteServerState(serverId: string): Promise<void> {
    if (!this.registry) await this.init();
    if (!this.registry) return;

    delete this.registry.states[serverId];
    this.debouncedSave();
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    this.registry = {
      version: 1,
      servers: [],
      states: {},
      lastModified: new Date().toISOString(),
    };
    await this.save();
    logger.info('Cleared all data from registry');
  }

  /**
   * Close storage
   */
  async close(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      await this.save();
    }
  }

  /**
   * Get metadata
   */
  async getMetadata(): Promise<{
    version: number;
    serverCount: number;
    lastModified: string;
  }> {
    if (!this.registry) await this.init();
    return {
      version: this.registry?.version || 1,
      serverCount: this.registry?.servers.length || 0,
      lastModified: this.registry?.lastModified || new Date().toISOString(),
    };
  }
}
