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

/**
 * Legacy class-based implementation (deprecated)
 * @deprecated Use createCapabilityRegistry instead
 */
export class CapabilityRegistry<TClientCaps extends object = Record<string, unknown>>
  implements ICapabilityRegistry<TClientCaps>
{
  private serverCapabilities = new Map<string, Map<string, CapabilitySupport>>();
  private clientCapabilities = new Map<string, TClientCaps>(); // sessionId -> capabilities

  // Track server capability support status
  markServerCapability(serverId: string, method: string, support: CapabilitySupport) {
    if (!this.serverCapabilities.has(serverId)) {
      this.serverCapabilities.set(serverId, new Map());
    }
    this.serverCapabilities.get(serverId)?.set(method, support);
  }

  // Get server capability support status
  getServerCapability(serverId: string, method: string): CapabilitySupport {
    return this.serverCapabilities.get(serverId)?.get(method) ?? 'unknown';
  }

  // Store client capabilities
  setClientCapabilities(sessionId: string, capabilities: TClientCaps) {
    this.clientCapabilities.set(sessionId, capabilities ?? ({} as TClientCaps));
  }

  getClientCapabilities(sessionId: string): TClientCaps {
    return this.clientCapabilities.get(sessionId) ?? ({} as TClientCaps);
  }

  // Clear capabilities for a session
  clearClientCapabilities(sessionId: string) {
    this.clientCapabilities.delete(sessionId);
  }

  // Clear server capabilities
  clearServerCapabilities(serverId: string) {
    this.serverCapabilities.delete(serverId);
  }
}
