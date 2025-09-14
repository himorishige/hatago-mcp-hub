/**
 * Capability support tracking
 * Extracted from hub.ts for clarity [SF][CA]
 */

export type CapabilitySupport = 'supported' | 'unsupported' | 'unknown';

/**
 * Capability registry type
 */
export type ICapabilityRegistry<TClientCaps extends object = Record<string, unknown>> = {
  markServerCapability(serverId: string, method: string, support: CapabilitySupport): void;
  getServerCapability(serverId: string, method: string): CapabilitySupport;
  setClientCapabilities(sessionId: string, capabilities: TClientCaps): void;
  getClientCapabilities(sessionId: string): TClientCaps;
  clearClientCapabilities(sessionId: string): void;
  clearServerCapabilities(serverId: string): void;
};

/**
 * Create a functional capability registry
 */
export function createCapabilityRegistry<
  TClientCaps extends object = Record<string, unknown>
>(): ICapabilityRegistry<TClientCaps> {
  // Internal state using closures
  const serverCapabilities = new Map<string, Map<string, CapabilitySupport>>();
  const clientCapabilities = new Map<string, TClientCaps>();

  return {
    // Track server capability support status
    markServerCapability(serverId: string, method: string, support: CapabilitySupport): void {
      if (!serverCapabilities.has(serverId)) {
        serverCapabilities.set(serverId, new Map());
      }
      serverCapabilities.get(serverId)?.set(method, support);
    },

    // Get server capability support status
    getServerCapability(serverId: string, method: string): CapabilitySupport {
      return serverCapabilities.get(serverId)?.get(method) ?? 'unknown';
    },

    // Store client capabilities
    setClientCapabilities(sessionId: string, capabilities: TClientCaps): void {
      clientCapabilities.set(sessionId, capabilities ?? ({} as TClientCaps));
    },

    getClientCapabilities(sessionId: string): TClientCaps {
      return clientCapabilities.get(sessionId) ?? ({} as TClientCaps);
    },

    // Clear capabilities for a session
    clearClientCapabilities(sessionId: string): void {
      clientCapabilities.delete(sessionId);
    },

    // Clear server capabilities
    clearServerCapabilities(serverId: string): void {
      serverCapabilities.delete(serverId);
    }
  };
}
