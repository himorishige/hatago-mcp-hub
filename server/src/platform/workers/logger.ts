/**
 * Cloudflare Workers Logger implementation
 */
import type { Logger, LogLevel } from '../types.js';

/**
 * Console-based logger for Workers
 */
export class WorkersLogger implements Logger {
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private currentLevel: number;

  constructor(level: LogLevel = 'info') {
    this.currentLevel = this.levels[level];
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.currentLevel;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta));
    }
  }
}
