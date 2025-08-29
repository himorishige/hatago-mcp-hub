/**
 * Cloudflare Workers platform implementation
 * 
 * Provides Workers-specific implementations using KV Storage
 * and Durable Objects for state management.
 */

import type { Platform, PlatformOptions, ConfigStore, SessionStore } from './types.js';
import { UnsupportedFeatureError } from './types.js';

/**
 * Cloudflare Workers environment bindings
 */
export interface WorkersEnv {
  CONFIG_KV: KVNamespace;
  CACHE_KV?: KVNamespace;
  SESSION_DO?: DurableObjectNamespace;
  [key: string]: any;
}

/**
 * KV-based configuration storage for Workers
 * Uses caching to optimize read performance
 */
class KVConfigStore implements ConfigStore {
  constructor(
    private kv: KVNamespace,
    private cacheKv?: KVNamespace
  ) {}

  async get(key: string): Promise<any> {
    // Try cache first if available
    if (this.cacheKv) {
      const cached = await this.cacheKv.get(key, { 
        type: 'json',
        cacheTtl: 60 // 1 minute cache
      });
      if (cached !== null) return cached;
    }

    // Fallback to main KV
    const value = await this.kv.get(key, { type: 'json' });
    
    // Update cache if available
    if (value !== null && this.cacheKv) {
      await this.cacheKv.put(key, JSON.stringify(value), {
        expirationTtl: 60
      });
    }

    return value;
  }

  async set(key: string, value: any): Promise<void> {
    // Write to main KV
    await this.kv.put(key, JSON.stringify(value));
    
    // Invalidate cache
    if (this.cacheKv) {
      await this.cacheKv.delete(key);
    }
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
    if (this.cacheKv) {
      await this.cacheKv.delete(key);
    }
  }

  async list(): Promise<string[]> {
    const list = await this.kv.list();
    return list.keys.map(k => k.name);
  }
}

/**
 * Durable Object-based session storage for Workers
 * Provides strong consistency for session state
 */
class DOSessionStore implements SessionStore {
  constructor(
    private namespace: DurableObjectNamespace,
    private kv?: KVNamespace // Optional KV for snapshots
  ) {}

  private getStub(id: string): DurableObjectStub {
    const doId = this.namespace.idFromName(id);
    return this.namespace.get(doId);
  }

  async create(id: string, data: any): Promise<void> {
    const stub = this.getStub(id);
    await stub.fetch('https://session/create', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    // Optional: Store snapshot in KV for quick reads
    if (this.kv) {
      await this.kv.put(`session:${id}`, JSON.stringify({
        ...data,
        createdAt: Date.now()
      }), {
        expirationTtl: 3600 // 1 hour
      });
    }
  }

  async get(id: string): Promise<any> {
    // Try KV snapshot first for performance
    if (this.kv) {
      const snapshot = await this.kv.get(`session:${id}`, { type: 'json' });
      if (snapshot) return snapshot;
    }

    // Fallback to DO for authoritative data
    const stub = this.getStub(id);
    const response = await stub.fetch('https://session/get');
    if (response.ok) {
      return await response.json();
    }
    return null;
  }

  async update(id: string, data: any): Promise<void> {
    const stub = this.getStub(id);
    await stub.fetch('https://session/update', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    // Invalidate KV snapshot
    if (this.kv) {
      await this.kv.delete(`session:${id}`);
    }
  }

  async delete(id: string): Promise<void> {
    const stub = this.getStub(id);
    await stub.fetch('https://session/delete', {
      method: 'DELETE'
    });

    if (this.kv) {
      await this.kv.delete(`session:${id}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    if (this.kv) {
      const snapshot = await this.kv.get(`session:${id}`);
      if (snapshot) return true;
    }

    const stub = this.getStub(id);
    const response = await stub.fetch('https://session/exists');
    return response.ok && (await response.json()) === true;
  }

  async list(): Promise<string[]> {
    // This is expensive in DO, so we rely on KV if available
    if (this.kv) {
      const list = await this.kv.list({ prefix: 'session:' });
      return list.keys.map(k => k.name.replace('session:', ''));
    }
    return [];
  }
}

/**
 * Fallback session storage using KV only (no DO)
 */
class KVSessionStore implements SessionStore {
  constructor(private kv: KVNamespace) {}

  async create(id: string, data: any): Promise<void> {
    await this.kv.put(`session:${id}`, JSON.stringify({
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }), {
      expirationTtl: 86400 // 24 hours
    });
  }

  async get(id: string): Promise<any> {
    return await this.kv.get(`session:${id}`, { type: 'json' });
  }

  async update(id: string, data: any): Promise<void> {
    const existing = await this.get(id);
    if (existing) {
      await this.kv.put(`session:${id}`, JSON.stringify({
        ...existing,
        ...data,
        updatedAt: Date.now()
      }), {
        expirationTtl: 86400
      });
    }
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(`session:${id}`);
  }

  async exists(id: string): Promise<boolean> {
    return (await this.kv.get(`session:${id}`)) !== null;
  }

  async list(): Promise<string[]> {
    const list = await this.kv.list({ prefix: 'session:' });
    return list.keys.map(k => k.name.replace('session:', ''));
  }
}

/**
 * Create Cloudflare Workers platform implementation
 */
export function createWorkersPlatform(
  env: WorkersEnv,
  options: PlatformOptions = {}
): Platform {
  // Choose session store based on available bindings
  const sessionStore = env.SESSION_DO
    ? new DOSessionStore(env.SESSION_DO, env.CACHE_KV)
    : new KVSessionStore(env.CONFIG_KV);

  return {
    // Core features
    randomUUID: () => crypto.randomUUID(),
    getEnv: (key: string) => env[key],

    // Workers doesn't support these Node.js features
    spawn: undefined,
    readFile: undefined,
    writeFile: undefined,

    // Storage implementations
    storage: {
      config: new KVConfigStore(env.CONFIG_KV, env.CACHE_KV),
      session: sessionStore
    },

    // Platform identification
    name: 'workers',

    // Capability flags
    capabilities: {
      hasFileSystem: false,
      hasProcessSpawn: false,
      hasWebCrypto: true,
      hasDurableObjects: !!env.SESSION_DO,
      hasKVStorage: true
    }
  };
}