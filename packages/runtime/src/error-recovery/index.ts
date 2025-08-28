/**
 * Error recovery module exports
 */

// Error classification
export {
  ErrorType,
  ErrorSeverity,
  classifyError,
  type ClassifiedError
} from './error-classifier.js';

// Retry strategies
export {
  RetryStrategies,
  calculateDelay,
  shouldRetry,
  createRetryStrategy,
  selectStrategy,
  type RetryStrategy
} from './strategies.js';

// Circuit breaker
export {
  CircuitState,
  CircuitBreaker,
  createCircuitBreaker,
  withCircuitBreaker,
  type CircuitBreakerConfig
} from './circuit-breaker.js';

// Retry mechanisms
export {
  withRetry,
  retry,
  retryWithTimeout,
  batchRetry,
  makeRetryable,
  type RetryOptions,
  type RetryResult
} from './retry.js';