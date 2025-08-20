/**
 * Logger utility using pino
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import pino from 'pino';

export interface LoggerOptions {
  level?: string;
  format?: 'json' | 'pretty';
  profile?: string;
  reqId?: string;
  component?: string;
}

/**
 * Create a logger instance
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const isDev = process.env.NODE_ENV === 'development';
  const format = options.format || (isDev ? 'pretty' : 'json');

  const baseOptions: pino.LoggerOptions = {
    level: options.level || process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        component: options.component || 'hatago-hub',
        profile: options.profile,
        req_id: options.reqId,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        // トップレベルの機密フィールド
        'password',
        'token',
        'apiKey',
        'api_key',
        'secret',
        'authorization',
        'accessToken',
        'refreshToken',
        'privateKey',
        // ワイルドカードパターン（1階層）
        '*.password',
        '*.token',
        '*.apiKey',
        '*.api_key',
        '*.secret',
        '*.authorization',
        '*.accessToken',
        '*.refreshToken',
        '*.privateKey',
        // 配列要素内
        '[*].password',
        '[*].token',
        '[*].apiKey',
        '[*].secret',
        // 環境変数パターン
        '*.DATABASE_URL',
        '*.GITHUB_TOKEN',
        '*.BRAVE_API_KEY',
        '*.OPENAI_API_KEY',
        '*.AWS_SECRET_ACCESS_KEY',
        'env.DATABASE_URL',
        'env.GITHUB_TOKEN',
        'env.BRAVE_API_KEY',
        'config.env.DATABASE_URL',
        'config.env.GITHUB_TOKEN',
        // HTTPヘッダー
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'headers.authorization',
        'headers.cookie',
      ],
      censor: '[REDACTED]',
    },
  };

  // Use pino-pretty in development or when explicitly requested
  if (format === 'pretty') {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          messageFormat: '{component} | {req_id} | {msg}',
        },
      },
    });
  }

  return pino(baseOptions);
}

/**
 * Create a child logger with request context
 */
export function createRequestLogger(
  parentLogger: Logger,
  options: {
    reqId?: string;
    cmd?: string;
    profile?: string;
  } = {},
): Logger {
  return parentLogger.child({
    req_id: options.reqId || randomUUID(),
    cmd: options.cmd,
    profile: options.profile,
  });
}

/**
 * Map CLI verbosity options to log levels
 */
export function getLogLevel(options: {
  verbose?: boolean;
  quiet?: boolean;
  logLevel?: string;
}): string {
  if (options.logLevel) {
    return options.logLevel;
  }
  if (options.verbose) {
    return 'debug';
  }
  if (options.quiet) {
    return 'warn';
  }
  return 'info';
}

/**
 * Global logger instance (can be overridden)
 */
let globalLogger: Logger | null = null;
let globalLoggerLocked = false;

/**
 * Get or create the global logger
 */
export function getGlobalLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger({
      component: 'hatago-hub-global',
    });
  }
  return globalLogger;
}

/**
 * Set the global logger (one-time operation)
 */
export function setGlobalLogger(logger: Logger): void {
  if (globalLoggerLocked) {
    logger.warn('Attempted to override locked global logger');
    return;
  }
  globalLogger = logger;
  globalLoggerLocked = true;
}

/**
 * Reset global logger (for testing only)
 */
export function resetGlobalLogger(): void {
  if (process.env.NODE_ENV === 'test') {
    globalLogger = null;
    globalLoggerLocked = false;
  }
}

/**
 * Log error with context
 */
export function logError(
  logger: Logger,
  error: unknown,
  message: string,
  context?: Record<string, unknown>,
): void {
  const errorObj =
    error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        }
      : { value: String(error) };

  logger.error(
    {
      error: errorObj,
      ...context,
    },
    message,
  );
}

/**
 * Measure and log operation duration
 */
export async function withDuration<T>(
  logger: Logger,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();

  try {
    logger.debug(`Starting ${operation}`);
    const result = await fn();
    const duration_ms = Date.now() - start;

    logger.info(
      { duration_ms, operation },
      `Completed ${operation} in ${duration_ms}ms`,
    );

    return result;
  } catch (error) {
    const duration_ms = Date.now() - start;
    logError(logger, error, `Failed ${operation} after ${duration_ms}ms`, {
      duration_ms,
      operation,
    });

    // Attach duration info to error object if possible
    if (error instanceof Error) {
      // Use a type guard to safely add metadata
      const errorWithMetadata = error as Error & {
        duration_ms?: number;
        operation?: string;
      };
      errorWithMetadata.duration_ms = duration_ms;
      errorWithMetadata.operation = operation;
    }

    throw error;
  }
}
