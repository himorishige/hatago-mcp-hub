/**
 * Memory-based registry storage implementation
 */

import type { RegistryStorage, ServerState } from './registry-storage.js';

export class MemoryRegistryStorage implements RegistryStorage {
  private states: Map<string, ServerState> = new Map();

  async init(): Promise<void> {
    // No initialization needed for memory storage
  }

  async saveServerState(serverId: string, state: ServerState): Promise<void> {
    this.states.set(serverId, state);
  }

  async getServerState(serverId: string): Promise<ServerState | null> {
    return this.states.get(serverId) || null;
  }

  async getAllServerStates(): Promise<Map<string, ServerState>> {
    return new Map(this.states);
  }

  async deleteServerState(serverId: string): Promise<void> {
    this.states.delete(serverId);
  }

  async clear(): Promise<void> {
    this.states.clear();
  }

  async close(): Promise<void> {
    // No cleanup needed for memory storage
  }
}
