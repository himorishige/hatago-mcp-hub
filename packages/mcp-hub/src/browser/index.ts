/**
 * Hatago MCP Hub - Browser API
 *
 * Exports for browser environments (future support).
 * Currently provides type exports only.
 */

// Core types (platform-agnostic)
export type {
  // MCP Protocol types
  McpServer,
  ProtocolFeatures,
  NegotiatedProtocol,
  // Tool types
  Tool,
  ToolMetadata,
  ToolNamingConfig,
  ToolNamingStrategy,
  ToolCallResult,
  // Resource types
  Resource,
  ResourceMetadata,
  ResourceTemplate,
  // Prompt types
  Prompt,
  PromptMetadata,
  PromptArgument,
  // Session types
  SessionData,
  SessionOptions,
  // Error types
  ErrorCode,
  HatagoError,
  // Server types
  ServerType,
  ServerStatus,
  ServerInfo,
  ConnectionResult,
} from '@himorishige/hatago-core';

/**
 * Browser support is planned for future releases.
 * This will enable:
 * - WebSocket-based MCP connections
 * - Browser extension integration
 * - Web-based MCP clients
 */
export const BROWSER_SUPPORT = 'planned' as const;
