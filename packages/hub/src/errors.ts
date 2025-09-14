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
 * Error classes for backward compatibility
 * These are simple Error subclasses without the deprecated HatagoError base
 */
export class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ConfigError';
    if (options?.cause) this.cause = options.cause;
  }
}

export class TransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'TransportError';
    if (options?.cause) this.cause = options.cause;
  }
}

export class ToolInvocationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ToolInvocationError';
    if (options?.cause) this.cause = options.cause;
  }
}

export class TimeoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'TimeoutError';
    if (options?.cause) this.cause = options.cause;
  }
}

export class SessionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'SessionError';
    if (options?.cause) this.cause = options.cause;
  }
}

export class UnsupportedFeatureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'UnsupportedFeatureError';
    if (options?.cause) this.cause = options.cause;
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

  // Check for specific error classes
  if (error instanceof ConfigError) {
    return createHatagoError('config', error.message, { cause: error });
  }
  if (error instanceof TransportError) {
    return createHatagoError('transport', error.message, { cause: error });
  }
  if (error instanceof ToolInvocationError) {
    return createHatagoError('tool_invocation', error.message, { cause: error });
  }
  if (error instanceof TimeoutError) {
    return createHatagoError('timeout', error.message, { cause: error });
  }
  if (error instanceof SessionError) {
    return createHatagoError('session', error.message, { cause: error });
  }
  if (error instanceof UnsupportedFeatureError) {
    return createHatagoError('unsupported_feature', error.message, { cause: error });
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
