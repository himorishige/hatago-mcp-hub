/**
 * Type exports for Hatago Core
 * Re-export all type definitions
 */

// Re-export MCP SDK types for convenience
export type { Prompt, Resource, Tool } from '@modelcontextprotocol/sdk/types.js';
export type { ConnectionType, McpConnection } from './connection.js';
export type { McpServer, NegotiatedProtocol, ProtocolFeatures } from './protocol.js';
export { SUPPORTED_PROTOCOL_VERSION } from './protocol.js';
export type { PromptMetadata, ResourceMetadata, ToolMetadata } from './registry.js';
export type { Session } from './session.js';
