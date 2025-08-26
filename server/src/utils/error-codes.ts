/**
 * Error codes and severity definitions for Hatago Hub
 */

/**
 * Error codes for different types of failures
 */
export enum ErrorCode {
  // Configuration errors (1000-1999)
  INVALID_CONFIG = 1000,
  CONFIG_NOT_FOUND = 1001,
  CONFIG_PARSE_ERROR = 1002,
  CONFIG_VALIDATION_ERROR = 1003,
  UNSUPPORTED_TRANSPORT = 1004,
  INVALID_SERVER_TYPE = 1005,
  INVALID_URL_FORMAT = 1006,
  INVALID_TOOL_NAME = 1007,
  INVALID_RESOURCE_URI = 1008,
  INVALID_INPUT = 1009,
  INVALID_PROFILE_PATH = 1010,

  // Server lifecycle errors (2000-2999)
  SERVER_NOT_FOUND = 2000,
  SERVER_ALREADY_EXISTS = 2001,
  SERVER_NOT_RUNNING = 2002,
  SERVER_ALREADY_RUNNING = 2003,
  SERVER_START_FAILED = 2004,
  SERVER_STOP_FAILED = 2005,
  SERVER_NOT_CONNECTED = 2006,
  SERVER_INITIALIZATION_FAILED = 2007,
  SERVER_SHUTDOWN_ERROR = 2008,
  SERVER_HEALTH_CHECK_FAILED = 2009,
  NPX_SPAWN_FAILED = 2010,
  NPX_PACKAGE_NOT_FOUND = 2011,
  NPX_INITIALIZATION_TIMEOUT = 2012,
  NPX_STDIO_ERROR = 2013,

  // Transport errors (3000-3999)
  TRANSPORT_ERROR = 3000,
  TRANSPORT_CLOSED = 3001,
  TRANSPORT_TIMEOUT = 3002,
  CONNECTION_REFUSED = 3003,
  CONNECTION_TIMEOUT = 3004,
  CONNECTION_RESET = 3005,
  HTTP_ERROR = 3006,
  SSE_CONNECTION_FAILED = 3007,
  STDIO_ERROR = 3008,
  INVALID_PROTOCOL_VERSION = 3009,
  PROTOCOL_NEGOTIATION_FAILED = 3010,

  // Tool/Resource errors (4000-4999)
  TOOL_NOT_FOUND = 4000,
  TOOL_EXECUTION_FAILED = 4001,
  TOOL_INVALID_PARAMS = 4002,
  TOOL_TIMEOUT = 4003,
  RESOURCE_NOT_FOUND = 4004,
  RESOURCE_READ_FAILED = 4005,
  RESOURCE_ACCESS_DENIED = 4006,
  PROMPT_NOT_FOUND = 4007,
  PROMPT_EXECUTION_FAILED = 4008,

  // Session errors (5000-5999)
  SESSION_NOT_FOUND = 5000,
  SESSION_EXPIRED = 5001,
  SESSION_INVALID = 5002,
  SESSION_CREATION_FAILED = 5003,

  // Hub errors (6000-6999)
  HUB_NOT_INITIALIZED = 6000,
  HUB_ALREADY_INITIALIZED = 6001,
  HUB_SHUTDOWN_IN_PROGRESS = 6002,
  REGISTRY_ERROR = 6003,
  MUTEX_TIMEOUT = 6004,
  RATE_LIMIT_EXCEEDED = 6005,

  // Storage errors (7000-7999)
  STORAGE_READ_ERROR = 7000,
  STORAGE_WRITE_ERROR = 7001,
  STORAGE_DELETE_ERROR = 7002,
  STORAGE_LOCK_ERROR = 7003,
  STORAGE_CORRUPTION = 7004,

  // Security errors (8000-8999)
  AUTHENTICATION_FAILED = 8000,
  AUTHORIZATION_FAILED = 8001,
  TOKEN_EXPIRED = 8002,
  INVALID_TOKEN = 8003,
  SECURITY_VIOLATION = 8004,
  NETWORK_NOT_ALLOWED = 8005,

  // System errors (9000-9999)
  INTERNAL_ERROR = 9000,
  UNKNOWN_ERROR = 9001,
  NOT_IMPLEMENTED = 9002,
  OPERATION_CANCELLED = 9003,
  SYSTEM_OVERLOAD = 9004,
  OUT_OF_MEMORY = 9005,
  DISK_FULL = 9006,
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Check if a value is a valid ErrorCode
 */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'number' && Object.values(ErrorCode).includes(value);
}

/**
 * Get error severity based on error code
 */
export function getErrorSeverity(code: ErrorCode): ErrorSeverity {
  // Critical errors that require immediate attention
  if (
    (code >= 8000 && code < 9000) || // Security errors
    code === ErrorCode.SYSTEM_OVERLOAD ||
    code === ErrorCode.OUT_OF_MEMORY ||
    code === ErrorCode.DISK_FULL ||
    code === ErrorCode.STORAGE_CORRUPTION
  ) {
    return ErrorSeverity.CRITICAL;
  }

  // High severity errors that affect functionality
  if (
    (code >= 2000 && code < 3000) || // Server lifecycle errors
    (code >= 3000 && code < 4000) || // Transport errors
    code === ErrorCode.HUB_NOT_INITIALIZED ||
    code === ErrorCode.INTERNAL_ERROR
  ) {
    return ErrorSeverity.HIGH;
  }

  // Medium severity errors
  if (
    (code >= 4000 && code < 5000) || // Tool/Resource errors
    (code >= 5000 && code < 6000) || // Session errors
    (code >= 7000 && code < 8000) // Storage errors
  ) {
    return ErrorSeverity.MEDIUM;
  }

  // Low severity errors
  return ErrorSeverity.LOW;
}

/**
 * Get human-readable error message for error code
 */
export function getErrorMessage(code: ErrorCode): string {
  const messages: Record<ErrorCode, string> = {
    // Configuration errors
    [ErrorCode.INVALID_CONFIG]: 'Invalid configuration',
    [ErrorCode.CONFIG_NOT_FOUND]: 'Configuration file not found',
    [ErrorCode.CONFIG_PARSE_ERROR]: 'Failed to parse configuration',
    [ErrorCode.CONFIG_VALIDATION_ERROR]: 'Configuration validation failed',
    [ErrorCode.UNSUPPORTED_TRANSPORT]: 'Unsupported transport type',
    [ErrorCode.INVALID_SERVER_TYPE]: 'Invalid server type',
    [ErrorCode.INVALID_URL_FORMAT]: 'Invalid URL format',
    [ErrorCode.INVALID_TOOL_NAME]: 'Invalid tool name',
    [ErrorCode.INVALID_RESOURCE_URI]: 'Invalid resource URI',
    [ErrorCode.INVALID_INPUT]: 'Invalid input',
    [ErrorCode.INVALID_PROFILE_PATH]: 'Invalid profile path',

    // Server lifecycle errors
    [ErrorCode.SERVER_NOT_FOUND]: 'Server not found',
    [ErrorCode.SERVER_ALREADY_EXISTS]: 'Server already exists',
    [ErrorCode.SERVER_NOT_RUNNING]: 'Server is not running',
    [ErrorCode.SERVER_ALREADY_RUNNING]: 'Server is already running',
    [ErrorCode.SERVER_START_FAILED]: 'Failed to start server',
    [ErrorCode.SERVER_STOP_FAILED]: 'Failed to stop server',
    [ErrorCode.SERVER_NOT_CONNECTED]: 'Server is not connected',
    [ErrorCode.SERVER_INITIALIZATION_FAILED]: 'Server initialization failed',
    [ErrorCode.SERVER_SHUTDOWN_ERROR]: 'Error during server shutdown',
    [ErrorCode.SERVER_HEALTH_CHECK_FAILED]: 'Server health check failed',
    [ErrorCode.NPX_SPAWN_FAILED]: 'Failed to spawn NPX process',
    [ErrorCode.NPX_PACKAGE_NOT_FOUND]: 'NPX package not found',
    [ErrorCode.NPX_INITIALIZATION_TIMEOUT]: 'NPX initialization timeout',
    [ErrorCode.NPX_STDIO_ERROR]: 'NPX STDIO communication error',

    // Transport errors
    [ErrorCode.TRANSPORT_ERROR]: 'Transport error',
    [ErrorCode.TRANSPORT_CLOSED]: 'Transport connection closed',
    [ErrorCode.TRANSPORT_TIMEOUT]: 'Transport timeout',
    [ErrorCode.CONNECTION_REFUSED]: 'Connection refused',
    [ErrorCode.CONNECTION_TIMEOUT]: 'Connection timeout',
    [ErrorCode.CONNECTION_RESET]: 'Connection reset',
    [ErrorCode.HTTP_ERROR]: 'HTTP error',
    [ErrorCode.SSE_CONNECTION_FAILED]: 'SSE connection failed',
    [ErrorCode.STDIO_ERROR]: 'STDIO error',
    [ErrorCode.INVALID_PROTOCOL_VERSION]: 'Invalid protocol version',
    [ErrorCode.PROTOCOL_NEGOTIATION_FAILED]: 'Protocol negotiation failed',

    // Tool/Resource errors
    [ErrorCode.TOOL_NOT_FOUND]: 'Tool not found',
    [ErrorCode.TOOL_EXECUTION_FAILED]: 'Tool execution failed',
    [ErrorCode.TOOL_INVALID_PARAMS]: 'Invalid tool parameters',
    [ErrorCode.TOOL_TIMEOUT]: 'Tool execution timeout',
    [ErrorCode.RESOURCE_NOT_FOUND]: 'Resource not found',
    [ErrorCode.RESOURCE_READ_FAILED]: 'Failed to read resource',
    [ErrorCode.RESOURCE_ACCESS_DENIED]: 'Resource access denied',
    [ErrorCode.PROMPT_NOT_FOUND]: 'Prompt not found',
    [ErrorCode.PROMPT_EXECUTION_FAILED]: 'Prompt execution failed',

    // Session errors
    [ErrorCode.SESSION_NOT_FOUND]: 'Session not found',
    [ErrorCode.SESSION_EXPIRED]: 'Session expired',
    [ErrorCode.SESSION_INVALID]: 'Invalid session',
    [ErrorCode.SESSION_CREATION_FAILED]: 'Failed to create session',

    // Hub errors
    [ErrorCode.HUB_NOT_INITIALIZED]: 'Hub not initialized',
    [ErrorCode.HUB_ALREADY_INITIALIZED]: 'Hub already initialized',
    [ErrorCode.HUB_SHUTDOWN_IN_PROGRESS]: 'Hub shutdown in progress',
    [ErrorCode.REGISTRY_ERROR]: 'Registry error',
    [ErrorCode.MUTEX_TIMEOUT]: 'Mutex timeout',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',

    // Storage errors
    [ErrorCode.STORAGE_READ_ERROR]: 'Storage read error',
    [ErrorCode.STORAGE_WRITE_ERROR]: 'Storage write error',
    [ErrorCode.STORAGE_DELETE_ERROR]: 'Storage delete error',
    [ErrorCode.STORAGE_LOCK_ERROR]: 'Storage lock error',
    [ErrorCode.STORAGE_CORRUPTION]: 'Storage corruption detected',

    // Security errors
    [ErrorCode.AUTHENTICATION_FAILED]: 'Authentication failed',
    [ErrorCode.AUTHORIZATION_FAILED]: 'Authorization failed',
    [ErrorCode.TOKEN_EXPIRED]: 'Token expired',
    [ErrorCode.INVALID_TOKEN]: 'Invalid token',
    [ErrorCode.SECURITY_VIOLATION]: 'Security violation',
    [ErrorCode.NETWORK_NOT_ALLOWED]: 'Network access not allowed',

    // System errors
    [ErrorCode.INTERNAL_ERROR]: 'Internal error',
    [ErrorCode.UNKNOWN_ERROR]: 'Unknown error',
    [ErrorCode.NOT_IMPLEMENTED]: 'Not implemented',
    [ErrorCode.OPERATION_CANCELLED]: 'Operation cancelled',
    [ErrorCode.SYSTEM_OVERLOAD]: 'System overload',
    [ErrorCode.OUT_OF_MEMORY]: 'Out of memory',
    [ErrorCode.DISK_FULL]: 'Disk full',
  };

  return messages[code] || 'Unknown error';
}
