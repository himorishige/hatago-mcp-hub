/**
 * Error recovery module exports
 */

// Circuit breaker
export {
  CircuitBreaker,
  type CircuitBreakerConfig,
  CircuitState,
  createCircuitBreaker,
  withCircuitBreaker,
} from './circuit-breaker.js';
// Error classification
export {
  type ClassifiedError,
  classifyError,
  ErrorSeverity,
  ErrorType,
} from './error-classifier.js';
// Retry mechanisms
export {
  batchRetry,
  makeRetryable,
  type RetryOptions,
  type RetryResult,
  retry,
  retryWithTimeout,
  withRetry,
} from './retry.js';
// Retry strategies
export {
  calculateDelay,
  createRetryStrategy,
  RetryStrategies,
  type RetryStrategy,
  selectStrategy,
  shouldRetry,
} from './strategies.js';
