/**
 * Distributed Tracing
 *
 * Lightweight tracing implementation for request tracking.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  flags?: number;
  baggage?: Record<string, string>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  tags: Record<string, any>;
  logs: Array<{ timestamp: number; fields: Record<string, any> }>;
  finished: boolean;
}

// Global async storage for trace context
const traceStorage = new AsyncLocalStorage<TraceContext>();

export class Tracer {
  private spans = new Map<string, Span>();
  private listeners = new Set<(span: Span) => void>();

  /**
   * Start a new root span
   */
  startRootSpan(operationName: string, tags: Record<string, any> = {}): Span {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();

    return this.createSpan({
      traceId,
      spanId,
      operationName,
      tags,
    });
  }

  /**
   * Start a child span from current context
   */
  startChildSpan(operationName: string, tags: Record<string, any> = {}): Span {
    const context = this.getCurrentContext();
    if (!context) {
      // No parent context, create root span
      return this.startRootSpan(operationName, tags);
    }

    const spanId = this.generateSpanId();

    return this.createSpan({
      traceId: context.traceId,
      spanId,
      parentSpanId: context.spanId,
      operationName,
      tags,
    });
  }

  /**
   * Finish a span
   */
  finishSpan(span: Span): void {
    if (span.finished) {
      return;
    }

    span.endTime = Date.now();
    span.finished = true;

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(span);
      } catch (error) {
        console.error('Error in span listener:', error);
      }
    });

    // Clean up completed spans after delay
    setTimeout(() => {
      this.spans.delete(span.spanId);
    }, 60000); // Keep for 1 minute
  }

  /**
   * Execute operation within span context
   */
  async withSpan<T>(
    operationName: string,
    operation: (span: Span) => Promise<T>,
    tags: Record<string, any> = {},
  ): Promise<T> {
    const span = this.startChildSpan(operationName, tags);

    try {
      const result = await this.runInContext(
        {
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
        },
        () => operation(span),
      );

      span.tags.success = true;
      return result;
    } catch (error) {
      span.tags.error = true;
      span.tags.errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logToSpan(span, 'error', {
        error: error instanceof Error ? error.stack : error,
      });
      throw error;
    } finally {
      this.finishSpan(span);
    }
  }

  /**
   * Run operation in trace context
   */
  runInContext<T>(context: TraceContext, operation: () => T): T {
    return traceStorage.run(context, operation);
  }

  /**
   * Get current trace context
   */
  getCurrentContext(): TraceContext | undefined {
    return traceStorage.getStore();
  }

  /**
   * Add listener for span completion
   */
  addSpanListener(listener: (span: Span) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove span listener
   */
  removeSpanListener(listener: (span: Span) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Get active spans count
   */
  getActiveSpansCount(): number {
    return Array.from(this.spans.values()).filter((span) => !span.finished)
      .length;
  }

  private createSpan(params: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    operationName: string;
    tags: Record<string, any>;
  }): Span {
    const span: Span = {
      traceId: params.traceId,
      spanId: params.spanId,
      parentSpanId: params.parentSpanId,
      operationName: params.operationName,
      startTime: Date.now(),
      tags: { ...params.tags },
      logs: [],
      finished: false,
    };

    this.spans.set(span.spanId, span);
    return span;
  }

  private logToSpan(
    span: Span,
    level: string,
    fields: Record<string, any>,
  ): void {
    span.logs.push({
      timestamp: Date.now(),
      fields: { level, ...fields },
    });
  }

  private generateTraceId(): string {
    return randomUUID().replace(/-/g, '');
  }

  private generateSpanId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
  }
}

// Global tracer instance
export const tracer = new Tracer();

// Utility functions
export function getCurrentTraceContext(): TraceContext | undefined {
  return tracer.getCurrentContext();
}

export function withSpan<T>(
  operationName: string,
  operation: (span: Span) => Promise<T>,
  tags?: Record<string, any>,
): Promise<T> {
  return tracer.withSpan(operationName, operation, tags);
}

export function startSpan(
  operationName: string,
  tags?: Record<string, any>,
): Span {
  return tracer.startChildSpan(operationName, tags);
}

export function finishSpan(span: Span): void {
  tracer.finishSpan(span);
}
