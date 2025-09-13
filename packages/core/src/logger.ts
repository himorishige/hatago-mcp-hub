/**
 * Logger Interface for Hatago
 *
 * Provides a common logger interface for all Hatago packages.
 * Implementations must ensure stdout is never polluted in STDIO mode.
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type LogData = {
  [key: string]: unknown;
};

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
 * Logger configuration options
 */
export type LoggerOptions = {
  level?: LogLevel;
  prefix?: string;
  json?: boolean;
  output?: (message: string) => void;
};

/**
 * Default output function - no-op
 * Platform-specific implementations should provide their own output function
 */
export const defaultOutput: (message: string) => void = () => {
  // No-op by default
  // Platform-specific packages should provide their own implementation
};

/**
 * Format log message based on configuration
 */
function formatLogMessage(
  level: LogLevel,
  obj: unknown,
  msg?: string,
  prefix?: string,
  json?: boolean
): string {
  const timestamp = new Date().toISOString();

  if (json) {
    const record: LogData = {
      time: timestamp,
      level,
      prefix,
      msg: msg ?? (typeof obj === 'string' ? obj : undefined),
      data: msg ? obj : typeof obj === 'string' ? undefined : obj
    };
    // Remove undefined values
    Object.keys(record).forEach((key) => {
      if (record[key] === undefined) {
        delete record[key];
      }
    });
    return JSON.stringify(record);
  }

  // Text format
  const levelStr = level.toUpperCase();
  const prefixStr = prefix ? ` ${prefix}` : '';
  const messageStr = msg ?? (typeof obj === 'string' ? obj : JSON.stringify(obj));
  const dataStr = msg && obj && typeof obj !== 'string' ? ` ${JSON.stringify(obj)}` : '';

  return `[${timestamp}] [${levelStr}]${prefixStr} ${messageStr}${dataStr}`;
}

/**
 * Create a functional logger
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const prefix = options.prefix ?? '';
  const json = options.json ?? false;
  const output = options.output ?? defaultOutput;

  const log = (logLevel: LogLevel, obj: unknown, msg?: string): void => {
    if (!shouldLog(level, logLevel)) {
      return;
    }

    const message = formatLogMessage(logLevel, obj, msg, prefix, json);
    output(message);
  };

  return {
    level,
    error: (obj: unknown, msg?: string) => log('error', obj, msg),
    warn: (obj: unknown, msg?: string) => log('warn', obj, msg),
    info: (obj: unknown, msg?: string) => log('info', obj, msg),
    debug: (obj: unknown, msg?: string) => log('debug', obj, msg),
    trace: (obj: unknown, msg?: string) => log('trace', obj, msg),
    child: (childPrefix: string) =>
      createLogger({
        ...options,
        prefix: prefix ? `${prefix}[${childPrefix}]` : `[${childPrefix}]`
      })
  };
}

/**
 * Create a silent logger (no-op)
 */
export function createSilentLogger(): Logger {
  return createLogger({ level: 'silent' });
}

/**
 * No-op logger for silent mode (deprecated, use createSilentLogger)
 * @deprecated Use createSilentLogger instead
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
