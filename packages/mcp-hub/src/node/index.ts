/**
 * Hatago MCP Hub - Node.js API
 *
 * Exports for programmatic usage in Node.js environments.
 */

// Core functionality from hub
export {
  createHub,
  // Streamable HTTP helpers (Node)
  handleMCPEndpoint,
  createEventsEndpoint,
  type HatagoHub,
  type ServerSpec
} from '@himorishige/hatago-hub/node';

// Re-export HubConfig as an alias for HubOptions
export type { HubOptions as HubConfig } from '@himorishige/hatago-hub/node';

// Server functionality
export { startServer, type ServerOptions } from '@himorishige/hatago-server';

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
  ServerInfo,
  ConnectionResult
} from '@himorishige/hatago-core';

// Runtime platform capabilities
export { getPlatform } from '@himorishige/hatago-runtime';

// Configuration utilities
export { loadConfig } from '@himorishige/hatago-server';

// Re-export MCP SDK for convenience
// Note: MCP SDK exports have module resolution issues with TypeScript
// Users should import directly from @modelcontextprotocol/sdk packages
/*
export { Client } from '@modelcontextprotocol/sdk/client';
export { Server } from '@modelcontextprotocol/sdk/server';
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
export type {
  CallToolRequest,
  CallToolResult,
  ListResourcesResult,
  ListToolsResult,
  ListPromptsResult,
  ReadResourceRequest,
  ReadResourceResult,
  GetPromptRequest,
  GetPromptResult
} from '@modelcontextprotocol/sdk/types';
*/
