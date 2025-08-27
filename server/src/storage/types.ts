/**
 * Storage types
 */

import type { ServerConfig } from '../config/types.js';

export interface ServerState {
  id: string;
  type: 'local' | 'remote' | 'npx';
  state: 'pending' | 'running' | 'stopped' | 'failed';
  lastStartedAt?: Date;
  lastStoppedAt?: Date;
  failureCount?: number;
  lastFailureAt?: Date;
  lastFailureReason?: string;
  discoveredTools?: string[];
}

export interface RegistryStorage {
  /**
   * Initialize storage
   */
  init(): Promise<void>;

  // === Server Configuration Methods ===

  /**
   * Add or update a server configuration
   */
  addServer?(config: ServerConfig): Promise<void>;

  /**
   * Remove a server configuration
   */
  removeServer?(id: string): Promise<boolean>;

  /**
   * Get all server configurations
   */
  getServers?(): Promise<ServerConfig[]>;

  /**
   * Get a specific server configuration
   */
  getServer?(id: string): Promise<ServerConfig | undefined>;

  /**
   * Check if a server exists
   */
  hasServer?(id: string): Promise<boolean>;

  // === Server State Methods ===

  /**
   * Save server state
   */
  saveServerState(serverId: string, state: ServerState): Promise<void>;

  /**
   * Get server state
   */
  getServerState(serverId: string): Promise<ServerState | null>;

  /**
   * Get all server states
   */
  getAllServerStates(): Promise<Map<string, ServerState>>;

  /**
   * Delete server state
   */
  deleteServerState(serverId: string): Promise<void>;

  /**
   * Clear all states
   */
  clear(): Promise<void>;

  /**
   * Close storage connection
   */
  close(): Promise<void>;
}
