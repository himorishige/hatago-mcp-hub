/**
 * Protocol definitions for Hatago MCP Hub
 * Pure types with no external dependencies except MCP SDK types
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { HATAGO_PROTOCOL_VERSION } from '../constants.js';

/**
 * MCP Server type alias for compatibility
 */
export type McpServer = Server;

/**
 * Supported protocol version
 */
export const SUPPORTED_PROTOCOL_VERSION = HATAGO_PROTOCOL_VERSION;

/**
 * Protocol features (simplified)
 */
export type ProtocolFeatures = {
  notifications: boolean;
  resources: boolean;
  prompts: boolean;
  tools: boolean;
};

/**
 * Simplified protocol negotiation result
 */
export type NegotiatedProtocol = {
  // Protocol version (use SUPPORTED_PROTOCOL_VERSION)
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
};
