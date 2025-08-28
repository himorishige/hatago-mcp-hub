/**
 * Protocol definitions for Hatago MCP Hub
 * Pure types with no external dependencies except MCP SDK types
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Server type alias for compatibility
 */
export type McpServer = Server;

/**
 * Supported protocol version
 */
export const SUPPORTED_PROTOCOL_VERSION = '2024-11-05' as const;

/**
 * Protocol features (simplified)
 */
export interface ProtocolFeatures {
  notifications: boolean;
  resources: boolean;
  prompts: boolean;
  tools: boolean;
}

/**
 * Simplified protocol negotiation result
 */
export interface NegotiatedProtocol {
  // Protocol version (always '2024-11-05' for now)
  protocol: string;

  // Server information
  serverInfo?: {
    name: string;
    version: string;
  };

  // Basic feature flags
  features: ProtocolFeatures;

  // Server capabilities (optional)
  capabilities?: Record<string, unknown>;
}