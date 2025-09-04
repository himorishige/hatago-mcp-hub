/**
 * Logger Interface for Hatago
 *
 * Provides a common logger interface for all Hatago packages.
 * Implementations must ensure stdout is never polluted in STDIO mode.
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogData {
  [key: string]: unknown;
}

export type Logger = {
  level: LogLevel;
  error(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  trace(obj: unknown, msg?: string): void;
  child?(prefix: string): Logger;
};

/**
 * Log levels with numeric values for comparison
 */
export const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5
};

/**
 * Check if a log level should be output
 */
export function shouldLog(currentLevel: LogLevel, messageLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] <= LOG_LEVELS[currentLevel];
}

/**
 * No-op logger for silent mode
 */
export class SilentLogger implements Logger {
  level: LogLevel = 'silent';
  error(): void {}
  warn(): void {}
  info(): void {}
  debug(): void {}
  trace(): void {}
  child(): Logger {
    return this;
  }
}
