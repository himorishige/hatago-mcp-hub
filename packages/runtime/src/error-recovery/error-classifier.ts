/**
 * Error classification utilities
 */

/**
 * Error types for classification
 */
export enum ErrorType {
  TRANSPORT = 'TransportError',
  PROTOCOL = 'ProtocolError',
  TOOL = 'ToolError',
  RESOURCE = 'ResourceError',
  PROMPT = 'PromptError',
  LAUNCH = 'LaunchError',
  TIMEOUT = 'TimeoutError',
  NETWORK = 'NetworkError',
  VALIDATION = 'ValidationError',
  UNKNOWN = 'UnknownError'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Classified error information
 */
export interface ClassifiedError {
  type: ErrorType;
  severity: ErrorSeverity;
  retryable: boolean;
  message: string;
  originalError?: unknown;
}

/**
 * Classify an error
 */
export function classifyError(error: unknown): ClassifiedError {
  const message = getErrorMessage(error);
  const type = determineErrorType(error, message);
  const severity = determineErrorSeverity(type, message);
  const retryable = isRetryableError(type, message);

  return {
    type,
    severity,
    retryable,
    message,
    originalError: error
  };
}

/**
 * Extract error message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error';
}

/**
 * Determine error type from error object and message
 */
function determineErrorType(error: unknown, message: string): ErrorType {
  // Check error name
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    if (name.includes('timeout')) return ErrorType.TIMEOUT;
    if (name.includes('network')) return ErrorType.NETWORK;
    if (name.includes('validation')) return ErrorType.VALIDATION;
    if (name.includes('protocol')) return ErrorType.PROTOCOL;
    if (name.includes('transport')) return ErrorType.TRANSPORT;
  }

  // Check message content
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('timeout')) return ErrorType.TIMEOUT;
  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return ErrorType.NETWORK;
  }
  if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
    return ErrorType.VALIDATION;
  }
  if (lowerMessage.includes('protocol')) return ErrorType.PROTOCOL;
  if (lowerMessage.includes('transport')) return ErrorType.TRANSPORT;
  if (lowerMessage.includes('tool')) return ErrorType.TOOL;
  if (lowerMessage.includes('resource')) return ErrorType.RESOURCE;
  if (lowerMessage.includes('prompt')) return ErrorType.PROMPT;
  if (lowerMessage.includes('launch') || lowerMessage.includes('start')) {
    return ErrorType.LAUNCH;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Determine error severity
 */
function determineErrorSeverity(type: ErrorType, message: string): ErrorSeverity {
  // Critical errors
  if (type === ErrorType.LAUNCH) return ErrorSeverity.CRITICAL;
  
  // High severity
  if (type === ErrorType.PROTOCOL || type === ErrorType.TRANSPORT) {
    return ErrorSeverity.HIGH;
  }
  
  // Medium severity
  if (type === ErrorType.NETWORK || type === ErrorType.TIMEOUT) {
    return ErrorSeverity.MEDIUM;
  }
  
  // Low severity
  if (type === ErrorType.VALIDATION) {
    return ErrorSeverity.LOW;
  }
  
  // Check for specific critical keywords
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('fatal') || lowerMessage.includes('critical')) {
    return ErrorSeverity.CRITICAL;
  }
  
  return ErrorSeverity.MEDIUM;
}

/**
 * Determine if error is retryable
 */
function isRetryableError(type: ErrorType, message: string): boolean {
  // Non-retryable types
  if (type === ErrorType.VALIDATION || type === ErrorType.PROTOCOL) {
    return false;
  }
  
  // Always retryable types
  if (type === ErrorType.NETWORK || type === ErrorType.TIMEOUT) {
    return true;
  }
  
  // Check message for non-retryable keywords
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes('invalid') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('not found')
  ) {
    return false;
  }
  
  // Default: assume retryable for unknown errors
  return true;
}