/**
 * Node.js utilities for Hatago Hub
 * Simplified from the runtime abstraction layer
 */

import { spawn } from 'node:child_process';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import {
  createSemaphore,
  createTaskQueue,
  type Semaphore,
  type TaskQueue,
} from './concurrency.js';

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
 * @deprecated Use createSemaphore from './concurrency.js' instead
 */
export class SimpleSemaphore {
  private semaphore: Semaphore;

  constructor(permits: number) {
    this.semaphore = createSemaphore(permits);
  }

  async acquire(): Promise<void> {
    return this.semaphore.acquire();
  }

  release(): void {
    this.semaphore.release();
  }

  available(): number {
    return this.semaphore.available();
  }

  isAvailable(): boolean {
    return this.semaphore.isAvailable();
  }
}

/**
 * Simple task queue for managing concurrent operations
 * @deprecated Use createTaskQueue from './concurrency.js' instead
 */
export class SimpleTaskQueue<_T = unknown> {
  private queue: TaskQueue<_T>;

  constructor(concurrency: number) {
    this.queue = createTaskQueue<_T>(concurrency);
  }

  async add<R>(fn: () => Promise<R>): Promise<R> {
    return this.queue.add(fn);
  }

  clear(): void {
    this.queue.clear();
  }

  size(): number {
    return this.queue.size();
  }

  pending(): number {
    return this.queue.pending();
  }

  pause(): void {
    this.queue.pause();
  }

  resume(): void {
    this.queue.resume();
  }

  async onIdle(): Promise<void> {
    while (this.queue.running() > 0 || this.queue.pending() > 0) {
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
