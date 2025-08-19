/**
 * Runtime abstraction layer for Hatago Hub
 * Enables deployment across multiple environments (Node.js, Cloudflare Workers, Deno, Bun)
 */

/**
 * Runtime capabilities interface
 */
export interface RuntimeCapabilities {
  hasFileSystem: boolean;
  hasChildProcess: boolean;
  hasNodeModules: boolean;
  hasWebCrypto: boolean;
  hasKVStorage: boolean;
  hasDurableObjects: boolean;
  hasWebSockets: boolean;
}

/**
 * Runtime environment detection
 */
export type RuntimeEnvironment = 'node' | 'cloudflare-workers' | 'deno' | 'bun';

/**
 * ID generation interface
 */
export interface IdGenerator {
  /**
   * Generate a unique ID
   * @param length Optional length of the ID (default: 21 for nanoid compatibility)
   */
  generate(length?: number): string | Promise<string>;
}

/**
 * Concurrency control interface
 */
export interface Semaphore {
  /**
   * Acquire a permit from the semaphore
   */
  acquire(): Promise<void>;

  /**
   * Release a permit back to the semaphore
   */
  release(): void;

  /**
   * Get the number of available permits
   */
  available(): number;

  /**
   * Check if permits are available
   */
  isAvailable(): boolean;
}

/**
 * Queue interface for task scheduling
 */
export interface TaskQueue<_T = unknown> {
  /**
   * Add a task to the queue
   */
  add<R>(fn: () => Promise<R>): Promise<R>;

  /**
   * Clear all pending tasks
   */
  clear(): void;

  /**
   * Get the number of pending tasks
   */
  size(): number;

  /**
   * Get the number of running tasks
   */
  pending(): number;

  /**
   * Pause the queue
   */
  pause(): void;

  /**
   * Resume the queue
   */
  resume(): void;

  /**
   * Wait for all tasks to complete
   */
  onIdle(): Promise<void>;
}

/**
 * Storage abstraction interface
 */
export interface KVStore {
  /**
   * Get a value by key
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * Set a value with optional TTL
   */
  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a value
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if a key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * List keys with optional prefix
   */
  list(prefix?: string): Promise<string[]>;

  /**
   * Clear all data
   */
  clear(): Promise<void>;
}

/**
 * File system abstraction (for compatibility)
 */
export interface FileSystem {
  /**
   * Read a file
   */
  readFile(path: string): Promise<string>;

  /**
   * Write a file
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Check if a file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Delete a file
   */
  unlink(path: string): Promise<void>;

  /**
   * Create a directory
   */
  mkdir(path: string, recursive?: boolean): Promise<void>;

  /**
   * Read directory contents
   */
  readdir(path: string): Promise<string[]>;
}

/**
 * Process spawning abstraction
 */
export interface ProcessSpawner {
  /**
   * Spawn a child process
   */
  spawn(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
    },
  ): Promise<ProcessHandle>;
}

/**
 * Process handle interface
 */
export interface ProcessHandle {
  /**
   * Process ID
   */
  readonly pid?: number;

  /**
   * Send data to stdin
   */
  write(data: string | Uint8Array): Promise<void>;

  /**
   * Read from stdout
   */
  read(): AsyncIterableIterator<string | Uint8Array>;

  /**
   * Read from stderr
   */
  readError(): AsyncIterableIterator<string | Uint8Array>;

  /**
   * Kill the process
   */
  kill(signal?: string): Promise<void>;

  /**
   * Wait for process to exit
   */
  wait(): Promise<{ code: number | null; signal: string | null }>;

  /**
   * Check if process is alive
   */
  isAlive(): boolean;
}

/**
 * Main runtime interface
 */
export interface Runtime {
  /**
   * Runtime environment identifier
   */
  readonly environment: RuntimeEnvironment;

  /**
   * Runtime capabilities
   */
  readonly capabilities: RuntimeCapabilities;

  /**
   * ID generator implementation
   */
  readonly idGenerator: IdGenerator;

  /**
   * Create a semaphore for concurrency control
   */
  createSemaphore(permits: number): Semaphore;

  /**
   * Create a task queue
   */
  createTaskQueue(concurrency: number): TaskQueue;

  /**
   * Get KV storage implementation
   */
  getKVStore(namespace?: string): KVStore;

  /**
   * Get file system implementation (may throw if not available)
   */
  getFileSystem?(): FileSystem;

  /**
   * Get process spawner (may throw if not available)
   */
  getProcessSpawner?(): ProcessSpawner;

  /**
   * Get current timestamp in milliseconds
   */
  now(): number;

  /**
   * Set a timeout
   */
  setTimeout(fn: () => void, ms: number): unknown;

  /**
   * Clear a timeout
   */
  clearTimeout(id: unknown): void;

  /**
   * Set an interval
   */
  setInterval(fn: () => void, ms: number): unknown;

  /**
   * Clear an interval
   */
  clearInterval(id: unknown): void;

  /**
   * Create an abort controller
   */
  createAbortController(): AbortController;

  /**
   * Encode text to base64
   */
  base64Encode(text: string): string;

  /**
   * Decode base64 to text
   */
  base64Decode(encoded: string): string;

  /**
   * Generate random bytes
   */
  randomBytes(length: number): Uint8Array | Promise<Uint8Array>;
}

/**
 * Runtime detection helper
 */
export function detectRuntime(): RuntimeEnvironment {
  // Check for Cloudflare Workers
  if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
    // @ts-expect-error
    if (typeof WebSocketPair !== 'undefined') {
      return 'cloudflare-workers';
    }
  }

  // Check for Deno
  // @ts-expect-error
  if (typeof Deno !== 'undefined') {
    return 'deno';
  }

  // Check for Bun
  // @ts-expect-error
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  // Default to Node.js
  return 'node';
}

/**
 * Cached runtime instance for singleton pattern
 */
let cachedRuntime: Runtime | null = null;
let runtimeInitPromise: Promise<Runtime> | null = null;

/**
 * Get runtime instance (singleton pattern)
 * This ensures only one runtime instance is created per process
 */
export async function getRuntime(): Promise<Runtime> {
  if (cachedRuntime) {
    return cachedRuntime;
  }

  // Ensure only one initialization happens even with concurrent calls
  if (!runtimeInitPromise) {
    runtimeInitPromise = createRuntime();
  }

  cachedRuntime = await runtimeInitPromise;
  return cachedRuntime;
}

/**
 * Create runtime instance based on environment (internal)
 */
async function createRuntime(): Promise<Runtime> {
  const environment = detectRuntime();

  switch (environment) {
    case 'cloudflare-workers': {
      const { CloudflareWorkersRuntime } = await import(
        './cloudflare-workers.js'
      );
      return new CloudflareWorkersRuntime();
    }

    case 'deno':
      // Deno runtime not yet implemented
      throw new Error('Deno runtime is not yet implemented');

    case 'bun':
      // Bun runtime not yet implemented
      throw new Error('Bun runtime is not yet implemented');
    default: {
      const { NodeRuntime } = await import('./node.js');
      return new NodeRuntime();
    }
  }
}
