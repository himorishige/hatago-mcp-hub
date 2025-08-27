/**
 * Memory-based registry storage implementation
 */

import type { ServerConfig } from '../config/types.js';
import type { RegistryStorage, ServerState } from './registry-storage.js';

export function createMemoryRegistryStorage(): RegistryStorage {
  const states: Map<string, ServerState> = new Map();
  const servers: Map<string, ServerConfig> = new Map();

  return {
    async init(): Promise<void> {
      // No initialization needed for memory storage
    },

    // === Server Configuration Methods ===

    async addServer(config: ServerConfig): Promise<void> {
      servers.set(config.id, config);
    },

    async removeServer(id: string): Promise<boolean> {
      const existed = servers.has(id);
      servers.delete(id);
      states.delete(id);
      return existed;
    },

    async getServers(): Promise<ServerConfig[]> {
      return Array.from(servers.values());
    },

    async getServer(id: string): Promise<ServerConfig | undefined> {
      return servers.get(id);
    },

    async hasServer(id: string): Promise<boolean> {
      return servers.has(id);
    },

    // === Server State Methods ===

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
      servers.clear();
    },

    async close(): Promise<void> {
      // No cleanup needed for memory storage
    },
  };
}
