/**
 * Core types for MCP Hub
 * Minimal type definitions for lightweight version
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * MCP Server type alias for compatibility
 */
export type McpServer = Server;

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
  features: {
    notifications: boolean;
    resources: boolean;
    prompts: boolean;
    tools: boolean;
  };

  // Server capabilities (optional)
  capabilities?: Record<string, unknown>;
}

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
 * Supported protocol version
 */
export const SUPPORTED_PROTOCOL_VERSION = '2024-11-05';
