/**
 * Core types for MCP Hub
 * Minimal type definitions for lightweight version
 */

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
