/**
 * Node.js Storage implementation using file system
 */
import { existsSync, promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Storage } from '../types.js';

/**
 * File-based storage implementation for Node.js
 */
export class FileStorage implements Storage {
  private basePath: string;

  constructor(basePath = '.hatago/storage') {
    this.basePath = basePath;
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const filePath = this.getFilePath(key);
    try {
      const buffer = await fs.readFile(filePath);
      return new Uint8Array(buffer);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async put(
    key: string,
    value: Uint8Array,
    opts?: { ttlSeconds?: number },
  ): Promise<void> {
    const filePath = this.getFilePath(key);
    const dir = dirname(filePath);

    // Create directory if it doesn't exist
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Write file
    await fs.writeFile(filePath, value);

    // If TTL is specified, store expiry time
    if (opts?.ttlSeconds) {
      const expiryPath = `${filePath}.expires`;
      const expiryTime = Date.now() + opts.ttlSeconds * 1000;
      await fs.writeFile(expiryPath, expiryTime.toString());
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
      // Also delete expiry file if exists
      await fs.unlink(`${filePath}.expires`).catch(() => {});
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async *list(prefix?: string): AsyncIterable<{ key: string; size?: number }> {
    const searchPath = prefix ? join(this.basePath, prefix) : this.basePath;

    // Create directory if it doesn't exist
    if (!existsSync(searchPath)) {
      return;
    }

    async function* walkDir(
      dir: string,
      baseDir: string,
    ): AsyncIterable<{ key: string; size?: number }> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          yield* walkDir(fullPath, baseDir);
        } else if (entry.isFile() && !entry.name.endsWith('.expires')) {
          // Check if file is expired
          const expiryPath = `${fullPath}.expires`;
          if (existsSync(expiryPath)) {
            const expiryTime = parseInt(
              await fs.readFile(expiryPath, 'utf-8'),
              10,
            );
            if (Date.now() > expiryTime) {
              // Clean up expired file
              await fs.unlink(fullPath).catch(() => {});
              await fs.unlink(expiryPath).catch(() => {});
              continue;
            }
          }

          const stats = await fs.stat(fullPath);
          const key = fullPath
            .substring(baseDir.length + 1)
            .replace(/\\/g, '/');
          yield { key, size: stats.size };
        }
      }
    }

    yield* walkDir(searchPath, this.basePath);
  }

  private getFilePath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitized = key.replace(/\.\./g, '').replace(/^\//, '');
    return join(this.basePath, sanitized);
  }
}

/**
 * In-memory storage implementation (for testing)
 */
export class MemoryStorage implements Storage {
  private store = new Map<string, { data: Uint8Array; expires?: number }>();

  async get(key: string): Promise<Uint8Array | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expires && Date.now() > entry.expires) {
      this.store.delete(key);
      return undefined;
    }

    return entry.data;
  }

  async put(
    key: string,
    value: Uint8Array,
    opts?: { ttlSeconds?: number },
  ): Promise<void> {
    const expires = opts?.ttlSeconds
      ? Date.now() + opts.ttlSeconds * 1000
      : undefined;

    this.store.set(key, { data: value, expires });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async *list(prefix?: string): AsyncIterable<{ key: string; size?: number }> {
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      // Skip expired entries
      if (entry.expires && now > entry.expires) {
        this.store.delete(key);
        continue;
      }

      if (!prefix || key.startsWith(prefix)) {
        yield { key, size: entry.data.length };
      }
    }
  }
}
