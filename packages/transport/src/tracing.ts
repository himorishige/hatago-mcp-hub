/**
 * Minimal tracing for Hatago transport layer
 *
 * Following the philosophy: "Don't judge, pass through"
 * This module only adds correlation IDs and timing, no judgment or transformation
 */

/**
 * Trace context for request correlation
 */
export type TraceContext = {
  correlationId: string;
  startTime: number;
  parentId?: string;
  spanId?: string;
};

/**
 * Trace span for timing measurement
 */
export type TraceSpan = {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Generate correlation ID
 * Simple, fast, unique enough for tracing
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create trace context for a request
 */
export function createTraceContext(parentId?: string): TraceContext {
  return {
    correlationId: generateCorrelationId(),
    startTime: Date.now(),
    parentId,
    spanId: Math.random().toString(36).substring(2, 9)
  };
}

/**
 * Start a trace span
 */
export function startSpan(name: string, metadata?: Record<string, unknown>): TraceSpan {
  return {
    name,
    startTime: Date.now(),
    metadata
  };
}

/**
 * End a trace span and calculate duration
 */
export function endSpan(span: TraceSpan): TraceSpan {
  const endTime = Date.now();
  return {
    ...span,
    endTime,
    duration: endTime - span.startTime
  };
}

/**
 * Simple trace logger that writes to stderr
 * Only logs when HATAGO_TRACE=true
 */
export class TraceLogger {
  private enabled: boolean;
  private prefix: string;

  constructor(prefix = '[Trace]') {
    this.enabled = process.env.HATAGO_TRACE === 'true';
    this.prefix = prefix;
  }

  /**
   * Log trace event
   */
  trace(context: TraceContext, event: string, data?: unknown): void {
    if (!this.enabled) return;

    const log = {
      time: new Date().toISOString(),
      correlationId: context.correlationId,
      parentId: context.parentId,
      spanId: context.spanId,
      event,
      data
    };

    // Write to stderr to avoid polluting stdout
    console.error(`${this.prefix}`, JSON.stringify(log));
  }

  /**
   * Log span completion
   */
  span(context: TraceContext, span: TraceSpan): void {
    if (!this.enabled) return;

    const log = {
      time: new Date().toISOString(),
      correlationId: context.correlationId,
      span: span.name,
      duration: span.duration,
      metadata: span.metadata
    };

    console.error(`${this.prefix}[Span]`, JSON.stringify(log));
  }

  /**
   * Compare two responses for shadow execution
   */
  compare(
    context: TraceContext,
    oldResponse: unknown,
    newResponse: unknown,
    type: 'response' | 'error'
  ): void {
    if (!this.enabled) return;

    const isDifferent = JSON.stringify(oldResponse) !== JSON.stringify(newResponse);

    const log = {
      time: new Date().toISOString(),
      correlationId: context.correlationId,
      type: 'shadow_compare',
      responseType: type,
      different: isDifferent,
      // Only log details if different
      ...(isDifferent && {
        old: oldResponse,
        new: newResponse
      })
    };

    console.error(`${this.prefix}[Compare]`, JSON.stringify(log));
  }
}

/**
 * Global trace logger instance
 */
export const traceLogger = new TraceLogger();

/**
 * Traced wrapper for transport operations
 * Adds correlation ID and timing without changing behavior
 */
export function withTracing<T extends (...args: any[]) => Promise<unknown>>(
  fn: T,
  name: string
): T {
  return (async (...args: Parameters<T>) => {
    const context = createTraceContext();
    const span = startSpan(name, { args: args.length });

    traceLogger.trace(context, `${name}.start`);

    try {
      const result = await fn(...args);
      const completedSpan = endSpan(span);

      traceLogger.span(context, completedSpan);
      traceLogger.trace(context, `${name}.success`);

      return result;
    } catch (error) {
      const completedSpan = endSpan(span);
      completedSpan.metadata = {
        ...completedSpan.metadata,
        error: error instanceof Error ? error.message : String(error)
      };

      traceLogger.span(context, completedSpan);
      traceLogger.trace(context, `${name}.error`, error);

      // Re-throw without transformation
      throw error;
    }
  }) as T;
}

/**
 * Add correlation ID to HTTP headers
 */
export function addCorrelationHeader(
  headers: Record<string, string>,
  correlationId: string
): Record<string, string> {
  return {
    ...headers,
    'x-correlation-id': correlationId
  };
}

/**
 * Extract correlation ID from headers
 */
export function extractCorrelationId(headers: Record<string, string>): string | undefined {
  return headers['x-correlation-id'];
}
