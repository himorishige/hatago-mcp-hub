/**
 * Core types for MCP Hub
 * Re-export types from @hatago/core for backward compatibility
 */

// Re-export all types from @hatago/core
export type {
  McpConnection,
  McpServer,
  NegotiatedProtocol,
  ProtocolFeatures,
  Session,
  ToolMetadata,
} from '@hatago/core';

export { SUPPORTED_PROTOCOL_VERSION } from '@hatago/core';

// Additional types not yet migrated to @hatago/core
// (These will be moved in future phases)
