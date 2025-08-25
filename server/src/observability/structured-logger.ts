/**
 * Structured Logger
 *
 * Enhanced logging with trace context and structured output.
 */

import type { Logger } from 'pino';
import pino from 'pino';
import { getCurrentTraceContext } from './tracing.js';

export interface LogContext {
  traceId?: string;
  spanId?: string;
  serverName?: string;
  clientId?: string;
  operation?: string;
  correlationId?: string;
  userId?: string;
  sessionId?: string;
}

export interface StructuredLogEntry {
  level: number;
  time: number;
  msg: string;
  context?: LogContext;
  [key: string]: any;
}

export class StructuredLogger {
  private logger: Logger;
  private defaultContext: LogContext = {};

  constructor(
    options: {
      name?: string;
      level?: string;
      prettyPrint?: boolean;
      context?: LogContext;
    } = {},
  ) {
    this.defaultContext = options.context || {};

    // Create pino logger with custom serializers
    let transport;
    if (options.prettyPrint) {
      try {
        // Try to use pino-pretty if available
        require.resolve('pino-pretty');
        transport = {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'hostname,pid',
          },
        };
      } catch {
        // pino-pretty not available, use JSON format
        console.warn(
          '[structured-logger] pino-pretty not available, using JSON format',
        );
      }
    }

    this.logger = pino({
      name: options.name || 'hatago',
      level: options.level || 'info',
      transport,
      serializers: {
        error: pino.stdSerializers.err,
        context: (ctx: LogContext) => ({
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          serverName: ctx.serverName,
          clientId: ctx.clientId,
          operation: ctx.operation,
          correlationId: ctx.correlationId,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
        }),
      },
      mixin: () => {
        const traceContext = getCurrentTraceContext();
        const mixinContext: LogContext = {
          ...this.defaultContext,
        };

        if (traceContext) {
          mixinContext.traceId = traceContext.traceId;
          mixinContext.spanId = traceContext.spanId;
        }

        return { context: mixinContext };
      },
    });
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger({
      name: this.logger.bindings().name,
      level: this.logger.level,
      context: { ...this.defaultContext, ...context },
    });

    // Copy the underlying pino logger
    childLogger.logger = this.logger.child({ context });

    return childLogger;
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any, context?: LogContext): void {
    this.log('debug', message, data, context);
  }

  /**
   * Log info message
   */
  info(message: string, data?: any, context?: LogContext): void {
    this.log('info', message, data, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any, context?: LogContext): void {
    this.log('warn', message, data, context);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, context?: LogContext): void {
    const logData =
      error instanceof Error
        ? { error, stack: error.stack }
        : error
          ? { error }
          : undefined;

    this.log('error', message, logData, context);
  }

  /**
   * Log fatal message
   */
  fatal(message: string, error?: Error | any, context?: LogContext): void {
    const logData =
      error instanceof Error
        ? { error, stack: error.stack }
        : error
          ? { error }
          : undefined;

    this.log('fatal', message, logData, context);
  }

  /**
   * Log request start
   */
  requestStart(
    context: LogContext & {
      method?: string;
      url?: string;
      userAgent?: string;
      ip?: string;
    },
  ): void {
    this.info(
      'Request started',
      {
        method: context.method,
        url: context.url,
        userAgent: context.userAgent,
        ip: context.ip,
      },
      context,
    );
  }

  /**
   * Log request completion
   */
  requestEnd(
    context: LogContext & {
      method?: string;
      url?: string;
      status?: number;
      duration?: number;
      bytesIn?: number;
      bytesOut?: number;
    },
  ): void {
    this.info(
      'Request completed',
      {
        method: context.method,
        url: context.url,
        status: context.status,
        duration: context.duration,
        bytesIn: context.bytesIn,
        bytesOut: context.bytesOut,
      },
      context,
    );
  }

  /**
   * Log tool call start
   */
  toolCallStart(
    context: LogContext & {
      toolName: string;
      params?: any;
    },
  ): void {
    this.info(
      'Tool call started',
      {
        toolName: context.toolName,
        params: context.params,
      },
      context,
    );
  }

  /**
   * Log tool call completion
   */
  toolCallEnd(
    context: LogContext & {
      toolName: string;
      success: boolean;
      duration?: number;
      resultSize?: number;
      error?: string;
    },
  ): void {
    const level = context.success ? 'info' : 'error';
    this.log(
      level,
      'Tool call completed',
      {
        toolName: context.toolName,
        success: context.success,
        duration: context.duration,
        resultSize: context.resultSize,
        error: context.error,
      },
      context,
    );
  }

  /**
   * Log server connection event
   */
  serverConnection(
    context: LogContext & {
      serverName: string;
      event: 'connect' | 'disconnect' | 'reconnect' | 'error';
      error?: string;
      attempts?: number;
    },
  ): void {
    const level = context.event === 'error' ? 'error' : 'info';
    this.log(
      level,
      `Server ${context.event}`,
      {
        serverName: context.serverName,
        event: context.event,
        error: context.error,
        attempts: context.attempts,
      },
      context,
    );
  }

  /**
   * Log security event
   */
  security(
    context: LogContext & {
      event: 'auth_success' | 'auth_failure' | 'rate_limit' | 'access_denied';
      reason?: string;
      ip?: string;
      userAgent?: string;
    },
  ): void {
    const level =
      context.event.includes('failure') || context.event.includes('denied')
        ? 'warn'
        : 'info';

    this.log(
      level,
      `Security event: ${context.event}`,
      {
        event: context.event,
        reason: context.reason,
        ip: context.ip,
        userAgent: context.userAgent,
      },
      context,
    );
  }

  private log(
    level: string,
    message: string,
    data?: any,
    context?: LogContext,
  ): void {
    const enhancedContext = context
      ? { ...this.defaultContext, ...context }
      : this.defaultContext;

    const logEntry = {
      msg: message,
      context: enhancedContext,
      ...data,
    };

    (this.logger as any)[level](logEntry);
  }

  /**
   * Get the underlying pino logger
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Create a timing function for operations
   */
  timer(operation: string, context?: LogContext) {
    const start = Date.now();
    const logContext = { ...context, operation };

    return {
      end: (success: boolean = true, additionalData?: any) => {
        const duration = Date.now() - start;
        this.log(
          success ? 'info' : 'warn',
          `Operation ${success ? 'completed' : 'failed'}`,
          {
            operation,
            duration,
            success,
            ...additionalData,
          },
          logContext,
        );
      },
    };
  }
}

// Create default logger instance
const defaultLogger = new StructuredLogger({
  name: 'hatago',
  level: process.env.LOG_LEVEL || 'info',
  // Allow explicit control via HATAGO_LOG_PRETTY environment variable
  prettyPrint:
    process.env.HATAGO_LOG_PRETTY === 'true' ||
    (process.env.NODE_ENV !== 'production' &&
      process.env.HATAGO_LOG_PRETTY !== 'false'),
});

// Export both class and default instance
export { defaultLogger as logger };
export default StructuredLogger;
