/**
 * Result to JSON-RPC 2.0 conversion utilities
 * Ensures MCP protocol compliance
 */

import type { ErrorCode, HatagoError } from './errors.js';
import type { Err, Result } from './result.js';

/**
 * JSON-RPC 2.0 Error object
 * https://www.jsonrpc.org/specification#error_object
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 Error response
 */
export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  error: JsonRpcError;
  id: string | number | null;
}

/**
 * Map Hatago error codes to JSON-RPC 2.0 error codes
 * Based on MCP specification
 */
const errorCodeToJsonRpc: Partial<Record<ErrorCode, number>> = {
  // Invalid Request
  E_CONFIG_INVALID: -32600,
  E_CONFIG_NOT_FOUND: -32600,

  // Method not found
  E_TOOL_NOT_FOUND: -32601,

  // Invalid params
  E_TOOL_NAME_COLLISION: -32602,

  // Internal error
  E_SYSTEM_UNKNOWN: -32603,
  E_SYSTEM_FS_ERROR: -32603,
  E_SYSTEM_SECURITY_ERROR: -32603,

  // Server error (reserved range: -32000 to -32099)
  E_MCP_CONNECTION_FAILED: -32001,
  E_MCP_INIT_TIMEOUT: -32002,
  E_MCP_PROTOCOL_ERROR: -32003,
  E_SESSION_NOT_FOUND: -32004,
  E_SESSION_EXPIRED: -32005,
  E_SESSION_VERSION_CONFLICT: -32006,
  E_SESSION_LOCK_TIMEOUT: -32007,
  E_STATE_INVALID_TRANSITION: -32008,
  E_STATE_ALREADY_RUNNING: -32009,
  E_NPX_INSTALL_FAILED: -32010,
  E_NPX_PACKAGE_NOT_FOUND: -32011,
  E_TOOL_EXECUTION_FAILED: -32012,
};

/**
 * Convert HatagoError to JSON-RPC error code
 */
export const getJsonRpcErrorCode = (error: HatagoError): number => {
  // Handle both string and numeric error codes
  if (typeof error.code === 'string') {
    return errorCodeToJsonRpc[error.code as ErrorCode] ?? -32603;
  }
  // For numeric codes, return a default JSON-RPC error code
  return -32603; // Default to internal error
};

/**
 * Convert Error result to JSON-RPC error
 */
export const toJsonRpcError = <E extends HatagoError>(
  result: Err<E>,
): JsonRpcError => {
  const error = result.error;
  return {
    code: getJsonRpcErrorCode(error),
    message: error.message,
    data: {
      hatagoCode: error.code,
      severity: error.severity,
      context: error.context,
      recoverable: error.recoverable,
    },
  };
};

/**
 * Create JSON-RPC error response from Result
 */
export const toJsonRpcErrorResponse = <E extends HatagoError>(
  result: Err<E>,
  id: string | number | null = null,
): JsonRpcErrorResponse => {
  return {
    jsonrpc: '2.0',
    error: toJsonRpcError(result),
    id,
  };
};

/**
 * Convert Result to JSON-RPC response
 */
export const resultToJsonRpc = <T, E extends HatagoError>(
  result: Result<T, E>,
  id: string | number | null = null,
): {
  jsonrpc: '2.0';
  result?: T;
  error?: JsonRpcError;
  id: string | number | null;
} => {
  if (result.ok) {
    return {
      jsonrpc: '2.0',
      result: result.value,
      id,
    };
  }

  return {
    jsonrpc: '2.0',
    error: toJsonRpcError(result),
    id,
  };
};

/**
 * Check if error code is in server error range
 */
export const isServerError = (code: number): boolean => {
  return code >= -32099 && code <= -32000;
};

/**
 * Check if error code is a standard JSON-RPC error
 */
export const isStandardJsonRpcError = (code: number): boolean => {
  return (
    code === -32700 || // Parse error
    code === -32600 || // Invalid Request
    code === -32601 || // Method not found
    code === -32602 || // Invalid params
    code === -32603 // Internal error
  );
};
