/**
 * Global constants for Hatago MCP Hub
 * Keep values environment-agnostic and dependency-free. [DRY][CMV]
 */

/** MCP protocol version supported by the hub */
export const HATAGO_PROTOCOL_VERSION = '2025-06-18' as const;

/** Product name for serverInfo */
export const HATAGO_SERVER_NAME = 'hatago-mcp-hub' as const;

/**
 * Hatago version string.
 * NOTE: This should be updated by release tooling.
 */
export const HATAGO_VERSION = '0.0.16' as const;

/** serverInfo payload used in initialize responses */
export const HATAGO_SERVER_INFO = {
  name: HATAGO_SERVER_NAME,
  version: HATAGO_VERSION
} as const;
