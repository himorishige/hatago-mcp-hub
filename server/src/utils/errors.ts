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
  E_SYSTEM_SECURITY_ERROR = 'E_SYSTEM_SECURITY_ERROR',
  E_SYSTEM_FS_ERROR = 'E_SYSTEM_FS_ERROR',
  E_SYSTEM_UNKNOWN = 'E_SYSTEM_UNKNOWN',
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
 * Pure functions for creating HatagoError instances
 */

/**
 * Create a critical error
 */
export function createCriticalError(
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
export function createWarningError(
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
 * Wrap a native error into HatagoError
 */
export function createErrorFromUnknown(
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

/**
 * Hatago Hub custom error class
 */
export class HatagoError extends Error {
  public readonly code: ErrorCode | number; // Accept both string and numeric error codes
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;

  constructor(
    code: ErrorCode | number, // Accept both string and numeric error codes
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
   * Convert to JSON format
   */
  toJSON(): {
    code: ErrorCode | number;
    message: string;
    severity: ErrorSeverity;
    recoverable: boolean;
    context?: ErrorContext;
    stack?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      severity: this.severity,
      recoverable: this.recoverable,
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return `[${this.code}] ${this.message}`;
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
    return createCriticalError(code, message, context);
  }

  /**
   * Create a warning-level error
   */
  static warning(
    code: ErrorCode,
    message: string,
    context?: ErrorContext,
  ): HatagoError {
    return createWarningError(code, message, context);
  }

  /**
   * Wrap a native error
   */
  static from(
    error: Error | unknown,
    code: ErrorCode = ErrorCode.E_SYSTEM_NETWORK_ERROR,
    context?: ErrorContext,
  ): HatagoError {
    return createErrorFromUnknown(error, code, context);
  }
}

/**
 * Error handler utility
 */
const errorHandlers = new Map<
  ErrorCode | number,
  (error: HatagoError) => void
>();

/**
 * Register an error handler for a specific error code
 */
export function registerErrorHandler(
  code: ErrorCode | number,
  handler: (error: HatagoError) => void,
): void {
  errorHandlers.set(code, handler);
}

/**
 * Handle an error
 */
export function handleError(error: Error | HatagoError): void {
  const hatagoError =
    error instanceof HatagoError ? error : createErrorFromUnknown(error);

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

/**
 * Error helper functions for common error scenarios
 * These provide a consistent interface for creating typed errors
 */
export const ErrorHelpers = {
  // MCP Related Errors
  mcpInitTimeout: (serverId: string, timeout: number) =>
    new HatagoError(
      ErrorCode.E_MCP_INIT_TIMEOUT,
      `MCP server ${serverId} initialization timeout after ${timeout}ms`,
      {
        severity: ErrorSeverity.ERROR,
        context: { serverId, timeout },
        recoverable: true,
      },
    ),

  mcpConnectionFailed: (serverId: string, reason?: string) =>
    new HatagoError(
      ErrorCode.E_MCP_CONNECTION_FAILED,
      `Failed to connect to MCP server ${serverId}${reason ? `: ${reason}` : ''}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { serverId, reason },
        recoverable: true,
      },
    ),

  mcpProtocolError: (serverId: string, details: string) =>
    new HatagoError(
      ErrorCode.E_MCP_PROTOCOL_ERROR,
      `MCP protocol error for ${serverId}: ${details}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { serverId, details },
        recoverable: false,
      },
    ),

  // NPX Related Errors
  npxInstallFailed: (packageName: string, error?: unknown) =>
    new HatagoError(
      ErrorCode.E_NPX_INSTALL_FAILED,
      `Failed to install NPX package: ${packageName}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { packageName, error: String(error) },
        recoverable: true,
      },
    ),

  npxPackageNotFound: (packageName: string) =>
    new HatagoError(
      ErrorCode.E_NPX_PACKAGE_NOT_FOUND,
      `NPX package not found: ${packageName}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { packageName },
        recoverable: false,
      },
    ),

  // Session Related Errors
  sessionNotFound: (sessionId: string) =>
    new HatagoError(
      ErrorCode.E_SESSION_NOT_FOUND,
      `Session not found: ${sessionId}`,
      {
        severity: ErrorSeverity.WARNING,
        context: { sessionId },
        recoverable: true,
      },
    ),

  sessionExpired: (sessionId: string) =>
    new HatagoError(
      ErrorCode.E_SESSION_EXPIRED,
      `Session expired: ${sessionId}`,
      {
        severity: ErrorSeverity.INFO,
        context: { sessionId },
        recoverable: true,
      },
    ),

  sessionVersionConflict: (
    sessionId: string,
    expected: number,
    actual: number,
  ) =>
    new HatagoError(
      ErrorCode.E_SESSION_VERSION_CONFLICT,
      `Session version conflict for ${sessionId}: expected ${expected}, got ${actual}`,
      {
        severity: ErrorSeverity.WARNING,
        context: { sessionId, expected, actual },
        recoverable: true,
      },
    ),

  // Tool Related Errors
  toolNotFound: (toolName: string, serverId?: string) =>
    new HatagoError(
      ErrorCode.E_TOOL_NOT_FOUND,
      `Tool not found: ${toolName}${serverId ? ` on server ${serverId}` : ''}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { toolName, serverId },
        recoverable: false,
      },
    ),

  toolNameCollision: (
    toolName: string,
    existingServer: string,
    newServer: string,
  ) =>
    new HatagoError(
      ErrorCode.E_TOOL_NAME_COLLISION,
      `Tool name collision: ${toolName} already exists from server ${existingServer}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { toolName, existingServer, newServer },
        recoverable: false,
      },
    ),

  toolExecutionFailed: (toolName: string, error: unknown) =>
    new HatagoError(
      ErrorCode.E_TOOL_EXECUTION_FAILED,
      `Tool execution failed: ${toolName}${String(error).toLowerCase().includes('timeout') ? ' (timeout)' : ''}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { toolName, error: String(error) },
        recoverable: true,
      },
    ),

  // Configuration Errors
  configNotFound: (path: string) =>
    new HatagoError(
      ErrorCode.E_CONFIG_NOT_FOUND,
      `Configuration file not found: ${path}`,
      {
        severity: ErrorSeverity.CRITICAL,
        context: { path },
        recoverable: false,
      },
    ),

  configInvalid: (path: string, errors: string[]) =>
    new HatagoError(
      ErrorCode.E_CONFIG_INVALID,
      `Invalid configuration in ${path}`,
      {
        severity: ErrorSeverity.CRITICAL,
        context: { path, errors },
        recoverable: false,
      },
    ),

  // State Errors
  stateInvalidTransition: (from: string, to: string, entity?: string) =>
    new HatagoError(
      ErrorCode.E_STATE_INVALID_TRANSITION,
      `Invalid state transition from ${from} to ${to}${entity ? ` for ${entity}` : ''}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { from, to, entity },
        recoverable: false,
      },
    ),

  stateAlreadyRunning: (entity: string) =>
    new HatagoError(
      ErrorCode.E_STATE_ALREADY_RUNNING,
      `${entity} is already running`,
      {
        severity: ErrorSeverity.WARNING,
        context: { entity },
        recoverable: true,
      },
    ),

  // Resource/Prompt Errors (additional helpers)
  resourceNotFound: (uri: string, serverId?: string) =>
    new HatagoError(
      ErrorCode.E_MCP_PROTOCOL_ERROR,
      `Resource not found: ${uri}${serverId ? ` on server ${serverId}` : ''}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { uri, serverId },
        recoverable: false,
      },
    ),

  promptNotFound: (name: string, serverId?: string) =>
    new HatagoError(
      ErrorCode.E_MCP_PROTOCOL_ERROR,
      `Prompt not found: ${name}${serverId ? ` on server ${serverId}` : ''}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { name, serverId },
        recoverable: false,
      },
    ),

  serverNotConnected: (serverId: string) =>
    new HatagoError(
      ErrorCode.E_MCP_CONNECTION_FAILED,
      `Server not connected: ${serverId}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { serverId },
        recoverable: true,
      },
    ),

  unsupportedConnectionType: (type: string) =>
    new HatagoError(
      ErrorCode.E_MCP_PROTOCOL_ERROR,
      `Unsupported connection type: ${type}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { type },
        recoverable: false,
      },
    ),

  // Security & Encryption Errors
  encryptionKeyNotAvailable: () =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      'Encryption key not available',
      {
        severity: ErrorSeverity.CRITICAL,
        context: {},
        recoverable: false,
      },
    ),

  integrityCheckFailed: () =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      'Integrity check failed',
      {
        severity: ErrorSeverity.CRITICAL,
        context: {},
        recoverable: false,
      },
    ),

  unsupportedStorageVersion: (version: string) =>
    new HatagoError(
      ErrorCode.E_CONFIG_INVALID,
      `Unsupported storage version: ${version}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { version },
        recoverable: false,
      },
    ),

  invalidSecretFormat: (key: string) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      `Invalid secret format for key: ${key}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { key },
        recoverable: false,
      },
    ),

  // Server Registry Errors
  serverAlreadyRegistered: (serverId: string) =>
    new HatagoError(
      ErrorCode.E_STATE_ALREADY_RUNNING,
      `Server ${serverId} is already registered`,
      {
        severity: ErrorSeverity.WARNING,
        context: { serverId },
        recoverable: true,
      },
    ),

  serverNotRegistered: (serverId: string) =>
    new HatagoError(
      ErrorCode.E_MCP_CONNECTION_FAILED,
      `Server ${serverId} is not registered`,
      {
        severity: ErrorSeverity.ERROR,
        context: { serverId },
        recoverable: false,
      },
    ),

  // Workspace Management Errors
  workspaceNotFound: (workspaceId: string) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_FS_ERROR,
      `Workspace ${workspaceId} not found`,
      {
        severity: ErrorSeverity.ERROR,
        context: { workspaceId },
        recoverable: false,
      },
    ),

  workspaceCreationFailed: (attempts: number) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_FS_ERROR,
      `Failed to create workspace after ${attempts} attempts`,
      {
        severity: ErrorSeverity.ERROR,
        context: { attempts },
        recoverable: true,
      },
    ),

  // Environment & Config Errors
  envVariableNotSet: (varName: string) =>
    new HatagoError(
      ErrorCode.E_CONFIG_INVALID,
      `Environment variable ${varName} is not set`,
      {
        severity: ErrorSeverity.ERROR,
        context: { varName },
        recoverable: false,
      },
    ),

  unsafeEnvVariableName: (name: string) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      `Potentially unsafe environment variable name: ${name}`,
      {
        severity: ErrorSeverity.WARNING,
        context: { name },
        recoverable: false,
      },
    ),

  invalidProfilePath: (path: string) =>
    new HatagoError(
      ErrorCode.E_CONFIG_INVALID,
      `Invalid profile path: ${path}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { path },
        recoverable: false,
      },
    ),

  duplicateServerId: (serverId: string) =>
    new HatagoError(
      ErrorCode.E_CONFIG_INVALID,
      `Duplicate server ID: ${serverId}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { serverId },
        recoverable: false,
      },
    ),

  // System & Runtime Errors
  idGenerationFailed: (attempts: number) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_UNKNOWN,
      `Failed to generate ID after ${attempts} attempts`,
      {
        severity: ErrorSeverity.ERROR,
        context: { attempts },
        recoverable: true,
      },
    ),

  kvStoreAccessFailed: (namespace: string) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_FS_ERROR,
      `Failed to get KV store for namespace: ${namespace}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { namespace },
        recoverable: false,
      },
    ),

  runtimeNotImplemented: (runtime: string) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_UNKNOWN,
      `${runtime} runtime is not yet implemented`,
      {
        severity: ErrorSeverity.ERROR,
        context: { runtime },
        recoverable: false,
      },
    ),

  runtimeLoadFailed: (runtime: string, error: unknown) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_UNKNOWN,
      `Failed to load ${runtime} runtime: ${String(error)}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { runtime, error: String(error) },
        recoverable: false,
      },
    ),

  featureNotAvailable: (feature: string, runtime: string) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_UNKNOWN,
      `${feature} is not available in ${runtime}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { feature, runtime },
        recoverable: false,
      },
    ),

  // Lock & Concurrency Errors
  lockAcquisitionFailed: (resource: string, timeout: number) =>
    new HatagoError(
      ErrorCode.E_SESSION_LOCK_TIMEOUT,
      `Failed to acquire lock for ${resource} after ${timeout}ms`,
      {
        severity: ErrorSeverity.ERROR,
        context: { resource, timeout },
        recoverable: true,
      },
    ),

  // Protocol & Transport Errors
  protocolNegotiationFailed: (versions: string[]) =>
    new HatagoError(
      ErrorCode.E_MCP_PROTOCOL_ERROR,
      `Failed to negotiate protocol version. Tried: ${versions.join(', ')}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { versions },
        recoverable: false,
      },
    ),

  transportNotStarted: () =>
    new HatagoError(
      ErrorCode.E_STATE_INVALID_TRANSITION,
      'Transport not started',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  transportAlreadyStarted: () =>
    new HatagoError(
      ErrorCode.E_STATE_ALREADY_RUNNING,
      'Transport already started',
      {
        severity: ErrorSeverity.WARNING,
        context: {},
        recoverable: true,
      },
    ),

  // General Errors
  notImplemented: (feature: string) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_UNKNOWN,
      `${feature} not yet implemented`,
      {
        severity: ErrorSeverity.ERROR,
        context: { feature },
        recoverable: false,
      },
    ),

  invalidInput: (field: string, reason: string) =>
    new HatagoError(ErrorCode.E_CONFIG_INVALID, `Invalid ${field}: ${reason}`, {
      severity: ErrorSeverity.ERROR,
      context: { field, reason },
      recoverable: false,
    }),

  operationFailed: (operation: string, reason: string) =>
    new HatagoError(
      ErrorCode.E_SYSTEM_UNKNOWN,
      `${operation} failed: ${reason}`,
      {
        severity: ErrorSeverity.ERROR,
        context: { operation, reason },
        recoverable: true,
      },
    ),

  storageNotInitialized: () =>
    new HatagoError(
      ErrorCode.E_STATE_INVALID_TRANSITION,
      'Storage not initialized',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  sessionLimitReached: (sessionId: string) =>
    new HatagoError(
      ErrorCode.E_SESSION_EXPIRED,
      `Session ${sessionId} has reached maximum client limit`,
      {
        severity: ErrorSeverity.WARNING,
        context: { sessionId },
        recoverable: false,
      },
    ),

  invalidToken: () =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      'Invalid or expired token',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  generationNotFound: (generationId: string) =>
    new HatagoError(
      ErrorCode.E_CONFIG_INVALID,
      `Generation ${generationId} not found`,
      {
        severity: ErrorSeverity.ERROR,
        context: { generationId },
        recoverable: false,
      },
    ),

  generationAlreadyDisposed: (generationId: string) =>
    new HatagoError(
      ErrorCode.E_STATE_INVALID_TRANSITION,
      `Generation ${generationId} is already disposed`,
      {
        severity: ErrorSeverity.WARNING,
        context: { generationId },
        recoverable: false,
      },
    ),

  generationSwitchInProgress: () =>
    new HatagoError(
      ErrorCode.E_STATE_ALREADY_RUNNING,
      'Generation switch already in progress',
      {
        severity: ErrorSeverity.WARNING,
        context: {},
        recoverable: true,
      },
    ),

  noPreviousGeneration: () =>
    new HatagoError(
      ErrorCode.E_STATE_INVALID_TRANSITION,
      'No previous generation available for rollback',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  plainModeNotAllowed: () =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      'Plain mode is not allowed by policy',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  plainTextStorageNotAllowed: () =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      'Plain text storage is not allowed',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  cannotRotateKeysInPlainMode: () =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      'Cannot rotate keys in plain mode',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  secretManagerNotInitialized: () =>
    new HatagoError(
      ErrorCode.E_STATE_INVALID_TRANSITION,
      'Secret manager not initialized',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  invalidKey: () =>
    new HatagoError(ErrorCode.E_CONFIG_INVALID, 'Invalid key', {
      severity: ErrorSeverity.ERROR,
      context: {},
      recoverable: false,
    }),

  invalidValue: () =>
    new HatagoError(ErrorCode.E_CONFIG_INVALID, 'Invalid value', {
      severity: ErrorSeverity.ERROR,
      context: {},
      recoverable: false,
    }),

  noWatchPaths: () =>
    new HatagoError(ErrorCode.E_CONFIG_INVALID, 'No watch paths configured', {
      severity: ErrorSeverity.ERROR,
      context: {},
      recoverable: false,
    }),

  configLoadFailed: () =>
    new HatagoError(
      ErrorCode.E_CONFIG_NOT_FOUND,
      'Failed to load any configuration files',
      {
        severity: ErrorSeverity.CRITICAL,
        context: {},
        recoverable: false,
      },
    ),

  invalidDfOutput: () =>
    new HatagoError(ErrorCode.E_SYSTEM_UNKNOWN, 'Invalid df output', {
      severity: ErrorSeverity.ERROR,
      context: {},
      recoverable: false,
    }),

  decryptionFailed: () =>
    new HatagoError(
      ErrorCode.E_SYSTEM_SECURITY_ERROR,
      'Failed to decrypt data',
      {
        severity: ErrorSeverity.ERROR,
        context: {},
        recoverable: false,
      },
    ),

  commandOrUrlRequired: () =>
    new HatagoError(ErrorCode.E_CONFIG_INVALID, 'Command or URL is required', {
      severity: ErrorSeverity.ERROR,
      context: {},
      recoverable: false,
    }),

  invalidConfiguration: () =>
    new HatagoError(ErrorCode.E_CONFIG_INVALID, 'Invalid configuration', {
      severity: ErrorSeverity.CRITICAL,
      context: {},
      recoverable: false,
    }),

  // Component initialization errors
  notInitialized: (componentName: string) =>
    new HatagoError(
      ErrorCode.E_STATE_INVALID_TRANSITION,
      `${componentName} not initialized`,
      {
        severity: ErrorSeverity.ERROR,
        context: { componentName },
        recoverable: false,
      },
    ),

  // Generic error creation from unknown type
  /**
   * Extract error information from unknown error type
   */
  extract(error: unknown): { message: string; code?: string; stack?: string } {
    if (error instanceof Error) {
      return {
        message: error.message,
        code: (error as { code?: string }).code,
        stack: error.stack,
      };
    }

    if (typeof error === 'string') {
      return { message: error };
    }

    if (error && typeof error === 'object') {
      const obj = error as { message?: string; code?: string; stack?: string };
      return {
        message: obj.message || String(error),
        code: obj.code,
        stack: obj.stack,
      };
    }

    return { message: String(error) };
  },

  createErrorFromUnknown: (
    error: Error | unknown,
    code: ErrorCode = ErrorCode.E_SYSTEM_UNKNOWN,
    context?: ErrorContext,
  ) => createErrorFromUnknown(error, code, context),
};
