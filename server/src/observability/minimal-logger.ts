/**
 * Minimal observability for Hatago
 *
 * Lightweight logging and tracing without heavy dependencies:
 * - Request ID generation and propagation
 * - Ring buffer for crash dumps
 * - Structured logging with console
 * - Basic performance tracking
 */

import type { Context } from 'hono';

/**
 * Log levels
 */
export enum LogLevel {
  NONE = -1, // No logging at all
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  sessionId?: string;
  serverId?: string;
  error?: any;
  data?: Record<string, any>;
}

/**
 * Request context for tracing
 */
export interface RequestContext {
  requestId: string;
  sessionId?: string;
  serverId?: string;
  startTime: number;
}

/**
 * AsyncLocalStorage for request context (Node.js only)
 */
let asyncLocalStorage: any = null;
let getRandomBytes: ((size: number) => Buffer) | null = null;

// Runtime detection
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Initialize Node.js specific modules dynamically
if (isNode) {
  // Dynamic import for Node.js modules to avoid Workers build warnings
  (async () => {
    try {
      const { AsyncLocalStorage } = await import('node:async_hooks');
      const { randomBytes } = await import('node:crypto');
      asyncLocalStorage = new AsyncLocalStorage<RequestContext>();
      getRandomBytes = randomBytes;
    } catch {
      // Fallback for environments where these modules are not available
    }
  })();
}

/**
 * Request context abstraction
 */
export const requestContext = {
  run<T>(
    context: RequestContext,
    callback: () => T | Promise<T>,
  ): T | Promise<T> {
    if (asyncLocalStorage) {
      return asyncLocalStorage.run(context, callback);
    }
    // In Workers, we don't have AsyncLocalStorage, so just run the callback
    return callback();
  },
  getStore(): RequestContext | undefined {
    if (asyncLocalStorage) {
      return asyncLocalStorage.getStore();
    }
    return undefined;
  },
};

/**
 * Generate request ID
 */
export function generateRequestId(): string {
  if (getRandomBytes) {
    // Node.js environment
    return getRandomBytes(8).toString('hex');
  } else {
    // Workers/Browser environment - use Web Crypto API
    const array = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback to Math.random (less secure but works everywhere)
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }
}

/**
 * Ring buffer for crash dumps
 */
export class RingBuffer<T> {
  private buffer: T[] = [];
  private index = 0;
  private readonly size: number;

  constructor(size = 200) {
    this.size = size;
    this.buffer = new Array(size);
  }

  push(item: T): void {
    this.buffer[this.index] = item;
    this.index = (this.index + 1) % this.size;
  }

  getAll(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.index + i) % this.size;
      if (this.buffer[idx] !== undefined) {
        result.push(this.buffer[idx]);
      }
    }
    return result;
  }

  clear(): void {
    this.buffer = new Array(this.size);
    this.index = 0;
  }
}

/**
 * Minimal logger implementation
 */
export class MinimalLogger {
  private level: LogLevel;
  private ringBuffer: RingBuffer<LogEntry>;
  private format: 'json' | 'human';
  private outputStream: 'stdout' | 'stderr' | 'none';

  constructor(
    level: LogLevel = LogLevel.INFO,
    bufferSize = 200,
    format: 'json' | 'human' = 'human',
    outputStream: 'stdout' | 'stderr' | 'none' = 'stdout',
  ) {
    this.level = level;
    this.ringBuffer = new RingBuffer(bufferSize);
    this.format = format;
    this.outputStream = outputStream;

    // Register crash handlers
    this.registerCrashHandlers();
  }

  private registerCrashHandlers(): void {
    process.on('uncaughtException', (error) => {
      this.error('Uncaught exception', { error });
      this.dumpRingBuffer();
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      this.error('Unhandled rejection', { reason });
      this.dumpRingBuffer();
      process.exit(1);
    });

    process.on('SIGTERM', () => {
      this.info('Received SIGTERM, shutting down gracefully');
      this.dumpRingBuffer();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      this.info('Received SIGINT, shutting down');
      this.dumpRingBuffer();
      process.exit(0);
    });
  }

  private createEntry(level: LogLevel, message: string, data?: any): LogEntry {
    const ctx = requestContext.getStore();
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: ctx?.requestId,
      sessionId: ctx?.sessionId,
      serverId: ctx?.serverId,
      ...(data && { data }),
    };
  }

  private formatEntry(entry: LogEntry): string {
    if (this.format === 'json') {
      return JSON.stringify(entry);
    }

    // Human-readable format
    const levelStr = LogLevel[entry.level].padEnd(5);
    const prefix = [
      entry.timestamp,
      levelStr,
      entry.requestId ? `[${entry.requestId}]` : '',
    ]
      .filter(Boolean)
      .join(' ');

    let output = `${prefix} ${entry.message}`;
    if (entry.data) {
      output += ` ${JSON.stringify(entry.data)}`;
    }
    if (entry.error) {
      output += `\n${entry.error.stack || entry.error}`;
    }
    return output;
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (level > this.level) return;

    const entry = this.createEntry(level, message, data);
    this.ringBuffer.push(entry);

    const formatted = this.formatEntry(entry);

    // Handle different output modes
    if (this.outputStream === 'none') {
      // Silent mode - no output at all
      return;
    } else if (this.outputStream === 'stderr') {
      // In STDIO mode, output to stderr to avoid polluting MCP protocol stream
      process.stderr.write(`${formatted}
`);
    } else {
      // In HTTP mode, use console methods for proper log levels
      if (level === LogLevel.ERROR) {
        console.error(formatted);
      } else if (level === LogLevel.WARN) {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  trace(message: string, data?: any): void {
    this.log(LogLevel.TRACE, message, data);
  }

  /**
   * Dump ring buffer (for crash analysis)
   */
  dumpRingBuffer(): void {
    // Skip dump in silent mode
    if (this.outputStream === 'none') {
      return;
    }

    const errorLine = (msg: string) => {
      if (this.outputStream === 'stderr') {
        process.stderr.write(`${msg}
`);
      } else {
        console.error(msg);
      }
    };

    errorLine('\n=== CRASH DUMP - Last log entries ===');
    const entries = this.ringBuffer.getAll();
    for (const entry of entries) {
      errorLine(this.formatEntry(entry));
    }
    errorLine('=== END CRASH DUMP ===\n');
  }

  /**
   * Get ring buffer contents
   */
  getRingBuffer(): LogEntry[] {
    return this.ringBuffer.getAll();
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

/**
 * Global logger instance
 */
export const logger = new MinimalLogger();

/**
 * Parse log level from string
 */
export function parseLogLevel(level?: string): LogLevel {
  if (!level) return LogLevel.INFO;

  switch (level.toLowerCase()) {
    case 'none':
    case 'silent':
      return LogLevel.NONE;
    case 'error':
      return LogLevel.ERROR;
    case 'warn':
      return LogLevel.WARN;
    case 'info':
      return LogLevel.INFO;
    case 'debug':
      return LogLevel.DEBUG;
    case 'trace':
      return LogLevel.TRACE;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Request tracking middleware
 */
export function createRequestTracker() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const requestId = ctx.req.header('X-Request-ID') || generateRequestId();
    const sessionId = ctx.req.header('mcp-session-id');
    const serverId = ctx.req.query('server');

    const context: RequestContext = {
      requestId,
      sessionId,
      serverId,
      startTime: Date.now(),
    };

    // Add to response headers
    ctx.header('X-Request-ID', requestId);

    await requestContext.run(context, async () => {
      logger.info(`Request started: ${ctx.req.method} ${ctx.req.path}`, {
        method: ctx.req.method,
        path: ctx.req.path,
        sessionId,
        serverId,
      });

      try {
        await next();

        const duration = Date.now() - context.startTime;
        logger.info(`Request completed: ${ctx.req.method} ${ctx.req.path}`, {
          method: ctx.req.method,
          path: ctx.req.path,
          status: ctx.res.status,
          duration,
        });
      } catch (error) {
        const duration = Date.now() - context.startTime;
        logger.error(`Request failed: ${ctx.req.method} ${ctx.req.path}`, {
          method: ctx.req.method,
          path: ctx.req.path,
          error,
          duration,
        });
        throw error;
      }
    });
  };
}

/**
 * Performance timer
 */
export class Timer {
  private startTime: number;
  private marks: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  mark(name: string): void {
    this.marks.set(name, Date.now());
  }

  measure(name: string, startMark?: string): number {
    const endTime = Date.now();
    const startTime = startMark ? this.marks.get(startMark) : this.startTime;

    if (!startTime) {
      throw new Error(`Mark '${startMark}' not found`);
    }

    const duration = endTime - startTime;
    logger.debug(`Performance: ${name}`, { duration });
    return duration;
  }

  reset(): void {
    this.startTime = Date.now();
    this.marks.clear();
  }
}
