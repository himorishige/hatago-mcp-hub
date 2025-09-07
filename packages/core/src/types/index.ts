/**
 * Type exports for Hatago Core
 * Re-export all type definitions
 */

// Re-export MCP SDK types for convenience
export type { Prompt, Resource, Tool } from '@modelcontextprotocol/sdk/types.js';
export type { ConnectionType, McpConnection } from './connection.js';
export type { McpServer, NegotiatedProtocol, ProtocolFeatures } from './protocol.js';
export { SUPPORTED_PROTOCOL_VERSION } from './protocol.js';
export type { RpcMethod } from './rpc.js';
export type { PromptMetadata, ResourceMetadata, ToolMetadata } from './registry.js';
export type { Session } from './session.js';

// Additional types that were missing
export type ToolNamingStrategy = 'prefix' | 'suffix' | 'none' | 'namespace' | 'error' | 'alias';

export type ToolCallResult = {
  success: boolean;
  result?: unknown;
  error?: Error;
};

export type ResourceTemplate = {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
};

export type PromptArgument = {
  name: string;
  description?: string;
  required?: boolean;
};

export type SessionData = {
  id: string;
  createdAt: number;
  expiresAt: number;
  data?: Record<string, unknown>;
};

export type SessionOptions = {
  ttl?: number;
  data?: Record<string, unknown>;
};

export type HatagoError = Error & {
  code: string;
  details?: unknown;
};

export type ServerType = 'stdio' | 'http' | 'sse' | 'ws';

export type ServerStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type ServerInfo = {
  id: string;
  name: string;
  version?: string;
  type: ServerType;
  status: ServerStatus;
};

export type ConnectionResult = {
  success: boolean;
  serverId: string;
  error?: Error;
};
