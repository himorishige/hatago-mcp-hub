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
  client?: any;
  process?: any;
  transport?: any;
  npxServer?: any; // NPX server instance
  remoteServer?: any; // Remote server instance
}