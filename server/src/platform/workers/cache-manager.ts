/**
 * Cache Manager for Cloudflare Workers
 * Implements two-layer caching: Memory + KV Storage
 */

import type { StorageAdapter } from '../types.js';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  expiresAt?: number;
  updating?: Promise<T>;
}

export interface CacheOptions {
  memoryTtl?: number; // TTL for memory cache (ms)
  kvTtl?: number; // TTL for KV cache (seconds)
  staleWhileRevalidate?: number; // Time to serve stale data while updating (ms)
}

/**
 * Two-layer cache manager for Cloudflare Workers
 */
export class CacheManager {
  // Module-scoped memory cache
  private static memoryCache = new Map<string, CacheEntry>();

  private storage: StorageAdapter;
  private defaultOptions: Required<CacheOptions>;

  constructor(storage: StorageAdapter, defaultOptions?: CacheOptions) {
    this.storage = storage;
    this.defaultOptions = {
      memoryTtl: 5 * 60 * 1000, // 5 minutes
      kvTtl: 60 * 60, // 1 hour
      staleWhileRevalidate: 30 * 1000, // 30 seconds
      ...defaultOptions,
    };
  }

  /**
   * Get value from cache with stale-while-revalidate support
   */
  async get<T>(
    key: string,
    fetcher?: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T | null> {
    const opts = { ...this.defaultOptions, ...options };
    const now = Date.now();

    // Check memory cache first
    const memoryEntry = CacheManager.memoryCache.get(key);
    if (memoryEntry) {
      const isExpired = memoryEntry.expiresAt && memoryEntry.expiresAt < now;
      const isStale = memoryEntry.timestamp + opts.memoryTtl < now;

      // Return fresh data immediately
      if (!isExpired && !isStale) {
        return memoryEntry.data;
      }

      // Stale-while-revalidate: return stale data and update in background
      if (isStale && !isExpired && fetcher && !memoryEntry.updating) {
        // Start background update
        memoryEntry.updating = this.updateCache(key, fetcher, opts);

        // Return stale data
        return memoryEntry.data;
      }

      // If already updating, return stale data
      if (memoryEntry.updating) {
        return memoryEntry.data;
      }
    }

    // Check KV storage
    const kvKey = this.getKVKey(key);
    const kvData = await this.storage.get<{ data: T; timestamp: number }>(
      kvKey,
    );

    if (kvData) {
      // Update memory cache from KV
      CacheManager.memoryCache.set(key, {
        data: kvData.data,
        timestamp: kvData.timestamp,
        expiresAt:
          kvData.timestamp + opts.memoryTtl + opts.staleWhileRevalidate,
      });

      // Check if KV data is stale
      const isKvStale = kvData.timestamp + opts.kvTtl * 1000 < now;

      if (isKvStale && fetcher) {
        // Update in background
        this.updateCache(key, fetcher, opts);
      }

      return kvData.data;
    }

    // No cache found, fetch if fetcher provided
    if (fetcher) {
      try {
        const data = await fetcher();
        await this.set(key, data, opts);
        return data;
      } catch (error) {
        console.error(`Failed to fetch data for key ${key}:`, error);

        // Return expired cache if available
        if (memoryEntry) {
          return memoryEntry.data;
        }

        return null;
      }
    }

    return null;
  }

  /**
   * Set value in both caches
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const opts = { ...this.defaultOptions, ...options };
    const now = Date.now();

    // Update memory cache
    CacheManager.memoryCache.set(key, {
      data: value,
      timestamp: now,
      expiresAt: now + opts.memoryTtl + opts.staleWhileRevalidate,
    });

    // Update KV storage
    const kvKey = this.getKVKey(key);
    await this.storage.set(
      kvKey,
      {
        data: value,
        timestamp: now,
      },
      opts.kvTtl,
    );
  }

  /**
   * Delete from both caches
   */
  async delete(key: string): Promise<void> {
    CacheManager.memoryCache.delete(key);
    await this.storage.delete(this.getKVKey(key));
  }

  /**
   * Clear all cache entries
   */
  async clear(prefix?: string): Promise<void> {
    // Clear memory cache
    if (prefix) {
      for (const [key] of CacheManager.memoryCache) {
        if (key.startsWith(prefix)) {
          CacheManager.memoryCache.delete(key);
        }
      }
    } else {
      CacheManager.memoryCache.clear();
    }

    // Clear KV storage
    await this.storage.clear(prefix ? `cache:${prefix}` : 'cache:');
  }

  /**
   * Update cache in background
   */
  private async updateCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: Required<CacheOptions>,
  ): Promise<T> {
    try {
      const data = await fetcher();
      await this.set(key, data, options);

      // Clear updating flag
      const entry = CacheManager.memoryCache.get(key);
      if (entry) {
        delete entry.updating;
      }

      return data;
    } catch (error) {
      console.error(`Failed to update cache for key ${key}:`, error);

      // Clear updating flag
      const entry = CacheManager.memoryCache.get(key);
      if (entry) {
        delete entry.updating;
      }

      throw error;
    }
  }

  /**
   * Get KV storage key
   */
  private getKVKey(key: string): string {
    return `cache:${key}`;
  }

  /**
   * Warm cache by pre-fetching data
   */
  async warm<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<void> {
    try {
      const data = await fetcher();
      await this.set(key, data, options);
    } catch (error) {
      console.error(`Failed to warm cache for key ${key}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryEntries: number;
    memoryCacheKeys: string[];
  } {
    return {
      memoryEntries: CacheManager.memoryCache.size,
      memoryCacheKeys: Array.from(CacheManager.memoryCache.keys()),
    };
  }
}

/**
 * Singleton instance for global cache
 */
let globalCache: CacheManager | null = null;

export function getGlobalCache(storage?: StorageAdapter): CacheManager {
  if (!globalCache && storage) {
    globalCache = new CacheManager(storage);
  }
  if (!globalCache) {
    throw new Error('Global cache not initialized');
  }
  return globalCache;
}

export function initGlobalCache(
  storage: StorageAdapter,
  options?: CacheOptions,
): CacheManager {
  globalCache = new CacheManager(storage, options);
  return globalCache;
}
