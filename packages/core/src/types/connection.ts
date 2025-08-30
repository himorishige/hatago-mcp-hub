/**
 * Connection type definitions for Hatago MCP Hub
 * Pure types with no side effects
 */

/**
 * Server connection types
 */
export type ConnectionType = 'local' | 'npx' | 'remote';

/**
 * MCP Connection information
 */
export interface McpConnection {
  serverId: string;
  type: ConnectionType;
  connected: boolean;
  client?: unknown;
  process?: unknown;
  transport?: unknown;
  npxServer?: unknown; // NPX server instance
  remoteServer?: unknown; // Remote server instance
}
