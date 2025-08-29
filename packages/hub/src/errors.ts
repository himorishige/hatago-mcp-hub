/**
 * Error types for Hatago Hub
 */

/**
 * Base error class for all Hatago errors
 */
export class HatagoError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;
  public readonly data?: unknown;

  constructor(
    message: string,
    code: string,
    options?: {
      cause?: unknown;
      data?: unknown;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = options?.cause;
    this.data = options?.data;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Configuration error
 */
export class ConfigError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, "CONFIG_ERROR", options);
  }
}

/**
 * Transport error
 */
export class TransportError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, "TRANSPORT_ERROR", options);
  }
}

/**
 * Tool invocation error
 */
export class ToolInvocationError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, "TOOL_INVOCATION_ERROR", options);
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, "TIMEOUT_ERROR", options);
  }
}

/**
 * Session error
 */
export class SessionError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, "SESSION_ERROR", options);
  }
}

/**
 * Unsupported feature error
 */
export class UnsupportedFeatureError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, "UNSUPPORTED_FEATURE", options);
  }
}

/**
 * Convert any error to HatagoError
 */
export function toHatagoError(error: unknown): HatagoError {
  if (error instanceof HatagoError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes("timeout")) {
      return new TimeoutError(error.message, { cause: error });
    }
    if (
      error.message.includes("transport") ||
      error.message.includes("connect")
    ) {
      return new TransportError(error.message, { cause: error });
    }
    if (error.message.includes("config")) {
      return new ConfigError(error.message, { cause: error });
    }

    // Generic error
    return new HatagoError(error.message, "INTERNAL_ERROR", { cause: error });
  }

  // Unknown error type
  return new HatagoError(String(error), "UNKNOWN_ERROR", { cause: error });
}
