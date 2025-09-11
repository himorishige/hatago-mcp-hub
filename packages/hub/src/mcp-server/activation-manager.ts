/**
 * Server activation manager (simplified)
 * Minimal on-demand activation with lightweight deduplication
 */

import type { ActivationPolicy } from '@himorishige/hatago-core';
import { ServerState } from '@himorishige/hatago-core';

// Extended server config type
type ServerConfig = {
  type?: 'http' | 'sse'; // Optional for HTTP, required for SSE
  command?: string; // For STDIO servers
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string; // For HTTP/SSE servers
  headers?: Record<string, string>;
  disabled?: boolean;
  activationPolicy?: ActivationPolicy;
  _lastError?: {
    message: string;
    timestamp: string;
    retryAfterMs?: number;
  };
};

import { createEventEmitter, type EventEmitter as HubEventEmitter } from '../utils/events.js';
import type { ServerStateMachine } from './state-machine.js';

/**
 * Activation request
 */
export type ActivationRequest = {
  serverId: string;
  reason: string;
  source: {
    type: 'tool_call' | 'manual' | 'startup' | 'dependency';
    toolName?: string;
    sessionId?: string;
  };
  timestamp: string;
};

/**
 * Activation result
 */
export type ActivationResult = {
  success: boolean;
  serverId: string;
  state: ServerState;
  error?: string;
  duration?: number;
};

/**
 * Server activation manager
 * Handles server lifecycle with deduplication
 */
export class ActivationManager {
  private readonly stateMachine: ServerStateMachine;
  private readonly serverConfigs = new Map<string, ServerConfig>();
  private readonly inflight = new Map<string, Promise<ActivationResult>>();
  private events: HubEventEmitter<string, unknown>;

  // Connection handlers (to be set by hub)
  private connectHandler?: (serverId: string) => Promise<void>;
  private disconnectHandler?: (serverId: string) => Promise<void>;

  constructor(stateMachine: ServerStateMachine) {
    this.events = createEventEmitter<string, unknown>();
    this.stateMachine = stateMachine;
    // Minimal pass-through of transitions for observability
    this.stateMachine.on('transition', (event) => {
      this.events.emit('state:changed', event);
    });
  }

  /**
   * Register server configuration
   */
  registerServer(serverId: string, config: ServerConfig): void {
    this.serverConfigs.set(serverId, config);

    // Initialize as INACTIVE regardless of policy (policy handled at call sites)
    this.stateMachine.setState(serverId, ServerState.INACTIVE);
  }

  /**
   * Set connection handlers
   */
  setHandlers(
    connect: (serverId: string) => Promise<void>,
    disconnect: (serverId: string) => Promise<void>
  ): void {
    this.connectHandler = connect;
    this.disconnectHandler = disconnect;
  }

  /**
   * Check if server should activate
   */
  shouldActivate(serverId: string, source: ActivationRequest['source']): boolean {
    const config = this.serverConfigs.get(serverId);
    if (!config) return false;

    const policy = config.activationPolicy ?? 'manual';

    switch (policy) {
      case 'always':
        // Activation is triggered by hub during startup only
        return source.type === 'startup' || source.type === 'dependency';

      case 'onDemand':
        // OnDemand servers activate on any request
        return true;

      case 'manual':
        // Manual servers only activate on explicit request
        return source.type === 'manual';

      default:
        return false;
    }
  }

  /**
   * Activate a server with deduplication
   */
  async activate(
    serverId: string,
    source: ActivationRequest['source'],
    reason?: string
  ): Promise<ActivationResult> {
    // Deduplicate concurrent activations (lightweight)
    const existing = this.inflight.get(serverId);
    if (existing) return existing;

    const currentState = this.stateMachine.getState(serverId);
    if (currentState === ServerState.ACTIVE) {
      return { success: true, serverId, state: currentState };
    }

    if (!this.shouldActivate(serverId, source)) {
      return {
        success: false,
        serverId,
        state: currentState,
        error: `Activation not allowed for policy: ${this.serverConfigs.get(serverId)?.activationPolicy}`
      };
    }

    const request: ActivationRequest = {
      serverId,
      reason: reason ?? `Activated by ${source.type}`,
      source,
      timestamp: new Date().toISOString()
    };

    const promise = this.performActivation(serverId, request);
    this.inflight.set(serverId, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(serverId);
    }
  }

  /**
   * Perform actual activation
   */
  private async performActivation(
    serverId: string,
    request: ActivationRequest
  ): Promise<ActivationResult> {
    const startTime = Date.now();
    try {
      this.events.emit('activation:start', request);

      // Only allow from INACTIVE or ERROR
      const state = this.stateMachine.getState(serverId);
      if (state !== ServerState.INACTIVE && state !== ServerState.ERROR) {
        throw new Error(`Cannot activate from state: ${state}`);
      }

      if (state === ServerState.ERROR) {
        // Reset to INACTIVE immediately
        await this.stateMachine.transition(serverId, ServerState.INACTIVE, 'Reset from error');
      }

      await this.stateMachine.transition(serverId, ServerState.ACTIVATING, request.reason);

      if (this.connectHandler) {
        await this.connectHandler(serverId);
      }

      await this.stateMachine.transition(serverId, ServerState.ACTIVE, 'Connected');

      const duration = Date.now() - startTime;
      this.events.emit('activation:success', { serverId, duration, request });
      return { success: true, serverId, state: ServerState.ACTIVE, duration };
    } catch (error) {
      await this.stateMachine.transition(
        serverId,
        ServerState.ERROR,
        error instanceof Error ? error.message : 'Activation failed'
      );
      // Immediately settle to INACTIVE for simplicity
      await this.stateMachine.transition(serverId, ServerState.INACTIVE, 'Error settled');
      this.events.emit('activation:failed', { serverId, error, request });
      return {
        success: false,
        serverId,
        state: ServerState.INACTIVE,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Deactivate a server
   */
  async deactivate(serverId: string, reason?: string): Promise<ActivationResult> {
    const currentState = this.stateMachine.getState(serverId);
    if (currentState !== ServerState.ACTIVE) {
      return {
        success: false,
        serverId,
        state: currentState,
        error: `Cannot deactivate from state: ${currentState}`
      };
    }

    try {
      await this.stateMachine.transition(
        serverId,
        ServerState.STOPPING,
        reason ?? 'Manual deactivation'
      );
      if (this.disconnectHandler) {
        await this.disconnectHandler(serverId);
      }
      await this.stateMachine.transition(serverId, ServerState.INACTIVE, 'Disconnected');
      this.events.emit('deactivation:success', { serverId });
      return { success: true, serverId, state: ServerState.INACTIVE };
    } catch (error) {
      await this.stateMachine.transition(
        serverId,
        ServerState.INACTIVE,
        'Deactivation failed, forcing inactive'
      );
      this.events.emit('deactivation:failed', { serverId, error });
      return {
        success: false,
        serverId,
        state: ServerState.INACTIVE,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Activate all "always" servers
   */
  // activateAlwaysServers removed (handled by hub startup)

  /**
   * Get server state
   */
  getServerState(serverId: string): ServerState {
    return this.stateMachine.getState(serverId);
  }

  /**
   * Get all server states
   */
  getAllStates(): Map<string, ServerState> {
    return this.stateMachine.getAllStates();
  }

  /**
   * Check if server is active
   */
  isActive(serverId: string): boolean {
    return this.stateMachine.isActive(serverId);
  }

  /**
   * Get activation history
   */
  getActivationHistory(_serverId: string): ActivationRequest[] {
    // History removed; return empty for compatibility
    return [];
  }

  /**
   * Wait for cooldown period
   */
  // waitForCooldown removed

  /**
   * Record activation in history
   */
  // recordActivation removed (history not kept)

  /**
   * Handle server error
   */
  async handleServerError(serverId: string, error: Error): Promise<void> {
    // Simplified: mark error then settle to inactive
    await this.stateMachine.transition(serverId, ServerState.ERROR, error.message);
    await this.stateMachine.transition(serverId, ServerState.INACTIVE, 'Error handled');
  }

  /**
   * Reset server state
   */
  async resetServer(serverId: string): Promise<void> {
    // Deactivate if active
    const state = this.stateMachine.getState(serverId);
    if (state === ServerState.ACTIVE) {
      await this.deactivate(serverId, 'Reset requested');
    }

    // Clear error state
    const config = this.serverConfigs.get(serverId);
    if (config) {
      delete config._lastError;
    }

    // Reset state machine
    this.stateMachine.reset(serverId);

    // Re-initialize based on policy
    if (config) {
      this.registerServer(serverId, config);
    }
  }

  /**
   * Shutdown all servers
   */
  async shutdown(): Promise<void> {
    const activeServers = Array.from(this.serverConfigs.keys()).filter((id) => this.isActive(id));
    await Promise.all(activeServers.map((id) => this.deactivate(id, 'System shutdown')));
    this.stateMachine.resetAll();
    this.inflight.clear();
  }
  // Lightweight on/off
  on(event: string, handler: (data: unknown) => void): void {
    this.events.on(event, handler);
  }
  off(event: string, handler: (data: unknown) => void): void {
    this.events.off(event, handler);
  }
}
