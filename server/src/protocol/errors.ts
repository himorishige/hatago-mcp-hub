/**
 * Hatago Protocol Error Handling
 *
 * Standardized error handling with classification and retry logic.
 */

import type { ErrorType, HatagoError } from './types.js';

// Standard JSON-RPC error codes
export const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom Hatago error codes (reserved range -32000 to -32099)
  TIMEOUT_ERROR: -32001,
  NETWORK_ERROR: -32002,
  AUTHORIZATION_ERROR: -32003,
  RATE_LIMIT_ERROR: -32004,
  SERVER_UNAVAILABLE: -32005,
  STREAM_ERROR: -32006,
} as const;

export class HatagoProtocolError extends Error implements HatagoError {
  public readonly jsonrpc = '2.0' as const;
  public readonly id: string | number | null;
  public readonly code: number;
  public readonly type: ErrorType;
  public readonly retryable: boolean;
  public readonly serverName?: string;
  public readonly originalError?: any;
  public readonly data?: any;

  constructor(
    code: number,
    message: string,
    type: ErrorType,
    options: {
      id?: string | number | null;
      retryable?: boolean;
      serverName?: string;
      originalError?: any;
      data?: any;
    } = {},
  ) {
    super(message);
    this.name = 'HatagoProtocolError';
    this.code = code;
    this.type = type;
    this.id = options.id ?? null;
    this.retryable = options.retryable ?? this.inferRetryable(type, code);
    this.serverName = options.serverName;
    this.originalError = options.originalError;
    this.data = options.data;
  }

  private inferRetryable(type: ErrorType, code: number): boolean {
    switch (type) {
      case ErrorType.UserError:
      case ErrorType.PolicyError:
        return false;
      case ErrorType.SystemError:
        // Most system errors are retryable except for some specific cases
        return ![
          RPC_ERRORS.PARSE_ERROR,
          RPC_ERRORS.INVALID_REQUEST,
          RPC_ERRORS.METHOD_NOT_FOUND,
          RPC_ERRORS.INVALID_PARAMS,
        ].includes(code);
      default:
        return false;
    }
  }

  toJSON(): HatagoError {
    return {
      jsonrpc: this.jsonrpc,
      id: this.id,
      code: this.code,
      message: this.message,
      type: this.type,
      retryable: this.retryable,
      serverName: this.serverName,
      originalError: this.originalError,
      data: this.data,
    };
  }

  static fromError(
    error: Error,
    options: {
      id?: string | number | null;
      serverName?: string;
      code?: number;
      type?: ErrorType;
    } = {},
  ): HatagoProtocolError {
    // If already a Hatago error, preserve it
    if (error instanceof HatagoProtocolError) {
      return error;
    }

    // Classify common error types
    let type = options.type;
    let code = options.code;

    if (!type || !code) {
      if (
        error.name === 'ValidationError' ||
        error.message.includes('validation')
      ) {
        type = ErrorType.UserError;
        code = RPC_ERRORS.INVALID_PARAMS;
      } else if (
        error.name === 'TimeoutError' ||
        error.message.includes('timeout')
      ) {
        type = ErrorType.SystemError;
        code = RPC_ERRORS.TIMEOUT_ERROR;
      } else if (
        error.name === 'NetworkError' ||
        error.message.includes('network')
      ) {
        type = ErrorType.SystemError;
        code = RPC_ERRORS.NETWORK_ERROR;
      } else if (
        error.name === 'UnauthorizedError' ||
        error.message.includes('unauthorized')
      ) {
        type = ErrorType.PolicyError;
        code = RPC_ERRORS.AUTHORIZATION_ERROR;
      } else {
        type = ErrorType.SystemError;
        code = RPC_ERRORS.INTERNAL_ERROR;
      }
    }

    return new HatagoProtocolError(code, error.message, type, {
      id: options.id,
      serverName: options.serverName,
      originalError: error,
    });
  }

  static userError(
    message: string,
    options: {
      id?: string | number | null;
      serverName?: string;
      code?: number;
      data?: any;
    } = {},
  ): HatagoProtocolError {
    return new HatagoProtocolError(
      options.code ?? RPC_ERRORS.INVALID_PARAMS,
      message,
      ErrorType.UserError,
      options,
    );
  }

  static systemError(
    message: string,
    options: {
      id?: string | number | null;
      serverName?: string;
      code?: number;
      retryable?: boolean;
      originalError?: any;
    } = {},
  ): HatagoProtocolError {
    return new HatagoProtocolError(
      options.code ?? RPC_ERRORS.INTERNAL_ERROR,
      message,
      ErrorType.SystemError,
      options,
    );
  }

  static policyError(
    message: string,
    options: {
      id?: string | number | null;
      serverName?: string;
      code?: number;
      data?: any;
    } = {},
  ): HatagoProtocolError {
    return new HatagoProtocolError(
      options.code ?? RPC_ERRORS.AUTHORIZATION_ERROR,
      message,
      ErrorType.PolicyError,
      options,
    );
  }
}

// Utility functions for error handling
export function isRetryableError(error: any): boolean {
  if (error instanceof HatagoProtocolError) {
    return error.retryable;
  }
  // Fallback for unknown errors - be conservative
  return false;
}

export function getErrorType(error: any): ErrorType {
  if (error instanceof HatagoProtocolError) {
    return error.type;
  }
  // Default classification
  return ErrorType.SystemError;
}

export function shouldRetryAfterDelay(
  error: any,
  attempt: number,
  maxAttempts: number,
): number | null {
  if (!isRetryableError(error) || attempt >= maxAttempts) {
    return null;
  }

  // Exponential backoff with jitter
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
  const jitter = Math.random() * 0.1 * delay; // ±10% jitter

  return delay + jitter;
}
