/**
 * Node.js runtime implementation
 */

import { spawn } from 'node:child_process';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type {
  FileSystem,
  IdGenerator,
  KVStore,
  ProcessHandle,
  ProcessSpawner,
  Runtime,
  RuntimeCapabilities,
  RuntimeEnvironment,
  Semaphore,
  TaskQueue,
} from './types.js';

/**
 * Web Crypto API based ID generator
 */
class WebCryptoIdGenerator implements IdGenerator {
  async generate(length = 21): Promise<string> {
    // Use crypto.randomUUID() for cryptographically secure IDs
    // This generates a standard UUIDv4 format
    if (
      typeof globalThis.crypto !== 'undefined' &&
      globalThis.crypto.randomUUID
    ) {
      // Remove hyphens for nanoid-like format if needed
      const uuid = globalThis.crypto.randomUUID().replace(/-/g, '');
      // Return requested length (UUID is 32 chars without hyphens)
      return uuid.substring(0, Math.min(length, 32));
    }

    // Fallback to Node.js crypto with proper rejection sampling
    const alphabet =
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
    const alphabetSize = alphabet.length;
    const maxValidValue = Math.floor(256 / alphabetSize) * alphabetSize;

    let id = '';
    let attempts = 0;
    const maxAttempts = length * 10; // Prevent infinite loops

    while (id.length < length && attempts < maxAttempts) {
      const bytes = nodeRandomBytes(Math.ceil((length - id.length) * 1.5));

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
 * Lightweight semaphore implementation
 */
class SimpleSemaphore implements Semaphore {
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
 * Simple task queue implementation
 */
class SimpleTaskQueue<T = unknown> implements TaskQueue<T> {
  private readonly semaphore: Semaphore;
  private readonly pendingTasks: Array<() => Promise<unknown>> = [];
  private running = 0;
  private paused = false;

  constructor(concurrency: number) {
    this.semaphore = new SimpleSemaphore(concurrency);
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
    this.running++;

    try {
      const result = await fn();
      return result;
    } finally {
      this.running--;
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
    return this.running;
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
    while (this.running > 0 || this.pendingTasks.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

/**
 * Memory-based KV store for Node.js
 */
class MemoryKVStore implements KVStore {
  private readonly data = new Map<
    string,
    { value: unknown; expires?: number }
  >();

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.data.get(key);
    if (!entry) return null;

    if (entry.expires && entry.expires < Date.now()) {
      this.data.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T = unknown>(
    key: string,
    value: T,
    ttlSeconds?: number,
  ): Promise<void> {
    const entry: { value: unknown; expires?: number } = { value };
    if (ttlSeconds) {
      entry.expires = Date.now() + ttlSeconds * 1000;
    }
    this.data.set(key, entry);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async list(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    for (const key of this.data.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

/**
 * Node.js file system implementation
 */
class NodeFileSystem implements FileSystem {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async unlink(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  async mkdir(dirPath: string, recursive = false): Promise<void> {
    await fs.mkdir(dirPath, { recursive });
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }
}

/**
 * Node.js process handle implementation
 */
class NodeProcessHandle implements ProcessHandle {
  private process: ReturnType<typeof spawn>;
  private _isAlive = true;

  constructor(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
    },
  ) {
    this.process = spawn(command, args || [], {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
    });

    this.process.on('exit', () => {
      this._isAlive = false;
    });
  }

  get pid(): number | undefined {
    return this.process.pid;
  }

  async write(data: string | Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const callback = (error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      };

      if (typeof data === 'string') {
        this.process.stdin?.write(data, callback);
      } else {
        this.process.stdin?.write(data, callback);
      }
    });
  }

  async *read(): AsyncIterableIterator<string> {
    for await (const chunk of this.process.stdout || []) {
      yield chunk.toString();
    }
  }

  async *readError(): AsyncIterableIterator<string> {
    for await (const chunk of this.process.stderr || []) {
      yield chunk.toString();
    }
  }

  async kill(signal?: string): Promise<void> {
    this.process.kill(signal as NodeJS.Signals);
  }

  async wait(): Promise<{ code: number | null; signal: string | null }> {
    return new Promise((resolve) => {
      this.process.on('exit', (code, signal) => {
        resolve({ code, signal });
      });
    });
  }

  isAlive(): boolean {
    return this._isAlive;
  }
}

/**
 * Node.js process spawner implementation
 */
class NodeProcessSpawner implements ProcessSpawner {
  async spawn(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
    },
  ): Promise<ProcessHandle> {
    const handle = new NodeProcessHandle(command, args, options);

    if (options?.timeout) {
      setTimeout(() => {
        if (handle.isAlive()) {
          handle.kill('SIGTERM');
        }
      }, options.timeout);
    }

    return handle;
  }
}

/**
 * Node.js runtime implementation
 */
export class NodeRuntime implements Runtime {
  readonly environment: RuntimeEnvironment = 'node';
  readonly capabilities: RuntimeCapabilities = {
    hasFileSystem: true,
    hasChildProcess: true,
    hasNodeModules: true,
    hasWebCrypto: typeof globalThis.crypto !== 'undefined',
    hasKVStorage: false, // Using memory store
    hasDurableObjects: false,
    hasWebSockets: true,
  };
  readonly idGenerator: IdGenerator = new WebCryptoIdGenerator();

  private kvStores = new Map<string, KVStore>();
  private fileSystem = new NodeFileSystem();
  private processSpawner = new NodeProcessSpawner();

  createSemaphore(permits: number): Semaphore {
    return new SimpleSemaphore(permits);
  }

  createTaskQueue(concurrency: number): TaskQueue {
    return new SimpleTaskQueue(concurrency);
  }

  getKVStore(namespace = 'default'): KVStore {
    if (!this.kvStores.has(namespace)) {
      this.kvStores.set(namespace, new MemoryKVStore());
    }
    const store = this.kvStores.get(namespace);
    if (!store) {
      throw new Error(`Failed to get KV store for namespace: ${namespace}`);
    }
    return store;
  }

  getFileSystem(): FileSystem {
    return this.fileSystem;
  }

  getProcessSpawner(): ProcessSpawner {
    return this.processSpawner;
  }

  now(): number {
    return Date.now();
  }

  setTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    return setTimeout(fn, ms);
  }

  clearTimeout(id: unknown): void {
    clearTimeout(id as NodeJS.Timeout);
  }

  setInterval(fn: () => void, ms: number): NodeJS.Timeout {
    return setInterval(fn, ms);
  }

  clearInterval(id: unknown): void {
    clearInterval(id as NodeJS.Timeout);
  }

  createAbortController(): AbortController {
    return new AbortController();
  }

  base64Encode(text: string): string {
    return Buffer.from(text).toString('base64');
  }

  base64Decode(encoded: string): string {
    return Buffer.from(encoded, 'base64').toString();
  }

  async randomBytes(length: number): Promise<Uint8Array> {
    if (this.capabilities.hasWebCrypto) {
      const bytes = new Uint8Array(length);
      globalThis.crypto.getRandomValues(bytes);
      return bytes;
    } else {
      return new Uint8Array(nodeRandomBytes(length));
    }
  }
}
