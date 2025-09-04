/**
 * Retry strategies
 */

/**
 * Retry strategy configuration
 */
export type RetryStrategy = {
  /** Maximum number of retry attempts */
  maxAttempts: number;

  /** Initial delay in milliseconds */
  initialDelay: number;

  /** Maximum delay in milliseconds */
  maxDelay: number;

  /** Backoff multiplier */
  multiplier: number;

  /** Add jitter to delays */
  jitter: boolean;

  /** Timeout for each attempt in milliseconds */
  attemptTimeout?: number;
};

/**
 * Default retry strategies
 */
export const RetryStrategies = {
  /** Aggressive retry for critical operations */
  aggressive: {
    maxAttempts: 10,
    initialDelay: 100,
    maxDelay: 10000,
    multiplier: 2,
    jitter: true,
    attemptTimeout: 30000
  },

  /** Standard retry for normal operations */
  standard: {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 30000,
    multiplier: 2,
    jitter: true,
    attemptTimeout: 60000
  },

  /** Conservative retry for non-critical operations */
  conservative: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 60000,
    multiplier: 3,
    jitter: true,
    attemptTimeout: 120000
  },

  /** No retry */
  none: {
    maxAttempts: 1,
    initialDelay: 0,
    maxDelay: 0,
    multiplier: 1,
    jitter: false
  }
} as const;

/**
 * Calculate delay for next retry attempt
 */
export function calculateDelay(attempt: number, strategy: RetryStrategy): number {
  if (attempt <= 0) return 0;

  // Calculate exponential backoff
  let delay = strategy.initialDelay * strategy.multiplier ** (attempt - 1);

  // Cap at maximum delay
  delay = Math.min(delay, strategy.maxDelay);

  // Add jitter if enabled
  if (strategy.jitter) {
    const jitterAmount = delay * 0.2; // 20% jitter
    delay += (Math.random() - 0.5) * jitterAmount;
  }

  return Math.max(0, Math.round(delay));
}

/**
 * Check if should retry based on attempt count
 */
export function shouldRetry(attempt: number, strategy: RetryStrategy): boolean {
  return attempt < strategy.maxAttempts;
}

/**
 * Create custom retry strategy
 */
export function createRetryStrategy(options: Partial<RetryStrategy> = {}): RetryStrategy {
  return {
    ...RetryStrategies.standard,
    ...options
  };
}

/**
 * Select strategy based on error classification
 */
export function selectStrategy(errorType: string, severity: string): RetryStrategy {
  // Critical errors get aggressive retry
  if (severity === 'critical') {
    return RetryStrategies.aggressive;
  }

  // Network/timeout errors get standard retry
  if (errorType === 'NetworkError' || errorType === 'TimeoutError') {
    return RetryStrategies.standard;
  }

  // Validation errors don't retry
  if (errorType === 'ValidationError') {
    return RetryStrategies.none;
  }

  // Default to conservative
  return RetryStrategies.conservative;
}
