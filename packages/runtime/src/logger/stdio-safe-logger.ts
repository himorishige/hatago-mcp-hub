/**
 * STDIO-Safe Logger Implementation
 *
 * Ensures all log output goes to stderr to keep stdout clean
 * for MCP protocol communication.
 */

import type { Logger, LogLevel } from '@himorishige/hatago-core';
import { shouldLog } from '@himorishige/hatago-core';

export interface StdioSafeLoggerOptions {
  level?: LogLevel;
  json?: boolean;
  prefix?: string;
  file?: string | null; // For future file logging support
}

export class StdioSafeLogger implements Logger {
  level: LogLevel;
  private json: boolean;
  private prefix: string;

  constructor(options: StdioSafeLoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.json = options.json !== false;
    this.prefix = options.prefix ?? '[Hub]';
  }

  private write(level: LogLevel, obj: unknown, msg?: string): void {
    if (!shouldLog(this.level, level)) {
      return;
    }

    const timestamp = new Date().toISOString();

    // Build log record
    const record: any = {
      level,
      time: timestamp,
      msg: msg || (typeof obj === 'string' ? obj : undefined),
    };

    // Add data if obj is an object
    if (typeof obj === 'object' && obj !== null && msg) {
      Object.assign(record, obj);
    } else if (typeof obj !== 'string') {
      record.data = obj;
    }

    // Add prefix to message
    if (record.msg) {
      record.msg = `${this.prefix} ${record.msg}`;
    }

    // Format output
    const line = this.json
      ? JSON.stringify(record)
      : `[${timestamp}] [${level.toUpperCase()}] ${record.msg || ''}${
          record.data ? ` ${JSON.stringify(record.data)}` : ''
        }`;

    // CRITICAL: Write to stderr only, never stdout
    process.stderr.write(`${line}\n`);
  }

  error(obj: unknown, msg?: string): void {
    this.write('error', obj, msg);
  }

  warn(obj: unknown, msg?: string): void {
    this.write('warn', obj, msg);
  }

  info(obj: unknown, msg?: string): void {
    this.write('info', obj, msg);
  }

  debug(obj: unknown, msg?: string): void {
    this.write('debug', obj, msg);
  }

  trace(obj: unknown, msg?: string): void {
    this.write('trace', obj, msg);
  }

  child(prefix: string): Logger {
    return new StdioSafeLogger({
      level: this.level,
      json: this.json,
      prefix: `${this.prefix}[${prefix}]`,
    });
  }
}

/**
 * Create a STDIO-safe logger with default settings
 */
export function createStdioSafeLogger(
  options?: StdioSafeLoggerOptions,
): Logger {
  return new StdioSafeLogger(options);
}
