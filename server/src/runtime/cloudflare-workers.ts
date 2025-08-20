/**
 * Cloudflare Workers runtime implementation
 */

import type {
  FileSystem,
  IdGenerator,
  KVStore,
  ProcessSpawner,
  Runtime,
  RuntimeCapabilities,
  RuntimeEnvironment,
  Semaphore,
  TaskQueue,
} from './types.js';

/**
 * Web Crypto API based ID generator for Workers
 */
class WorkersIdGenerator implements IdGenerator {
  async generate(length = 21): Promise<string> {
    // Use crypto.randomUUID() for cryptographically secure IDs
    // Available in Workers environment
    if (crypto.randomUUID) {
      // Remove hyphens for nanoid-like format if needed
      const uuid = crypto.randomUUID().replace(/-/g, '');
      // Return requested length (UUID is 32 chars without hyphens)
      return uuid.substring(0, Math.min(length, 32));
    }

    // Fallback with proper rejection sampling
    const alphabet =
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
    const alphabetSize = alphabet.length;
    const maxValidValue = Math.floor(256 / alphabetSize) * alphabetSize;

    let id = '';
    let attempts = 0;
    const maxAttempts = length * 10; // Prevent infinite loops

    while (id.length < length && attempts < maxAttempts) {
      const bytes = new Uint8Array(Math.ceil((length - id.length) * 1.5));
      crypto.getRandomValues(bytes);

      for (let i = 0; i < bytes.length && id.length < length; i++) {
        const byte = bytes[i];
        // Rejection sampling to avoid modulo bias
        if (byte < maxValidValue) {
          id += alphabet[byte % alphabetSize];
        }
      }
      attempts++;
    }

    if (id.length < length) {
      throw new Error('Failed to generate ID after maximum attempts');
    }

    return id;
  }
}

/**
 * Workers-compatible semaphore implementation
 */
class WorkersSemaphore implements Semaphore {
  private permits: number;
  private readonly waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
    this.maxPermits = permits;
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.waiting.push(resolve);
      }
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0 && this.permits > 0) {
      this.permits--;
      const resolve = this.waiting.shift();
      resolve?.();
    }
  }

  available(): number {
    return this.permits;
  }

  isAvailable(): boolean {
    return this.permits > 0;
  }
}

/**
 * Workers-compatible task queue implementation
 */
class WorkersTaskQueue<T = unknown> implements TaskQueue<T> {
  private readonly semaphore: Semaphore;
  private readonly pendingTasks: Array<() => Promise<unknown>> = [];
  private runningCount = 0;
  private paused = false;

  constructor(concurrency: number) {
    this.semaphore = new WorkersSemaphore(concurrency);
  }

  async add<R>(fn: () => Promise<R>): Promise<R> {
    if (this.paused) {
      return new Promise<R>((resolve, reject) => {
        this.pendingTasks.push(async () => {
          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    await this.semaphore.acquire();
    this.runningCount++;

    try {
      const result = await fn();
      return result;
    } finally {
      this.runningCount--;
      this.semaphore.release();
    }
  }

  clear(): void {
    this.pendingTasks.length = 0;
  }

  size(): number {
    return this.pendingTasks.length;
  }

  pending(): number {
    return this.runningCount;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    // Process pending tasks
    while (this.pendingTasks.length > 0 && this.semaphore.isAvailable()) {
      const task = this.pendingTasks.shift();
      if (task) {
        this.add(task);
      }
    }
  }

  async onIdle(): Promise<void> {
    while (this.runningCount > 0 || this.pendingTasks.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

/**
 * Cloudflare KV wrapper
 */
class CloudflareKVStore implements KVStore {
  private kv: KVNamespace | null = null;

  constructor(namespace?: string) {
    // In Workers environment, KV namespaces are bound via wrangler.toml
    // Access them from the global scope
    // @ts-expect-error
    if (typeof globalThis !== 'undefined' && globalThis[namespace || 'KV']) {
      // @ts-expect-error
      this.kv = globalThis[namespace || 'KV'];
    } else {
      // If KV is not available, throw error (no fallback in production)
      console.warn(
        `KV namespace '${namespace || 'KV'}' not found. Configure it in wrangler.toml`,
      );
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.kv) {
      throw new Error(
        'KV namespace not configured. Add KV binding to wrangler.toml',
      );
    }
    const value = await this.kv.get(key, 'json');
    return value as T;
  }

  async set<T = unknown>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.kv) {
      throw new Error(
        'KV namespace not configured. Add KV binding to wrangler.toml',
      );
    }
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: ttlSeconds,
    });
  }

  async delete(key: string): Promise<boolean> {
    if (!this.kv) {
      throw new Error(
        'KV namespace not configured. Add KV binding to wrangler.toml',
      );
    }
    await this.kv.delete(key);
    return true;
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async list(prefix?: string): Promise<string[]> {
    if (!this.kv) {
      throw new Error(
        'KV namespace not configured. Add KV binding to wrangler.toml',
      );
    }
    const list = await this.kv.list({ prefix });
    return list.keys.map((k) => k.name);
  }

  async clear(): Promise<void> {
    if (!this.kv) {
      throw new Error(
        'KV namespace not configured. Add KV binding to wrangler.toml',
      );
    }
    // KV doesn't have a clear method, need to list and delete
    const keys = await this.list();
    await Promise.all(keys.map((key) => this.delete(key)));
  }
}

/**
 * Cloudflare Workers runtime implementation
 */
export class CloudflareWorkersRuntime implements Runtime {
  readonly environment: RuntimeEnvironment = 'cloudflare-workers';
  readonly capabilities: RuntimeCapabilities = {
    hasFileSystem: false,
    hasChildProcess: false,
    hasNodeModules: false,
    hasWebCrypto: true,
    hasKVStorage: true,
    hasDurableObjects: true,
    hasWebSockets: true,
  };
  readonly idGenerator: IdGenerator = new WorkersIdGenerator();

  private kvStores = new Map<string, KVStore>();

  createSemaphore(permits: number): Semaphore {
    return new WorkersSemaphore(permits);
  }

  createTaskQueue(concurrency: number): TaskQueue {
    return new WorkersTaskQueue(concurrency);
  }

  getKVStore(namespace = 'default'): KVStore {
    if (!this.kvStores.has(namespace)) {
      this.kvStores.set(namespace, new CloudflareKVStore(namespace));
    }
    const store = this.kvStores.get(namespace);
    if (!store) {
      throw new Error(`Failed to get KV store for namespace: ${namespace}`);
    }
    return store;
  }

  getFileSystem?(): FileSystem {
    throw new Error('File system is not available in Cloudflare Workers');
  }

  getProcessSpawner?(): ProcessSpawner {
    throw new Error('Process spawning is not available in Cloudflare Workers');
  }

  now(): number {
    return Date.now();
  }

  setTimeout(fn: () => void, ms: number): number {
    return setTimeout(fn, ms) as unknown as number;
  }

  clearTimeout(id: unknown): void {
    clearTimeout(id as number);
  }

  setInterval(fn: () => void, ms: number): number {
    return setInterval(fn, ms) as unknown as number;
  }

  clearInterval(id: unknown): void {
    clearInterval(id as number);
  }

  createAbortController(): AbortController {
    return new AbortController();
  }

  base64Encode(text: string): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    return btoa(String.fromCharCode(...data));
  }

  base64Decode(encoded: string): string {
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }

  async randomBytes(length: number): Promise<Uint8Array> {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
}

// Type declarations for Cloudflare Workers KV
interface KVNamespace {
  get(key: string, type?: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<unknown | null>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  get(key: string, type: 'stream'): Promise<ReadableStream | null>;

  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: {
      expirationTtl?: number;
      expiration?: number;
      metadata?: unknown;
    },
  ): Promise<void>;

  delete(key: string): Promise<void>;

  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}
