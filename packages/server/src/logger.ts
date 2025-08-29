/**
 * Simple Logger
 *
 * Logs to stderr to keep stdout clean for STDIO protocol.
 */

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

export class Logger {
  private level: number;

  constructor(level: string = 'info') {
    this.level = LOG_LEVELS[level as LogLevel] ?? LOG_LEVELS.info;
  }

  private log(level: LogLevel, ...args: any[]): void {
    if (LOG_LEVELS[level] <= this.level) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      console.error(prefix, ...args);
    }
  }

  error(...args: any[]): void {
    this.log('error', ...args);
  }

  warn(...args: any[]): void {
    this.log('warn', ...args);
  }

  info(...args: any[]): void {
    this.log('info', ...args);
  }

  debug(...args: any[]): void {
    this.log('debug', ...args);
  }

  trace(...args: any[]): void {
    this.log('trace', ...args);
  }
}
