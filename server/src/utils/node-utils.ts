/**
 * Node.js utilities for Hatago Hub
 * Simplified from the runtime abstraction layer
 */

import { spawn } from 'node:child_process';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';

/**
 * Generate a unique ID
 * @param length Optional length of the ID (default: 21 for nanoid compatibility)
 */
export async function generateId(length = 21): Promise<string> {
  // Use crypto.randomUUID() for cryptographically secure IDs
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
    throw new Error(`Failed to generate ID after ${maxAttempts} attempts`);
  }

  return id;
}

/**
 * Simple semaphore for concurrency control
 */
export class SimpleSemaphore {
  private permits: number;
  private readonly waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
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
 * Simple task queue for managing concurrent operations
 */
export class SimpleTaskQueue<_T = unknown> {
  private readonly semaphore: SimpleSemaphore;
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
 * Node.js file system utilities
 */
export class NodeFileSystem {
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

  async rmdir(
    dirPath: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    await fs.rm(dirPath, { recursive: options?.recursive, force: true });
  }

  async stat(filePath: string): Promise<any> {
    return fs.stat(filePath);
  }
}

/**
 * Process handle for spawned processes
 */
export class NodeProcessHandle {
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
 * Spawn a child process
 */
export async function spawnProcess(
  command: string,
  args?: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  },
): Promise<NodeProcessHandle> {
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

/**
 * Utilities for base64 encoding/decoding
 */
export function base64Encode(text: string): string {
  return Buffer.from(text).toString('base64');
}

export function base64Decode(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString();
}

/**
 * Generate random bytes
 */
export async function randomBytes(length: number): Promise<Uint8Array> {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    globalThis.crypto.getRandomValues
  ) {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  } else {
    return new Uint8Array(nodeRandomBytes(length));
  }
}
