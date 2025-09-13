/**
 * Error types for Hatago Hub
 */

/**
 * Error codes for different error types
 */
export const ErrorCode = {
  CONFIG_ERROR: 'CONFIG_ERROR',
  TRANSPORT_ERROR: 'TRANSPORT_ERROR',
  TOOL_INVOCATION_ERROR: 'TOOL_INVOCATION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  SESSION_ERROR: 'SESSION_ERROR',
  UNSUPPORTED_FEATURE: 'UNSUPPORTED_FEATURE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Discriminated Union for Hatago errors
 */
export type HatagoErrorType =
  | { kind: 'config'; message: string; cause?: unknown; data?: unknown }
  | { kind: 'transport'; message: string; cause?: unknown; data?: unknown }
  | { kind: 'tool_invocation'; message: string; cause?: unknown; data?: unknown }
  | { kind: 'timeout'; message: string; timeoutMs?: number; cause?: unknown; data?: unknown }
  | { kind: 'session'; message: string; sessionId?: string; cause?: unknown; data?: unknown }
  | {
      kind: 'unsupported_feature';
      message: string;
      feature?: string;
      cause?: unknown;
      data?: unknown;
    }
  | { kind: 'internal'; message: string; cause?: unknown; data?: unknown }
  | { kind: 'unknown'; message: string; cause?: unknown; data?: unknown };

/**
 * Create a Hatago error
 */
export function createHatagoError(
  kind: HatagoErrorType['kind'],
  message: string,
  options?: {
    cause?: unknown;
    data?: unknown;
    [key: string]: unknown;
  }
): HatagoErrorType {
  const base = {
    message,
    cause: options?.cause,
    data: options?.data
  };

  switch (kind) {
    case 'config':
      return { kind, ...base };
    case 'transport':
      return { kind, ...base };
    case 'tool_invocation':
      return { kind, ...base };
    case 'timeout':
      return { kind, ...base, timeoutMs: options?.timeoutMs as number | undefined };
    case 'session':
      return { kind, ...base, sessionId: options?.sessionId as string | undefined };
    case 'unsupported_feature':
      return { kind, ...base, feature: options?.feature as string | undefined };
    case 'internal':
      return { kind, ...base };
    case 'unknown':
      return { kind, ...base };
    default:
      return { kind: 'unknown', ...base };
  }
}

/**
 * Type guards for error types
 */
export function isConfigError(
  error: HatagoErrorType
): error is Extract<HatagoErrorType, { kind: 'config' }> {
  return error.kind === 'config';
}

export function isTransportError(
  error: HatagoErrorType
): error is Extract<HatagoErrorType, { kind: 'transport' }> {
  return error.kind === 'transport';
}

export function isToolInvocationError(
  error: HatagoErrorType
): error is Extract<HatagoErrorType, { kind: 'tool_invocation' }> {
  return error.kind === 'tool_invocation';
}

export function isTimeoutError(
  error: HatagoErrorType
): error is Extract<HatagoErrorType, { kind: 'timeout' }> {
  return error.kind === 'timeout';
}

export function isSessionError(
  error: HatagoErrorType
): error is Extract<HatagoErrorType, { kind: 'session' }> {
  return error.kind === 'session';
}

export function isUnsupportedFeatureError(
  error: HatagoErrorType
): error is Extract<HatagoErrorType, { kind: 'unsupported_feature' }> {
  return error.kind === 'unsupported_feature';
}

export function isInternalError(
  error: HatagoErrorType
): error is Extract<HatagoErrorType, { kind: 'internal' }> {
  return error.kind === 'internal';
}

export function isUnknownError(
  error: HatagoErrorType
): error is Extract<HatagoErrorType, { kind: 'unknown' }> {
  return error.kind === 'unknown';
}

/**
 * Convert to standard Error for throwing
 */
export function toError(hatagoError: HatagoErrorType): Error {
  const error = new Error(hatagoError.message);
  error.name = `HatagoError:${hatagoError.kind}`;

  if (hatagoError.cause) {
    error.cause = hatagoError.cause;
  }

  // Add extra properties
  Object.defineProperty(error, 'hatagoError', {
    value: hatagoError,
    enumerable: false,
    writable: false
  });

  return error;
}

/**
 * Base error class for all Hatago errors (deprecated, use createHatagoError)
 * @deprecated Use createHatagoError and HatagoErrorType instead
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
    super(message, 'CONFIG_ERROR', options);
  }
}

/**
 * Transport error
 */
export class TransportError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, 'TRANSPORT_ERROR', options);
  }
}

/**
 * Tool invocation error
 */
export class ToolInvocationError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, 'TOOL_INVOCATION_ERROR', options);
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, 'TIMEOUT_ERROR', options);
  }
}

/**
 * Session error
 */
export class SessionError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, 'SESSION_ERROR', options);
  }
}

/**
 * Unsupported feature error
 */
export class UnsupportedFeatureError extends HatagoError {
  constructor(message: string, options?: { cause?: unknown; data?: unknown }) {
    super(message, 'UNSUPPORTED_FEATURE', options);
  }
}

/**
 * Convert any error to HatagoErrorType
 */
export function toHatagoErrorType(error: unknown): HatagoErrorType {
  // If it's already a HatagoErrorType
  if (error && typeof error === 'object' && 'kind' in error) {
    const e = error as { kind: unknown };
    if (typeof e.kind === 'string') {
      return error as HatagoErrorType;
    }
  }

  // If it's a legacy HatagoError class
  if (error instanceof HatagoError) {
    const codeToKind: Record<string, HatagoErrorType['kind']> = {
      CONFIG_ERROR: 'config',
      TRANSPORT_ERROR: 'transport',
      TOOL_INVOCATION_ERROR: 'tool_invocation',
      TIMEOUT_ERROR: 'timeout',
      SESSION_ERROR: 'session',
      UNSUPPORTED_FEATURE: 'unsupported_feature',
      INTERNAL_ERROR: 'internal',
      UNKNOWN_ERROR: 'unknown'
    };

    return createHatagoError(codeToKind[error.code] ?? 'unknown', error.message, {
      cause: error.cause,
      data: error.data
    });
  }

  if (error instanceof Error) {
    // Check for specific error patterns (case-insensitive)
    const lowerMessage = error.message.toLowerCase();

    if (lowerMessage.includes('timeout')) {
      return createHatagoError('timeout', error.message, { cause: error });
    }
    if (lowerMessage.includes('transport') || lowerMessage.includes('connect')) {
      return createHatagoError('transport', error.message, { cause: error });
    }
    if (lowerMessage.includes('config')) {
      return createHatagoError('config', error.message, { cause: error });
    }

    // Generic error
    return createHatagoError('internal', error.message, { cause: error });
  }

  // Unknown error type
  return createHatagoError('unknown', String(error), { cause: error });
}

/**
 * Convert any error to HatagoError (deprecated)
 * @deprecated Use toHatagoErrorType instead
 */
export function toHatagoError(error: unknown): HatagoError {
  // Return HatagoError instances as-is
  if (error instanceof HatagoError) {
    return error;
  }

  const errorType = toHatagoErrorType(error);

  // Map to the appropriate error class
  switch (errorType.kind) {
    case 'config':
      return new ConfigError(errorType.message, { cause: errorType.cause, data: errorType.data });
    case 'transport':
      return new TransportError(errorType.message, {
        cause: errorType.cause,
        data: errorType.data
      });
    case 'tool_invocation':
      return new ToolInvocationError(errorType.message, {
        cause: errorType.cause,
        data: errorType.data
      });
    case 'timeout':
      return new TimeoutError(errorType.message, { cause: errorType.cause, data: errorType.data });
    case 'session':
      return new SessionError(errorType.message, { cause: errorType.cause, data: errorType.data });
    case 'unsupported_feature':
      return new UnsupportedFeatureError(errorType.message, {
        cause: errorType.cause,
        data: errorType.data
      });
    case 'internal':
      return new HatagoError(errorType.message, 'INTERNAL_ERROR', {
        cause: errorType.cause,
        data: errorType.data
      });
    case 'unknown':
    default:
      return new HatagoError(errorType.message, 'UNKNOWN_ERROR', {
        cause: errorType.cause,
        data: errorType.data
      });
  }
}
