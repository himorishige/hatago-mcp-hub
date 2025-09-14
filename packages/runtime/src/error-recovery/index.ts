/**
 * Error recovery module - Simplified per Hatago philosophy [SF][DM]
 * Only essential retry functionality, no complex state management
 */

// export { simpleRetry, withTimeout } from './simple-retry.js';  // Using thin implementation instead

export {
  type ClassifiedError,
  // classifyError,  // Using thin implementation instead
  ErrorSeverity,
  ErrorType
} from './error-classifier.js';

export {
  batchRetry,
  makeRetryable,
  type RetryOptions,
  type RetryResult,
  retry,
  retryWithTimeout,
  withRetry
} from './retry.js';

export {
  calculateDelay,
  createRetryStrategy,
  RetryStrategies,
  type RetryStrategy,
  selectStrategy,
  shouldRetry
} from './strategies.js';
