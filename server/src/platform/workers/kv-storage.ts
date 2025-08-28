/**
 * Cloudflare Workers KV storage adapter
 *
 * Provides persistent storage using Cloudflare KV namespaces
 */

import type { StorageAdapter } from '../types.js';

export interface WorkersKVOptions {
  configNamespace?: KVNamespace;
  sessionNamespace?: KVNamespace;
  defaultTTL?: number; // in seconds
}

/**
 * KV storage adapter for Cloudflare Workers
 */
export class WorkersKVStorage implements StorageAdapter {
  private configKV?: KVNamespace;
  private sessionKV?: KVNamespace;
  private defaultTTL: number;

  constructor(options: WorkersKVOptions = {}) {
    this.configKV = options.configNamespace;
    this.sessionKV = options.sessionNamespace;
    this.defaultTTL = options.defaultTTL || 86400; // 24 hours default
  }

  /**
   * Get value from KV storage
   */
  async get<T = any>(key: string): Promise<T | null> {
    const namespace = this.getNamespace(key);
    if (!namespace) return null;

    try {
      const value = await namespace.get(key, 'json');
      return value as T;
    } catch (error) {
      console.error(`Failed to get KV value for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in KV storage
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const namespace = this.getNamespace(key);
    if (!namespace) {
      console.warn(`No KV namespace available for key ${key}`);
      return;
    }

    try {
      const options: KVNamespacePutOptions = {};

      // Set TTL if provided or use default for session keys
      if (ttl) {
        options.expirationTtl = ttl;
      } else if (key.startsWith('session:')) {
        options.expirationTtl = this.defaultTTL;
      }

      await namespace.put(key, JSON.stringify(value), options);
    } catch (error) {
      console.error(`Failed to set KV value for key ${key}:`, error);
    }
  }

  /**
   * Delete value from KV storage
   */
  async delete(key: string): Promise<void> {
    const namespace = this.getNamespace(key);
    if (!namespace) return;

    try {
      await namespace.delete(key);
    } catch (error) {
      console.error(`Failed to delete KV value for key ${key}:`, error);
    }
  }

  /**
   * List keys from KV storage
   */
  async list(prefix?: string): Promise<string[]> {
    const results: string[] = [];

    // Check both namespaces if no specific prefix
    const namespacesToCheck: KVNamespace[] = [];
    if (prefix?.startsWith('session:') && this.sessionKV) {
      namespacesToCheck.push(this.sessionKV);
    } else if (prefix?.startsWith('config:') && this.configKV) {
      namespacesToCheck.push(this.configKV);
    } else {
      if (this.configKV) namespacesToCheck.push(this.configKV);
      if (this.sessionKV) namespacesToCheck.push(this.sessionKV);
    }

    for (const namespace of namespacesToCheck) {
      try {
        const listResult = await namespace.list({ prefix });
        results.push(...listResult.keys.map((k) => k.name));
      } catch (error) {
        console.error(`Failed to list KV keys with prefix ${prefix}:`, error);
      }
    }

    return results;
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Clear all values (with optional prefix)
   */
  async clear(prefix?: string): Promise<void> {
    const keys = await this.list(prefix);

    for (const key of keys) {
      await this.delete(key);
    }
  }

  /**
   * Get the appropriate KV namespace for a key
   */
  private getNamespace(key: string): KVNamespace | undefined {
    if (key.startsWith('session:')) {
      return this.sessionKV;
    } else if (key.startsWith('config:')) {
      return this.configKV;
    } else {
      // Default to config namespace
      return this.configKV;
    }
  }

  /**
   * Get storage size (not accurately available in KV)
   */
  async size(): Promise<number> {
    // KV doesn't provide size information
    const keys = await this.list();
    return keys.length;
  }
}
