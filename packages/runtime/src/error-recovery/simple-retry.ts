/**
 * Simple retry mechanism - Hatago philosophy compliant
 * Thin implementation without complex state management [SF][DM]
 */

import { isTransientError } from './error-classifier.js';

/**
 * Simple retry with exponential backoff
 * @param fn Function to retry
 * @param maxAttempts Maximum number of attempts (default: 3)
 * @param delayMs Initial delay in milliseconds (default: 1000)
 */
export async function simpleRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Simple exponential backoff without jitter
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Throw the last error
  throw lastError;
}

/**
 * Retry once for idempotent operations with transient errors
 * @param fn Function to retry
 * @param options Options for retry behavior
 */
export async function retryOnce<T>(
  fn: () => Promise<T>,
  options?: { isIdempotent?: boolean; delayMs?: number }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Only retry idempotent operations with transient errors
    if (options?.isIdempotent && isTransientError(error)) {
      // Small delay with jitter (100-150ms)
      const delay = (options?.delayMs ?? 100) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fn();
    }
    throw error;
  }
}

/**
 * Simple timeout wrapper
 * @param fn Function to execute
 * @param timeoutMs Timeout in milliseconds
 */
export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Legacy exports for compatibility - will be removed in next major version
export { simpleRetry as retry };
export { retryOnce as withRetry };
