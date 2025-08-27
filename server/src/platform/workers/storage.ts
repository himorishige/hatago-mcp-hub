/**
 * Cloudflare Workers Storage implementations
 */
import type { Storage } from '../types.js';

/**
 * KV-based storage for Cloudflare Workers
 */
export class KVStorage implements Storage {
  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<Uint8Array | undefined> {
    const value = await this.kv.get(key, 'arrayBuffer');
    return value ? new Uint8Array(value) : undefined;
  }

  async put(
    key: string,
    value: Uint8Array,
    opts?: { ttlSeconds?: number },
  ): Promise<void> {
    const options: KVNamespacePutOptions = {};
    if (opts?.ttlSeconds) {
      options.expirationTtl = opts.ttlSeconds;
    }

    await this.kv.put(key, value, options);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async *list(prefix?: string): AsyncIterable<{ key: string; size?: number }> {
    const options: KVNamespaceListOptions = {};
    if (prefix) {
      options.prefix = prefix;
    }

    let cursor: string | undefined;
    do {
      const result = await this.kv.list({ ...options, cursor });

      for (const key of result.keys) {
        yield {
          key: key.name,
          size: undefined, // KV doesn't provide size information
        };
      }

      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);
  }
}

/**
 * In-memory storage for Workers (same as Node.js version)
 */
export class WorkersMemoryStorage implements Storage {
  private data = new Map<string, { value: Uint8Array; expires?: number }>();

  async get(key: string): Promise<Uint8Array | undefined> {
    const item = this.data.get(key);
    if (!item) {
      return undefined;
    }

    if (item.expires && item.expires < Date.now()) {
      this.data.delete(key);
      return undefined;
    }

    return item.value;
  }

  async put(
    key: string,
    value: Uint8Array,
    opts?: { ttlSeconds?: number },
  ): Promise<void> {
    const expires = opts?.ttlSeconds
      ? Date.now() + opts.ttlSeconds * 1000
      : undefined;

    this.data.set(key, { value, expires });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async *list(prefix?: string): AsyncIterable<{ key: string; size?: number }> {
    for (const [key, item] of this.data) {
      if (item.expires && item.expires < Date.now()) {
        this.data.delete(key);
        continue;
      }

      if (!prefix || key.startsWith(prefix)) {
        yield {
          key,
          size: item.value.byteLength,
        };
      }
    }
  }
}
