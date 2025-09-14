/**
 * Minimal error classification - Hatago philosophy compliant [SF][DM]
 * Only essential transient error detection
 */

/**
 * Check if error is transient and retryable
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // Network and timeout errors are typically transient
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('econnreset')
  );
}
