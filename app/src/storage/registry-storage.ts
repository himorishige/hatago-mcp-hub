/**
 * Registry storage interface for persisting server state
 */

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
