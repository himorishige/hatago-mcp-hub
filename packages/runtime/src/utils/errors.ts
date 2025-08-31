/**
 * Error helpers for Result type testing
 * Simplified version for runtime package
 */

/**
 * Base error class for Hatago
 */
export class HatagoError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HatagoError';
    this.code = code;

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error code constants for testing
 */
export const ErrorCode = {
  E_CONFIG_INVALID: 'E_CONFIG_INVALID',
  E_MCP_CONNECTION_FAILED: 'E_MCP_CONNECTION_FAILED'
} as const;

/**
 * Error helper functions for testing
 */
export const ErrorHelpers = {
  invalidConfiguration: () => new HatagoError(ErrorCode.E_CONFIG_INVALID, 'Invalid configuration'),

  mcpConnectionFailed: (serverId: string) =>
    new HatagoError(
      ErrorCode.E_MCP_CONNECTION_FAILED,
      `Failed to connect to MCP server ${serverId}`
    )
};
