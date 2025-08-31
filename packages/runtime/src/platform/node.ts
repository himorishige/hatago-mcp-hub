/**
 * Node.js platform implementation
 *
 * Provides Node.js-specific implementations of platform features,
 * including file system access and process spawning.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ConfigStore,
  Platform,
  PlatformOptions,
  SessionStore,
  SpawnOptions
} from './types.js';

/**
 * File-based configuration storage for Node.js
 */
class FileConfigStore implements ConfigStore {
  constructor(private basePath: string) {}

  async get(key: string): Promise<unknown> {
    try {
      const filePath = path.join(this.basePath, `${key}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const filePath = path.join(this.basePath, `${key}.json`);
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2));
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.basePath, `${key}.json`);
    await fs.unlink(filePath).catch(() => {});
  }

  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }
}

/**
 * Memory-based session storage for Node.js
 * In production, this could be replaced with Redis or similar
 */
class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, { data: unknown; expires: number }>();
  private ttl: number;

  constructor(ttl: number = 3600000) {
    // 1 hour default
    this.ttl = ttl;
    // Clean up expired sessions periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async create(id: string, data: unknown): Promise<void> {
    this.sessions.set(id, {
      data,
      expires: Date.now() + this.ttl
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async get(id: string): Promise<unknown> {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (Date.now() > session.expires) {
      this.sessions.delete(id);
      return null;
    }
    return session.data;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async update(id: string, data: unknown): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.data = {
        ...(session.data as Record<string, unknown>),
        ...(data as Record<string, unknown>)
      };
      session.expires = Date.now() + this.ttl;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async exists(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (Date.now() > session.expires) {
      this.sessions.delete(id);
      return false;
    }
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async list(): Promise<string[]> {
    this.cleanup();
    return Array.from(this.sessions.keys());
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now > session.expires) {
        this.sessions.delete(id);
      }
    }
  }
}

/**
 * Create Node.js platform implementation
 */
export function createNodePlatform(options: PlatformOptions = {}): Platform {
  const configPath = options.storage?.configPath || '.hatago/config';
  const sessionTTL = options.storage?.sessionTTL || 3600000;

  return {
    // Core features
    randomUUID,
    getEnv: (key: string) => process.env[key],

    // Node.js specific capabilities
    spawn: (opts: SpawnOptions): ChildProcess => {
      return spawn(opts.command, opts.args || [], {
        env: { ...process.env, ...opts.env },
        cwd: opts.cwd,
        stdio: 'pipe'
      });
    },

    readFile: async (filePath: string): Promise<string> => {
      return await fs.readFile(filePath, 'utf-8');
    },

    writeFile: async (filePath: string, content: string): Promise<void> => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
    },

    // Storage implementations
    storage: {
      config: new FileConfigStore(configPath),
      session: new MemorySessionStore(sessionTTL)
    },

    // Platform identification
    name: 'node',

    // Capability flags
    capabilities: {
      hasFileSystem: true,
      hasProcessSpawn: true,
      hasWebCrypto: true,
      hasDurableObjects: false,
      hasKVStorage: false
    }
  };
}

/**
 * Default Node.js platform instance
 */
export const nodePlatform = createNodePlatform();
