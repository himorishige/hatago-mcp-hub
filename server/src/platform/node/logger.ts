/**
 * Node.js Logger implementation
 */
import type { Logger } from '../types.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Simple console-based logger for Node.js
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private format: 'json' | 'human';

  constructor(level: LogLevel = 'info', format: 'json' | 'human' = 'human') {
    this.level = level;
    this.format = format;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.log('DEBUG', message, meta);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.log('INFO', message, meta);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.log('WARN', message, meta);
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      this.log('ERROR', message, meta);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private log(
    level: string,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    const timestamp = new Date().toISOString();

    if (this.format === 'json') {
      console.log(
        JSON.stringify({
          timestamp,
          level,
          message,
          ...meta,
        }),
      );
    } else {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.log(`[${timestamp}] ${level}: ${message}${metaStr}`);
    }
  }
}

/**
 * Silent logger (for testing or when logging is disabled)
 */
export class SilentLogger implements Logger {
  debug(_message: string, _meta?: Record<string, unknown>): void {
    // No-op
  }

  info(_message: string, _meta?: Record<string, unknown>): void {
    // No-op
  }

  warn(_message: string, _meta?: Record<string, unknown>): void {
    // No-op
  }

  error(_message: string, _meta?: Record<string, unknown>): void {
    // No-op
  }
}
