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

// Additional types that were missing
export type ToolNamingStrategy = 'prefix' | 'suffix' | 'none' | 'namespace' | 'error' | 'alias';

export interface ToolCallResult {
  success: boolean;
  result?: unknown;
  error?: Error;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface SessionData {
  id: string;
  createdAt: number;
  expiresAt: number;
  data?: Record<string, unknown>;
}

export interface SessionOptions {
  ttl?: number;
  data?: Record<string, unknown>;
}

export interface HatagoError extends Error {
  code: string;
  details?: unknown;
}

export type ServerType = 'stdio' | 'http' | 'sse' | 'ws';

export type ServerStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface ServerInfo {
  id: string;
  name: string;
  version?: string;
  type: ServerType;
  status: ServerStatus;
}

export interface ConnectionResult {
  success: boolean;
  serverId: string;
  error?: Error;
}
