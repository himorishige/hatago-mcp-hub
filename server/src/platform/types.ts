/**
 * Platform abstraction layer - Port definitions
 *
 * These interfaces define the minimal contracts between Core and Runtime layers.
 * Following the "thin waist" architecture principle.
 */

/**
 * Storage port - Abstract key-value storage
 */
export interface Storage {
  /**
   * Get a value by key
   */
  get(key: string): Promise<Uint8Array | undefined>;

  /**
   * Store a value with optional TTL
   */
  put(
    key: string,
    value: Uint8Array,
    opts?: { ttlSeconds?: number },
  ): Promise<void>;

  /**
   * Delete a value
   */
  delete(key: string): Promise<void>;

  /**
   * List keys with optional prefix filter
   */
  list(prefix?: string): AsyncIterable<{ key: string; size?: number }>;
}

/**
 * EventBus port - Abstract event emitter
 */
export interface EventBus {
  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on(event: string, handler: (payload: unknown) => void): () => void;

  /**
   * Emit an event
   */
  emit(event: string, payload: unknown): void;

  /**
   * Remove all listeners for an event
   */
  off(event: string): void;
}

/**
 * MCPTransport port - Abstract MCP communication transport
 */
export interface MCPTransport {
  /**
   * Open a transport connection
   */
  open(
    type: 'stdio' | 'ws' | 'http',
    opts: MCPTransportOptions,
  ): Promise<MCPConnection>;
}

export interface MCPTransportOptions {
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  cwd?: string;
}

export interface MCPConnection {
  /**
   * Send a message
   */
  send(message: Uint8Array): Promise<void>;

  /**
   * Receive messages
   */
  onMessage(handler: (message: Uint8Array) => void): void;

  /**
   * Close the connection
   */
  close(): Promise<void>;

  /**
   * Connection state
   */
  readonly connected: boolean;
}

/**
 * ProcessRunner port - Abstract process execution (Node.js only)
 */
export interface ProcessRunner {
  /**
   * Check if process execution is supported
   */
  readonly supported: boolean;

  /**
   * Run a command
   */
  run(
    command: string,
    args: string[],
    opts?: {
      cwd?: string;
      env?: Record<string, string>;
      stdin?: Uint8Array;
      timeout?: number;
    },
  ): Promise<{
    code: number;
    stdout: Uint8Array;
    stderr: Uint8Array;
  }>;

  /**
   * Spawn a long-running process
   */
  spawn?(
    command: string,
    args: string[],
    opts?: {
      cwd?: string;
      env?: Record<string, string>;
    },
  ): Promise<Process>;
}

export interface Process {
  readonly pid: number;
  stdin: WritableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  kill(signal?: string): void;
  readonly exitCode: Promise<number>;
}

/**
 * Logger port - Structured logging
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Crypto port - Cryptographic operations
 */
export interface Crypto {
  /**
   * Generate a random UUID
   */
  randomUUID(): string;

  /**
   * Generate random bytes
   */
  randomBytes(size: number): Uint8Array;

  /**
   * Hash data using SHA-256
   */
  sha256(data: Uint8Array): Promise<Uint8Array>;
}

/**
 * Runtime capabilities - Describes what a runtime can do
 */
export interface RuntimeCapabilities {
  readonly name: 'node' | 'workers' | 'deno' | 'bun';
  readonly fileSystem: boolean;
  readonly childProcess: boolean;
  readonly tcpSocket: boolean;
  readonly websocket: boolean;
  readonly supportedMCPTypes: ('local' | 'npx' | 'remote')[];
}

/**
 * Platform - Complete platform abstraction
 */
export interface Platform {
  readonly capabilities: RuntimeCapabilities;
  readonly storage: Storage;
  readonly events: EventBus;
  readonly transport: MCPTransport;
  readonly logger: Logger;
  readonly crypto: Crypto;
  readonly process?: ProcessRunner; // Optional, not available in Workers
}

/**
 * Platform factory function
 */
export type PlatformFactory = (config?: PlatformConfig) => Promise<Platform>;

/**
 * Platform configuration
 */
export interface PlatformConfig {
  storage?: {
    type: 'memory' | 'file' | 'kv' | 'd1';
    path?: string; // For file storage
    namespace?: string; // For KV
  };
  logger?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'human';
  };
}
