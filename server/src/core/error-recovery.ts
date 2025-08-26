/**
 * Error recovery mechanisms for Hatago
 *
 * Provides resilience without heavy dependencies:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Error classification
 * - Retry strategies
 */

import { logger } from '../observability/minimal-logger.js';

/**
 * Error types for classification
 */
export enum ErrorType {
  TRANSPORT = 'TransportError',
  PROTOCOL = 'ProtocolError',
  TOOL = 'ToolError',
  LAUNCH = 'LaunchError',
  TIMEOUT = 'TimeoutError',
  UNKNOWN = 'UnknownError',
}

/**
 * Classify error type
 */
export function classifyError(error: unknown): ErrorType {
  if (!error) return ErrorType.UNKNOWN;

  const errorObj = error as { message?: string; code?: string };
  const message = errorObj.message || '';
  const code = errorObj.code || '';

  // Transport errors
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE'
  ) {
    return ErrorType.TRANSPORT;
  }

  // Protocol errors
  if (
    message.includes('protocol') ||
    message.includes('handshake') ||
    message.includes('version')
  ) {
    return ErrorType.PROTOCOL;
  }

  // Launch errors
  if (
    code === 'ENOENT' ||
    code === 'EACCES' ||
    message.includes('spawn') ||
    message.includes('launch')
  ) {
    return ErrorType.LAUNCH;
  }

  // Timeout errors
  if (message.includes('timeout') || code === 'ETIMEDOUT') {
    return ErrorType.TIMEOUT;
  }

  // Tool errors
  if (message.includes('tool') || message.includes('execution')) {
    return ErrorType.TOOL;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Determine if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const errorType = classifyError(error);

  // Retryable: transport, timeout, some launch errors
  if (errorType === ErrorType.TRANSPORT || errorType === ErrorType.TIMEOUT) {
    return true;
  }

  // Launch errors are retryable if it's a temporary issue
  if (errorType === ErrorType.LAUNCH) {
    const errorObj = error as { code?: string };
    const code = errorObj.code || '';
    return code !== 'ENOENT' && code !== 'EACCES'; // File not found or permission denied are not retryable
  }

  // Protocol and tool errors are generally not retryable
  return false;
}

/**
 * Backoff configuration
 */
export interface BackoffConfig {
  initialDelay?: number;
  maxDelay?: number;
  multiplier?: number;
  jitter?: number;
  maxAttempts?: number;
}

/**
 * Default backoff configuration
 */
export const DEFAULT_BACKOFF_CONFIG: Required<BackoffConfig> = {
  initialDelay: 100,
  maxDelay: 5000,
  multiplier: 2,
  jitter: 0.2,
  maxAttempts: 5,
};

/**
 * Calculate backoff delay with jitter
 */
export function calculateBackoff(
  attempt: number,
  config: BackoffConfig = {},
): number {
  const cfg = { ...DEFAULT_BACKOFF_CONFIG, ...config };

  if (attempt >= cfg.maxAttempts) {
    throw new Error(`Max attempts (${cfg.maxAttempts}) exceeded`);
  }

  // Exponential backoff
  let delay = Math.min(
    cfg.initialDelay * cfg.multiplier ** attempt,
    cfg.maxDelay,
  );

  // Add jitter (±jitter%)
  if (cfg.jitter > 0) {
    const jitterAmount = delay * cfg.jitter;
    delay += (Math.random() * 2 - 1) * jitterAmount;
  }

  return Math.floor(delay);
}

/**
 * Retry with backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: BackoffConfig = {},
): Promise<T> {
  const cfg = { ...DEFAULT_BACKOFF_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        logger.debug(`Non-retryable error: ${error}`);
        throw error;
      }

      if (attempt < cfg.maxAttempts - 1) {
        const delay = calculateBackoff(attempt, cfg);
        logger.debug(
          `Retry attempt ${attempt + 1}/${cfg.maxAttempts} after ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(`All retry attempts failed`, {
    attempts: cfg.maxAttempts,
    error: lastError,
  });
  throw lastError;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
  halfOpenMaxAttempts?: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 5, // Open after 5 failures
  resetTimeout: 30000, // 30 seconds before trying half-open
  monitoringPeriod: 60000, // Monitor failures within 60 seconds
  halfOpenMaxAttempts: 3, // Max attempts in half-open state
};

/**
 * Simple circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number[] = [];
  private lastOpenTime = 0;
  private halfOpenAttempts = 0;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(
    private readonly name: string,
    config: CircuitBreakerConfig = {},
  ) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (now - this.lastOpenTime >= this.config.resetTimeout) {
        logger.info(`Circuit breaker ${this.name}: transitioning to half-open`);
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    // Execute the function
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      logger.info(
        `Circuit breaker ${this.name}: closing after successful half-open attempt`,
      );
      this.state = CircuitState.CLOSED;
      this.failures = [];
      this.halfOpenAttempts = 0;
    } else if (this.state === CircuitState.CLOSED) {
      // Remove old failures outside monitoring period
      const now = Date.now();
      this.failures = this.failures.filter(
        (time) => now - time < this.config.monitoringPeriod,
      );
    }
  }

  private onFailure(): void {
    const now = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        logger.warn(
          `Circuit breaker ${this.name}: reopening after half-open failures`,
        );
        this.state = CircuitState.OPEN;
        this.lastOpenTime = now;
        this.halfOpenAttempts = 0;
      }
      return;
    }

    // Add failure and check threshold
    this.failures.push(now);

    // Clean old failures
    this.failures = this.failures.filter(
      (time) => now - time < this.config.monitoringPeriod,
    );

    if (this.failures.length >= this.config.failureThreshold) {
      logger.warn(
        `Circuit breaker ${this.name}: opening after ${this.failures.length} failures`,
      );
      this.state = CircuitState.OPEN;
      this.lastOpenTime = now;
      this.failures = [];
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.lastOpenTime = 0;
    this.halfOpenAttempts = 0;
    logger.info(`Circuit breaker ${this.name}: manually reset`);
  }

  /**
   * Get statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    lastOpenTime: number;
  } {
    return {
      state: this.state,
      failures: this.failures.length,
      lastOpenTime: this.lastOpenTime,
    };
  }
}

/**
 * Circuit breaker registry
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker
   */
  get(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Reset all breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get all breaker stats
   */
  getAllStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }
}

/**
 * Global circuit breaker registry
 */
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Execute with circuit breaker and retry
 */
export async function executeWithRecovery<T>(
  name: string,
  fn: () => Promise<T>,
  options: {
    backoff?: BackoffConfig;
    circuitBreaker?: CircuitBreakerConfig;
  } = {},
): Promise<T> {
  const breaker = circuitBreakerRegistry.get(name, options.circuitBreaker);

  return breaker.execute(async () => {
    return retryWithBackoff(fn, options.backoff);
  });
}
