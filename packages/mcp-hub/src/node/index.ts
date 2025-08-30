/**
 * Hatago MCP Hub - Node.js API
 *
 * Exports for programmatic usage in Node.js environments.
 */

// Core functionality from hub
export {
  createHub,
  type HatagoHub,
  type HubConfig,
  type ServerSpec,
} from '@himorishige/hatago-hub/node';

// Server functionality
export {
  startServer,
  type ServerOptions,
} from '@himorishige/hatago-server';

// Transport implementations
export * from '@himorishige/hatago-transport';

// Core types
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

// Runtime platform capabilities
export {
  getPlatform,
  type PlatformCapabilities,
} from '@himorishige/hatago-runtime';

// Configuration utilities
export { loadConfig } from '@himorishige/hatago-server';

// Re-export MCP SDK for convenience
export {
  Client,
  Server,
  StdioServerTransport,
  type CallToolRequest,
  type CallToolResult,
  type ListResourcesResult,
  type ListToolsResult,
  type ListPromptsResult,
  type ReadResourceRequest,
  type ReadResourceResult,
  type GetPromptRequest,
  type GetPromptResult,
} from '@modelcontextprotocol/sdk';
