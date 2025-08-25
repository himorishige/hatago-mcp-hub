/**
 * Advanced Circuit Breaker
 *
 * Production-ready circuit breaker with error classification,
 * multiple backoff strategies, and metrics integration.
 */

import { EventEmitter } from 'node:events';
import { incrementCounter, setGauge } from '../observability/metrics.js';
import { logger } from '../observability/structured-logger.js';

export enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half-open',
}

export enum BackoffStrategy {
  Exponential = 'exponential',
  Linear = 'linear',
  Fixed = 'fixed',
}

export enum ErrorSeverity {
  Low = 'low', // Temporary issues (timeouts, rate limits)
  Medium = 'medium', // Service errors (500s, connection issues)
  High = 'high', // Critical errors (authentication, authorization)
  Critical = 'critical', // System failures (out of memory, disk full)
}

export interface ErrorClassification {
  severity: ErrorSeverity;
  retriable: boolean;
  weight?: number; // How much this error counts toward failure threshold (default: 1)
}

export interface CircuitBreakerOptions {
  // Failure detection
  failureThreshold?: number;
  errorThresholds?: Record<ErrorSeverity, number>;
  successThreshold?: number; // Successes needed in half-open to close
  monitoringWindowMs?: number;

  // Recovery behavior
  resetTimeoutMs?: number;
  backoffStrategy?: BackoffStrategy;
  backoffMultiplier?: number;
  maxBackoffMs?: number;

  // Error classification
  errorClassifier?: (error: Error) => ErrorClassification;

  // Advanced features
  halfOpenMaxCalls?: number; // Max concurrent calls in half-open state
  slowCallDurationMs?: number; // Duration to consider a call "slow"
  slowCallRateThreshold?: number; // Percentage of slow calls to trigger open
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  slowCalls: number;
  lastFailureTime: number;
  nextRetryTime: number;
  halfOpenCalls: number;
  errorStats: Record<ErrorSeverity, number>;
}

export class CircuitBreaker extends EventEmitter {
  private state = CircuitState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private totalCalls = 0;
  private slowCalls = 0;
  private lastFailureTime = 0;
  private nextRetryTime = 0;
  private halfOpenCalls = 0;
  private errorStats = new Map<ErrorSeverity, number>();
  private slidingWindow: Array<{
    timestamp: number;
    success: boolean;
    duration: number;
  }> = [];

  private readonly options: Required<CircuitBreakerOptions>;
  private readonly name: string;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    super();
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      errorThresholds: options.errorThresholds ?? {
        [ErrorSeverity.Low]: 10,
        [ErrorSeverity.Medium]: 5,
        [ErrorSeverity.High]: 3,
        [ErrorSeverity.Critical]: 1,
      },
      successThreshold: options.successThreshold ?? 3,
      monitoringWindowMs: options.monitoringWindowMs ?? 60000, // 1 minute
      resetTimeoutMs: options.resetTimeoutMs ?? 60000, // 1 minute
      backoffStrategy: options.backoffStrategy ?? BackoffStrategy.Exponential,
      backoffMultiplier: options.backoffMultiplier ?? 2.0,
      maxBackoffMs: options.maxBackoffMs ?? 5 * 60 * 1000, // 5 minutes
      errorClassifier: options.errorClassifier ?? this.defaultErrorClassifier,
      halfOpenMaxCalls: options.halfOpenMaxCalls ?? 3,
      slowCallDurationMs: options.slowCallDurationMs ?? 5000, // 5 seconds
      slowCallRateThreshold: options.slowCallRateThreshold ?? 0.5, // 50%
    };

    this.initializeErrorStats();
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    if (this.state === CircuitState.Open) {
      // Check if we should transition to half-open
      if (Date.now() >= this.nextRetryTime) {
        this.transitionToHalfOpen();
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const errorStats: Record<ErrorSeverity, number> = {};
    for (const [severity, count] of this.errorStats) {
      errorStats[severity] = count;
    }

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      slowCalls: this.slowCalls,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.nextRetryTime,
      halfOpenCalls: this.halfOpenCalls,
      errorStats,
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      const error = new Error(`Circuit breaker '${this.name}' is open`);
      this.updateMetrics();
      throw error;
    }

    if (this.state === CircuitState.HalfOpen) {
      if (this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
        throw new Error(
          `Circuit breaker '${this.name}' half-open call limit exceeded`,
        );
      }
      this.halfOpenCalls++;
    }

    const startTime = Date.now();
    this.totalCalls++;

    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      this.onSuccess(duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.onFailure(error as Error, duration);
      throw error;
    } finally {
      if (this.state === CircuitState.HalfOpen) {
        this.halfOpenCalls--;
      }
    }
  }

  /**
   * Manually open the circuit
   */
  forceOpen(): void {
    if (this.state !== CircuitState.Open) {
      this.transitionToOpen();
    }
  }

  /**
   * Manually close the circuit (reset)
   */
  forceClose(): void {
    this.reset();
    this.transitionToClosed();
  }

  /**
   * Reset all counters
   */
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.slowCalls = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = 0;
    this.nextRetryTime = 0;
    this.slidingWindow = [];
    this.initializeErrorStats();
  }

  private onSuccess(duration: number): void {
    this.successCount++;

    // Check for slow calls
    if (duration >= this.options.slowCallDurationMs) {
      this.slowCalls++;
    }

    // Add to sliding window
    this.addToSlidingWindow(true, duration);

    // Update circuit state based on current state
    if (this.state === CircuitState.HalfOpen) {
      if (this.successCount >= this.options.successThreshold) {
        this.transitionToClosed();
      }
    }

    // Check slow call rate in closed state
    if (this.state === CircuitState.Closed) {
      const slowCallRate =
        this.totalCalls > 0 ? this.slowCalls / this.totalCalls : 0;
      if (
        slowCallRate >= this.options.slowCallRateThreshold &&
        this.totalCalls >= 10
      ) {
        logger.warn('High slow call rate detected', {
          circuitBreaker: this.name,
          slowCallRate,
          threshold: this.options.slowCallRateThreshold,
        });
        this.transitionToOpen();
      }
    }

    this.updateMetrics();
  }

  private onFailure(error: Error, duration: number): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Classify error
    const classification = this.options.errorClassifier(error);
    const severity = classification.severity;
    const weight = classification.weight ?? 1;

    // Update error statistics
    const currentCount = this.errorStats.get(severity) ?? 0;
    this.errorStats.set(severity, currentCount + weight);

    // Add to sliding window
    this.addToSlidingWindow(false, duration);

    // Check if we should open the circuit
    const shouldOpen = this.shouldOpenCircuit(severity);

    if (shouldOpen) {
      this.transitionToOpen();
    } else if (this.state === CircuitState.HalfOpen) {
      // Any failure in half-open state should open the circuit
      this.transitionToOpen();
    }

    this.updateMetrics();

    logger.debug('Circuit breaker failure recorded', {
      circuitBreaker: this.name,
      error: error.message,
      severity,
      weight,
      failureCount: this.failureCount,
      state: this.state,
    });
  }

  private shouldOpenCircuit(errorSeverity: ErrorSeverity): boolean {
    // Check general failure threshold
    if (this.failureCount >= this.options.failureThreshold) {
      return true;
    }

    // Check error severity thresholds
    const errorCount = this.errorStats.get(errorSeverity) ?? 0;
    const threshold = this.options.errorThresholds[errorSeverity];

    return errorCount >= threshold;
  }

  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitState.Closed;
    this.reset();

    this.emit('state-change', {
      from: previousState,
      to: this.state,
      circuitBreaker: this.name,
    });

    logger.info('Circuit breaker closed', {
      circuitBreaker: this.name,
      previousState,
    });

    this.updateMetrics();
  }

  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.Open;
    this.halfOpenCalls = 0;
    this.nextRetryTime = this.calculateNextRetryTime();

    this.emit('state-change', {
      from: previousState,
      to: this.state,
      circuitBreaker: this.name,
      nextRetryTime: this.nextRetryTime,
    });

    logger.warn('Circuit breaker opened', {
      circuitBreaker: this.name,
      previousState,
      nextRetryTime: this.nextRetryTime,
      failureCount: this.failureCount,
      errorStats: Object.fromEntries(this.errorStats),
    });

    this.updateMetrics();
  }

  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.HalfOpen;
    this.halfOpenCalls = 0;
    this.successCount = 0; // Reset success count for half-open evaluation

    this.emit('state-change', {
      from: previousState,
      to: this.state,
      circuitBreaker: this.name,
    });

    logger.info('Circuit breaker half-open', {
      circuitBreaker: this.name,
      previousState,
    });

    this.updateMetrics();
  }

  private calculateNextRetryTime(): number {
    const baseDelay = this.options.resetTimeoutMs;
    let delay = baseDelay;

    switch (this.options.backoffStrategy) {
      case BackoffStrategy.Exponential:
        delay = Math.min(
          baseDelay * this.options.backoffMultiplier ** (this.failureCount - 1),
          this.options.maxBackoffMs,
        );
        break;

      case BackoffStrategy.Linear:
        delay = Math.min(
          baseDelay +
            (this.failureCount - 1) * this.options.backoffMultiplier * 1000,
          this.options.maxBackoffMs,
        );
        break;
      default:
        delay = baseDelay;
        break;
    }

    return Date.now() + delay;
  }

  private addToSlidingWindow(success: boolean, duration: number): void {
    const now = Date.now();
    const windowStart = now - this.options.monitoringWindowMs;

    // Add current call
    this.slidingWindow.push({ timestamp: now, success, duration });

    // Remove old entries
    this.slidingWindow = this.slidingWindow.filter(
      (entry) => entry.timestamp > windowStart,
    );
  }

  private defaultErrorClassifier(error: Error): ErrorClassification {
    const message = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    // Critical system errors
    if (message.includes('out of memory') || message.includes('disk full')) {
      return { severity: ErrorSeverity.Critical, retriable: false, weight: 5 };
    }

    // Authentication/Authorization errors
    if (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('authentication') ||
      errorName.includes('auth')
    ) {
      return { severity: ErrorSeverity.High, retriable: false, weight: 3 };
    }

    // Server errors
    if (
      message.includes('500') ||
      message.includes('internal server error') ||
      message.includes('service unavailable')
    ) {
      return { severity: ErrorSeverity.Medium, retriable: true, weight: 2 };
    }

    // Timeout and rate limit errors
    if (
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('too many requests')
    ) {
      return { severity: ErrorSeverity.Low, retriable: true, weight: 1 };
    }

    // Default classification
    return { severity: ErrorSeverity.Medium, retriable: true, weight: 1 };
  }

  private initializeErrorStats(): void {
    this.errorStats.clear();
    for (const severity of Object.values(ErrorSeverity)) {
      this.errorStats.set(severity, 0);
    }
  }

  private updateMetrics(): void {
    // Circuit breaker state
    setGauge('hatago_circuit_breaker_state', this.stateToNumber(), {
      name: this.name,
      state: this.state,
    });

    // Failure and success counts
    setGauge('hatago_circuit_breaker_failures', this.failureCount, {
      name: this.name,
    });
    setGauge('hatago_circuit_breaker_successes', this.successCount, {
      name: this.name,
    });
    setGauge('hatago_circuit_breaker_total_calls', this.totalCalls, {
      name: this.name,
    });
    setGauge('hatago_circuit_breaker_slow_calls', this.slowCalls, {
      name: this.name,
    });

    // Error statistics by severity
    for (const [severity, count] of this.errorStats) {
      setGauge('hatago_circuit_breaker_errors', count, {
        name: this.name,
        severity,
      });
    }

    // State transition counter
    incrementCounter('hatago_circuit_breaker_state_transitions', 1, {
      name: this.name,
      state: this.state,
    });
  }

  private stateToNumber(): number {
    switch (this.state) {
      case CircuitState.Closed:
        return 0;
      case CircuitState.HalfOpen:
        return 1;
      case CircuitState.Open:
        return 2;
      default:
        return -1;
    }
  }
}
