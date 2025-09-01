import type { WaitForOptions } from './types.js';

/**
 * Wait for a condition to become true
 */
export async function waitFor<T>(
  predicate: () => T | Promise<T>,
  options: WaitForOptions = {}
): Promise<T> {
  const {
    timeout = 5000,
    interval = 100,
    errorMessage = 'Timeout waiting for condition'
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await predicate();
      if (result) {
        return result;
      }
    } catch {
      // Continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`${errorMessage} (timeout: ${timeout}ms)`);
}

/**
 * Wait for a specific amount of time
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
