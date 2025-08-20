/**
 * Hatago Hub Error Management System
 * Standardized error codes and error handling
 */

/**
 * Error codes for Hatago Hub
 */
export enum ErrorCode {
  // MCP Related Errors (E_MCP_*)
  E_MCP_INIT_TIMEOUT = 'E_MCP_INIT_TIMEOUT',
  E_MCP_TOOL_DISCOVERY_EMPTY = 'E_MCP_TOOL_DISCOVERY_EMPTY',
  E_MCP_CONNECTION_FAILED = 'E_MCP_CONNECTION_FAILED',
  E_MCP_PROTOCOL_ERROR = 'E_MCP_PROTOCOL_ERROR',
  E_MCP_INVALID_REQUEST = 'E_MCP_INVALID_REQUEST',

  // NPX Related Errors (E_NPX_*)
  E_NPX_INSTALL_FAILED = 'E_NPX_INSTALL_FAILED',
  E_NPX_PACKAGE_NOT_FOUND = 'E_NPX_PACKAGE_NOT_FOUND',
  E_NPX_SPAWN_FAILED = 'E_NPX_SPAWN_FAILED',
  E_NPX_CACHE_CHECK_FAILED = 'E_NPX_CACHE_CHECK_FAILED',
  E_NPX_WARMUP_FAILED = 'E_NPX_WARMUP_FAILED',

  // Session Related Errors (E_SESSION_*)
  E_SESSION_NOT_FOUND = 'E_SESSION_NOT_FOUND',
  E_SESSION_EXPIRED = 'E_SESSION_EXPIRED',
  E_SESSION_VERSION_CONFLICT = 'E_SESSION_VERSION_CONFLICT',
  E_SESSION_LOCK_TIMEOUT = 'E_SESSION_LOCK_TIMEOUT',
  E_SESSION_INVALID_TOKEN = 'E_SESSION_INVALID_TOKEN',

  // Configuration Errors (E_CONFIG_*)
  E_CONFIG_INVALID = 'E_CONFIG_INVALID',
  E_CONFIG_NOT_FOUND = 'E_CONFIG_NOT_FOUND',
  E_CONFIG_PARSE_ERROR = 'E_CONFIG_PARSE_ERROR',
  E_CONFIG_VALIDATION_FAILED = 'E_CONFIG_VALIDATION_FAILED',

  // Tool Registry Errors (E_TOOL_*)
  E_TOOL_NAME_COLLISION = 'E_TOOL_NAME_COLLISION',
  E_TOOL_NOT_FOUND = 'E_TOOL_NOT_FOUND',
  E_TOOL_EXECUTION_FAILED = 'E_TOOL_EXECUTION_FAILED',

  // Server State Errors (E_STATE_*)
  E_STATE_INVALID_TRANSITION = 'E_STATE_INVALID_TRANSITION',
  E_STATE_ALREADY_RUNNING = 'E_STATE_ALREADY_RUNNING',
  E_STATE_NOT_RUNNING = 'E_STATE_NOT_RUNNING',

  // Security Errors (E_SECURITY_*)
  E_SECURITY_POLICY_DENIED = 'E_SECURITY_POLICY_DENIED',
  E_SECURITY_ENCRYPTION_FAILED = 'E_SECURITY_ENCRYPTION_FAILED',
  E_SECURITY_DECRYPTION_FAILED = 'E_SECURITY_DECRYPTION_FAILED',
  E_SECURITY_KEY_NOT_FOUND = 'E_SECURITY_KEY_NOT_FOUND',

  // System Errors (E_SYSTEM_*)
  E_SYSTEM_RESOURCE_EXHAUSTED = 'E_SYSTEM_RESOURCE_EXHAUSTED',
  E_SYSTEM_FILE_NOT_FOUND = 'E_SYSTEM_FILE_NOT_FOUND',
  E_SYSTEM_PERMISSION_DENIED = 'E_SYSTEM_PERMISSION_DENIED',
  E_SYSTEM_NETWORK_ERROR = 'E_SYSTEM_NETWORK_ERROR',
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  CRITICAL = 'critical', // System cannot continue
  ERROR = 'error', // Operation failed
  WARNING = 'warning', // Operation completed with issues
  INFO = 'info', // Informational error
}

/**
 * Extended error information
 */
export interface ErrorContext {
  serverId?: string;
  sessionId?: string;
  toolName?: string;
  configPath?: string;
  timestamp?: Date;
  stack?: string;
  [key: string]: unknown;
}

/**
 * Hatago Hub custom error class
 */
export class HatagoError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      severity?: ErrorSeverity;
      context?: ErrorContext;
      cause?: Error;
      recoverable?: boolean;
    },
  ) {
    super(message);
    this.name = 'HatagoError';
    this.code = code;
    this.severity = options?.severity || ErrorSeverity.ERROR;
    this.context = options?.context || {};
    this.timestamp = new Date();
    this.recoverable = options?.recoverable ?? false;

    // Set cause if provided (ES2022)
    if (options?.cause) {
      this.cause = options.cause;
      // Include cause stack in context
      if (options.cause instanceof Error && options.cause.stack) {
        this.context.causeStack = options.cause.stack;
      }
    }

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON-RPC error format
   */
  toJsonRpcError(): {
    code: number;
    message: string;
    data?: unknown;
  } {
    // Map error codes to JSON-RPC error codes
    let jsonRpcCode = -32603; // Internal error (default)

    switch (this.code) {
      case ErrorCode.E_MCP_INVALID_REQUEST:
      case ErrorCode.E_CONFIG_INVALID:
        jsonRpcCode = -32600; // Invalid Request
        break;
      case ErrorCode.E_TOOL_NOT_FOUND:
        jsonRpcCode = -32601; // Method not found
        break;
      case ErrorCode.E_CONFIG_VALIDATION_FAILED:
        jsonRpcCode = -32602; // Invalid params
        break;
      case ErrorCode.E_SESSION_NOT_FOUND:
      case ErrorCode.E_SESSION_EXPIRED:
        jsonRpcCode = -32001; // Custom server error
        break;
      case ErrorCode.E_SECURITY_POLICY_DENIED:
        jsonRpcCode = -32002; // Custom server error
        break;
    }

    return {
      code: jsonRpcCode,
      message: this.message,
      data: {
        code: this.code,
        severity: this.severity,
        context: this.context,
        timestamp: this.timestamp,
        recoverable: this.recoverable,
      },
    };
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(): boolean {
    return this.recoverable;
  }

  /**
   * Create a critical error
   */
  static critical(
    code: ErrorCode,
    message: string,
    context?: ErrorContext,
  ): HatagoError {
    return new HatagoError(code, message, {
      severity: ErrorSeverity.CRITICAL,
      context,
      recoverable: false,
    });
  }

  /**
   * Create a warning-level error
   */
  static warning(
    code: ErrorCode,
    message: string,
    context?: ErrorContext,
  ): HatagoError {
    return new HatagoError(code, message, {
      severity: ErrorSeverity.WARNING,
      context,
      recoverable: true,
    });
  }

  /**
   * Wrap a native error
   */
  static from(
    error: Error | unknown,
    code: ErrorCode = ErrorCode.E_SYSTEM_NETWORK_ERROR,
    context?: ErrorContext,
  ): HatagoError {
    if (error instanceof HatagoError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return new HatagoError(code, message, {
      context,
      cause,
    });
  }
}

/**
 * Error handler utility
 */
const errorHandlers = new Map<ErrorCode, (error: HatagoError) => void>();

/**
 * Register an error handler for a specific error code
 */
export function registerErrorHandler(
  code: ErrorCode,
  handler: (error: HatagoError) => void,
): void {
  errorHandlers.set(code, handler);
}

/**
 * Handle an error
 */
export function handleError(error: Error | HatagoError): void {
  const hatagoError =
    error instanceof HatagoError ? error : HatagoError.from(error);

  // Call specific handler if registered
  const handler = errorHandlers.get(hatagoError.code);
  if (handler) {
    handler(hatagoError);
  }

  // Log based on severity
  switch (hatagoError.severity) {
    case ErrorSeverity.CRITICAL:
      console.error('❌ CRITICAL:', hatagoError.message, hatagoError.context);
      break;
    case ErrorSeverity.ERROR:
      console.error('❌ ERROR:', hatagoError.message, hatagoError.context);
      break;
    case ErrorSeverity.WARNING:
      console.warn('⚠️ WARNING:', hatagoError.message, hatagoError.context);
      break;
    case ErrorSeverity.INFO:
      console.info('ℹ️ INFO:', hatagoError.message, hatagoError.context);
      break;
  }
}

/**
 * Check if an error matches a specific code
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof HatagoError && error.code === code;
}

/**
 * Error recovery strategies
 */

/**
 * Retry an operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is recoverable
      if (error instanceof HatagoError && !error.isRecoverable()) {
        throw error;
      }

      if (attempt < maxRetries) {
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * factor, maxDelay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}
