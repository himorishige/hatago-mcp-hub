/**
 * Simple retry utility with exponential backoff
 * Replacement for complex circuit breaker
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Simple retry with exponential backoff
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!shouldRetry(error)) {
        throw error;
      }

      // Don't delay on last attempt
      if (attempt === maxRetries - 1) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelayMs * backoffFactor ** attempt,
        maxDelayMs,
      );

      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('ECONNREFUSED')) return true;
    if (error.message.includes('ETIMEDOUT')) return true;
    if (error.message.includes('ENOTFOUND')) return true;

    // Temporary failures
    if (error.message.includes('EAGAIN')) return true;
    if (error.message.includes('EBUSY')) return true;

    // HTTP status codes (if available)
    if ('statusCode' in error) {
      const status = (error as any).statusCode;
      // Retry on 5xx errors and some 4xx
      if (status >= 500 || status === 429 || status === 408) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Decorator for adding retry to async functions
 */
export function withRetry(options: RetryOptions = {}) {
  return (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return callWithRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}
