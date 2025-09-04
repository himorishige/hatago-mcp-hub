/**
 * Retry mechanism with exponential backoff
 */

import { type ClassifiedError, classifyError } from './error-classifier.js';
import { calculateDelay, type RetryStrategy, selectStrategy, shouldRetry } from './strategies.js';

/**
 * Retry options
 */
export interface RetryOptions {
  /** Retry strategy to use */
  strategy?: RetryStrategy;

  /** Custom retry condition */
  shouldRetry?: (error: ClassifiedError, attempt: number) => boolean;

  /** Callback before each retry */
  onRetry?: (error: ClassifiedError, attempt: number, delay: number) => void;

  /** Callback on final failure */
  onFinalError?: (error: ClassifiedError, attempts: number) => void;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Retry result
 */
export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: ClassifiedError;
  attempts: number;
  totalTime: number;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;
  let lastError: ClassifiedError | undefined;

  while (true) {
    attempts++;

    // Check abort signal
    if (options.signal?.aborted) {
      return {
        success: false,
        error: classifyError(new Error('Operation aborted')),
        attempts,
        totalTime: Date.now() - startTime
      };
    }

    try {
      const value = await fn();
      return {
        success: true,
        value,
        attempts,
        totalTime: Date.now() - startTime
      };
    } catch (error) {
      lastError = classifyError(error);

      // Determine strategy
      const strategy = options.strategy ?? selectStrategy(lastError.type, lastError.severity);

      // Check if should retry
      const shouldRetryError = options.shouldRetry
        ? options.shouldRetry(lastError, attempts)
        : lastError.retryable && shouldRetry(attempts, strategy);

      if (!shouldRetryError) {
        if (options.onFinalError) {
          options.onFinalError(lastError, attempts);
        }

        return {
          success: false,
          error: lastError,
          attempts,
          totalTime: Date.now() - startTime
        };
      }

      // Calculate delay
      const delay = calculateDelay(attempts, strategy);

      // Callback before retry
      if (options.onRetry) {
        options.onRetry(lastError, attempts, delay);
      }

      // Wait before retry
      await sleep(delay);
    }
  }
}

/**
 * Simple retry wrapper for common use cases
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  const result = await withRetry(fn, {
    strategy: {
      maxAttempts,
      initialDelay: delayMs,
      maxDelay: delayMs * 10,
      multiplier: 2,
      jitter: true
    }
  });

  if (!result.success) {
    throw result.error?.originalError ?? new Error('Retry failed');
  }

  return result.value!;
}

/**
 * Retry with timeout per attempt
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const timeoutFn = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // If fn supports abort signal, pass it
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error(`Timeout after ${timeoutMs}ms`));
          });
        })
      ]);

      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  return withRetry(timeoutFn, options);
}

/**
 * Batch retry for multiple operations
 */
export async function batchRetry<T>(
  operations: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<Array<RetryResult<T>>> {
  return Promise.all(operations.map((op) => withRetry(op, options)));
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    const result = await withRetry(() => fn(...args), options);

    if (!result.success) {
      throw result.error?.originalError ?? new Error('Operation failed');
    }

    return result.value as ReturnType<T>;
  }) as T;
}
