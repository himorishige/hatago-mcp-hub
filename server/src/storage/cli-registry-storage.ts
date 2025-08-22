/**
 * CLI Registry Storage - Persists CLI-added MCP servers
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { type ServerConfig, ServerConfigSchema } from '../config/types.js';
import { ErrorHelpers } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({
  component: 'cli-registry-storage',
  destination: process.stderr,
});

/**
 * CLI Server Entry Schema
 */
const CliServerEntrySchema = z.object({
  id: z.string(),
  type: z.enum(['local', 'npx', 'remote']),
  config: ServerConfigSchema,
  addedAt: z.string(),
  modifiedAt: z.string(),
});

/**
 * CLI Registry Schema
 */
const CliRegistrySchema = z.object({
  version: z.number(),
  servers: z.array(CliServerEntrySchema),
  lastModified: z.string(),
});

/**
 * CLI Registry format
 */
type CliRegistry = z.infer<typeof CliRegistrySchema>;

/**
 * Individual server entry in CLI registry
 */
type _CliServerEntry = z.infer<typeof CliServerEntrySchema>;

/**
 * Storage for CLI-added servers
 */
export class CliRegistryStorage {
  private filePath: string;
  private lockPath: string;
  private registry: CliRegistry | null = null;
  private readonly lockTimeout = 5000; // 5 seconds timeout for lock
  private readonly lockRetryInterval = 100; // Retry every 100ms

  constructor(filePath = '.hatago/cli-registry.json') {
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
        // Try to create lock file exclusively
        await writeFile(this.lockPath, process.pid.toString(), { flag: 'wx' });
        return;
      } catch {
        // Lock file exists, check if it's stale
        try {
          const lockStat = await stat(this.lockPath);
          const lockAge = Date.now() - lockStat.mtimeMs;

          // If lock is older than timeout, remove it
          if (lockAge > this.lockTimeout) {
            await this.releaseLock();
            continue;
          }
        } catch {
          // Lock file doesn't exist, retry
        }

        // Wait before retrying
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
      await unlink(this.lockPath);
    } catch (error) {
      // Ignore if lock file doesn't exist
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
   * Initialize storage and create directory if needed
   */
  async initialize(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    // Load existing registry if it exists
    if (existsSync(this.filePath)) {
      await this.load();
    } else {
      // Create empty registry
      this.registry = {
        version: 1,
        servers: [],
        lastModified: new Date().toISOString(),
      };
      await this.save();
    }
  }

  /**
   * Load registry from file
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate with Zod schema
      const validated = CliRegistrySchema.parse(parsed);
      this.registry = validated;

      logger.debug(
        `Loaded ${this.registry.servers.length} servers from CLI registry`,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid CLI registry format:', error.errors);
      } else {
        logger.error('Failed to load CLI registry:', error);
      }
      // Create empty registry on error
      this.registry = {
        version: 1,
        servers: [],
        lastModified: new Date().toISOString(),
      };
    }
  }

  /**
   * Save registry to file
   */
  async save(): Promise<void> {
    if (!this.registry) {
      return;
    }

    await this.withLock(async () => {
      try {
        if (!this.registry) return;
        this.registry.lastModified = new Date().toISOString();
        const content = JSON.stringify(this.registry, null, 2);
        await writeFile(this.filePath, content, 'utf-8');
        logger.debug(
          `Saved ${this.registry.servers.length} servers to CLI registry`,
        );
      } catch (error) {
        logger.error('Failed to save CLI registry:', error);
        throw error;
      }
    });
  }

  /**
   * Add or update a server
   */
  async addServer(config: ServerConfig): Promise<void> {
    if (!this.registry) {
      await this.initialize();
    }

    await this.withLock(async () => {
      // Re-load to get latest state
      if (existsSync(this.filePath)) {
        await this.load();
      }

      const now = new Date().toISOString();

      // Check if server already exists
      const existingIndex = this.registry?.servers.findIndex(
        (s) => s.id === config.id,
      );

      if (existingIndex !== undefined && existingIndex >= 0 && this.registry) {
        // Update existing server
        const addedAt = this.registry.servers[existingIndex].addedAt;
        this.registry.servers[existingIndex] = {
          id: config.id,
          type: config.type,
          config,
          addedAt,
          modifiedAt: now,
        };
        logger.info(`Updated server ${config.id} in CLI registry`);
      } else if (this.registry) {
        // Add new server
        this.registry.servers.push({
          id: config.id,
          type: config.type,
          config,
          addedAt: now,
          modifiedAt: now,
        });
        logger.info(`Added server ${config.id} to CLI registry`);
      }

      // Save directly without calling save() to avoid nested locks
      if (this.registry) {
        this.registry.lastModified = new Date().toISOString();
        const content = JSON.stringify(this.registry, null, 2);
        await writeFile(this.filePath, content, 'utf-8');
      }
    });
  }

  /**
   * Remove a server
   */
  async removeServer(id: string): Promise<boolean> {
    if (!this.registry) {
      await this.initialize();
    }

    return await this.withLock(async () => {
      // Re-load to get latest state
      if (existsSync(this.filePath)) {
        await this.load();
      }

      if (!this.registry) {
        return false;
      }

      const initialLength = this.registry.servers.length;
      this.registry.servers = this.registry.servers.filter((s) => s.id !== id);

      if (this.registry.servers.length < initialLength) {
        // Save directly without calling save() to avoid nested locks
        this.registry.lastModified = new Date().toISOString();
        const content = JSON.stringify(this.registry, null, 2);
        await writeFile(this.filePath, content, 'utf-8');
        logger.info(`Removed server ${id} from CLI registry`);
        return true;
      }

      return false;
    });
  }

  /**
   * Get all servers
   */
  async getServers(): Promise<ServerConfig[]> {
    if (!this.registry) {
      await this.initialize();
    }

    return this.registry?.servers.map((s) => s.config);
  }

  /**
   * Get a specific server
   */
  async getServer(id: string): Promise<ServerConfig | undefined> {
    if (!this.registry) {
      await this.initialize();
    }

    const entry = this.registry?.servers.find((s) => s.id === id);
    return entry?.config;
  }

  /**
   * Check if a server exists
   */
  async hasServer(id: string): Promise<boolean> {
    if (!this.registry) {
      await this.initialize();
    }

    return this.registry?.servers.some((s) => s.id === id);
  }

  /**
   * Clear all servers
   */
  async clear(): Promise<void> {
    this.registry = {
      version: 1,
      servers: [],
      lastModified: new Date().toISOString(),
    };
    await this.save();
    logger.info('Cleared all servers from CLI registry');
  }

  /**
   * Get registry metadata
   */
  async getMetadata(): Promise<{
    version: number;
    serverCount: number;
    lastModified: string;
  }> {
    if (!this.registry) {
      await this.initialize();
    }

    return {
      version: this.registry?.version,
      serverCount: this.registry?.servers.length,
      lastModified: this.registry?.lastModified,
    };
  }
}
