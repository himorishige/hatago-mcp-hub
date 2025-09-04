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
  trace: 5
};

export class Logger {
  private level: number;
  private json: boolean;

  constructor(level: string = 'info') {
    const envLevel = process.env.HATAGO_LOG_LEVEL;
    const finalLevel = (envLevel ?? level) as LogLevel;
    this.level = LOG_LEVELS[finalLevel] ?? LOG_LEVELS.info;
    this.json = process.env.HATAGO_LOG === 'json';
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (LOG_LEVELS[level] > this.level) return;

    // Cheap early return: avoid string building when suppressed
    if (!this.json) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      console.error(prefix, ...args);
      return;
    }

    // JSON mode (opt-in)
    const record: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      msg: typeof args[0] === 'string' ? args[0] : undefined
    };
    if (args.length > 1 || typeof args[0] !== 'string') {
      record.data = args.length === 1 ? args[0] : args;
    }
    console.error(JSON.stringify(record));
  }

  error(...args: unknown[]): void {
    this.log('error', ...args);
  }

  warn(...args: unknown[]): void {
    this.log('warn', ...args);
  }

  info(...args: unknown[]): void {
    this.log('info', ...args);
  }

  debug(...args: unknown[]): void {
    this.log('debug', ...args);
  }

  trace(...args: unknown[]): void {
    this.log('trace', ...args);
  }
}
