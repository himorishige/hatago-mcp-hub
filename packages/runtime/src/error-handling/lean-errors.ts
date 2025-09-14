/**
 * Lean error handling - minimal error types
 *
 * Following Hatago philosophy: "Don't judge, pass through"
 * Only 4 basic error types, no complex classification or recovery
 */

/**
 * Basic error types - minimal set
 */
export enum LeanErrorType {
  TRANSPORT = 'TransportError',
  PROTOCOL = 'ProtocolError',
  TIMEOUT = 'TimeoutError',
  CANCELLED = 'CancelledError'
}

/**
 * Simple error wrapper
 */
export type LeanError = {
  type: LeanErrorType;
  message: string;
  originalError?: unknown;
};

/**
 * Create a transport error
 */
export function transportError(message: string, originalError?: unknown): LeanError {
  return {
    type: LeanErrorType.TRANSPORT,
    message,
    originalError
  };
}

/**
 * Create a protocol error
 */
export function protocolError(message: string, originalError?: unknown): LeanError {
  return {
    type: LeanErrorType.PROTOCOL,
    message,
    originalError
  };
}

/**
 * Create a timeout error
 */
export function timeoutError(message: string, originalError?: unknown): LeanError {
  return {
    type: LeanErrorType.TIMEOUT,
    message,
    originalError
  };
}

/**
 * Create a cancelled error
 */
export function cancelledError(message: string, originalError?: unknown): LeanError {
  return {
    type: LeanErrorType.CANCELLED,
    message,
    originalError
  };
}

/**
 * Simple error classification based on message
 * This is only for compatibility - prefer specific error constructors
 */
export function classifyError(error: unknown): LeanError {
  const message = error instanceof Error ? error.message : String(error);

  // Simple keyword-based classification
  if (message.toLowerCase().includes('timeout')) {
    return timeoutError(message, error);
  }

  if (message.toLowerCase().includes('cancel')) {
    return cancelledError(message, error);
  }

  if (message.toLowerCase().includes('protocol')) {
    return protocolError(message, error);
  }

  // Default to transport error
  return transportError(message, error);
}

/**
 * Convert LeanError to standard Error
 */
export function toError(leanError: LeanError): Error {
  const error = new Error(leanError.message);
  error.name = leanError.type;
  return error;
}

/**
 * Simple retry with exponential backoff
 * No complex strategies or circuit breakers
 */
export async function simpleRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 10000;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Simple exponential backoff with jitter
      const baseDelay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
      const delay = Math.floor(baseDelay + jitter);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Execute with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(toError(timeoutError(timeoutMessage))), timeoutMs)
    )
  ]);
}

/**
 * Execute with cancellation support
 */
export async function withCancellation<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    throw toError(cancelledError('Operation cancelled'));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(toError(cancelledError('Operation cancelled')));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    fn(signal)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
  });
}
