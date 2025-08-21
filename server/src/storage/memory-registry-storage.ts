/**
 * Memory-based registry storage implementation
 */

import type { RegistryStorage, ServerState } from './registry-storage.js';

export function createMemoryRegistryStorage(): RegistryStorage {
  const states: Map<string, ServerState> = new Map();

  return {
    async init(): Promise<void> {
      // No initialization needed for memory storage
    },

    async saveServerState(serverId: string, state: ServerState): Promise<void> {
      states.set(serverId, state);
    },

    async getServerState(serverId: string): Promise<ServerState | null> {
      return states.get(serverId) || null;
    },

    async getAllServerStates(): Promise<Map<string, ServerState>> {
      return new Map(states);
    },

    async deleteServerState(serverId: string): Promise<void> {
      states.delete(serverId);
    },

    async clear(): Promise<void> {
      states.clear();
    },

    async close(): Promise<void> {
      // No cleanup needed for memory storage
    },
  };
}
