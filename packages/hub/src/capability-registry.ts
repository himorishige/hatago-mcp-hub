/**
 * Capability support tracking
 * Extracted from hub.ts for clarity [SF][CA]
 */

export type CapabilitySupport = 'supported' | 'unsupported' | 'unknown';

export class CapabilityRegistry<TClientCaps extends object = Record<string, unknown>> {
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
