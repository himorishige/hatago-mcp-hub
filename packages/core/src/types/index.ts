/**
 * Type exports for Hatago Core
 * Re-export all type definitions
 */

export type { ConnectionType, McpConnection } from './connection.js';
export type {
  McpServer,
  NegotiatedProtocol,
  ProtocolFeatures,
} from './protocol.js';
export { SUPPORTED_PROTOCOL_VERSION } from './protocol.js';
export type {
  ToolMetadata,
  ResourceMetadata,
  PromptMetadata,
} from './registry.js';

// Re-export MCP SDK types for convenience
export type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
export type { Session } from './session.js';