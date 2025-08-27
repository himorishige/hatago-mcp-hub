/**
 * Minimal logger utility (pino removed for lightweight version)
 */

import { randomUUID } from 'node:crypto';

// Check STDIO mode early to prevent stdout pollution
// Also check if we're running as 'serve' command with no --http flag (default stdio mode)
const isServeCommand = process.argv.includes('serve');
const hasHttpFlag = process.argv.includes('--http');
const hasModeFlag = process.argv.includes('--mode');
const modeIsHttp =
  hasModeFlag && process.argv[process.argv.indexOf('--mode') + 1] === 'http';

const IS_STDIO_MODE =
  process.env.MCP_STDIO_MODE === 'true' ||
  process.argv.includes('--stdio') ||
  (isServeCommand && !hasHttpFlag && !modeIsHttp);

const DEFAULT_DESTINATION = IS_STDIO_MODE ? process.stderr : process.stdout;

// Minimal Logger interface
export interface Logger {
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

export interface LoggerOptions {
  level?: string;
  format?: 'json' | 'pretty';
  profile?: string;
  reqId?: string;
  component?: string;
  destination?: NodeJS.WritableStream; // Add destination option for STDIO mode
}

/**
 * Create a logger instance
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level || process.env.LOG_LEVEL || 'info';
  // Use pre-calculated STDIO mode check
  const destination = options.destination || DEFAULT_DESTINATION;
  const component = options.component || 'hatago-hub';

  const levels = ['error', 'warn', 'info', 'debug'];
  const currentLevelIndex = levels.indexOf(level);

  const shouldLog = (logLevel: string) => {
    // In STDIO mode without debug, suppress most logs
    if (IS_STDIO_MODE && !process.env.DEBUG && !process.env.MCP_DEBUG) {
      return false; // Suppress all logs in STDIO mode unless debugging
    }
    return levels.indexOf(logLevel) <= currentLevelIndex;
  };

  const log = (level: string, obj: unknown, msg?: string) => {
    if (!shouldLog(level)) return;

    const timestamp = new Date().toISOString();

    // Handle different input types
    let logObj: Record<string, unknown>;
    if (typeof obj === 'string') {
      // If first argument is string, treat it as the message
      logObj = {
        timestamp,
        level,
        component,
        msg: obj,
      };
    } else if (typeof obj === 'object' && obj !== null) {
      // Otherwise, spread the object if it's an object
      const objRecord = obj as Record<string, unknown>;
      logObj = {
        timestamp,
        level,
        component,
        ...objRecord,
        msg:
          msg ||
          (objRecord.msg as string | undefined) ||
          (objRecord.message as string | undefined) ||
          '',
      };
    } else {
      // For primitive types, just use as data
      logObj = {
        timestamp,
        level,
        component,
        data: obj,
        msg: msg || '',
      };
    }

    // Simple JSON output (to stderr in STDIO mode)
    destination.write(`${JSON.stringify(logObj)}
`);
  };

  const logger: Logger = {
    error: (obj: unknown, msg?: string) => log('error', obj, msg),
    warn: (obj: unknown, msg?: string) => log('warn', obj, msg),
    info: (obj: unknown, msg?: string) => log('info', obj, msg),
    debug: (obj: unknown, msg?: string) => log('debug', obj, msg),
    child: (bindings: Record<string, unknown>) => {
      return createLogger({
        ...options,
        component: (bindings.component as string) || component,
        profile: (bindings.profile as string | undefined) || options.profile,
        reqId: (bindings.req_id as string | undefined) || options.reqId,
      });
    },
  };

  return logger;
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
      destination: DEFAULT_DESTINATION,
      level:
        IS_STDIO_MODE && !process.env.DEBUG && !process.env.MCP_DEBUG
          ? 'error'
          : undefined,
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
 * Default global logger instance
 * Note: Use getGlobalLogger() instead of this directly to ensure proper STDIO mode handling
 */
export const logger = getGlobalLogger();

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
