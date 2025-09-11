/**
 * Server activation manager (extracted)
 */

import type { ActivationPolicy } from '@himorishige/hatago-core';
import { ServerState } from '@himorishige/hatago-core';
import { createEventEmitter, type EventEmitter as HubEventEmitter } from './utils/events.js';

// Minimal state machine interface to avoid importing hub internals
export type ServerStateMachine = {
  getState(serverId: string): ServerState;
  setState(serverId: string, state: ServerState): void;
  transition(serverId: string, to: ServerState, reason?: string): Promise<void>;
  reset(serverId: string): void;
  resetAll(): void;
  on(event: string, handler: (data: unknown) => void): void;
  // Optional helpers present in Hub implementation
  getAllStates?(): Map<string, ServerState>;
  isActive?(serverId: string): boolean;
};

// Extended server config type (kept minimal for extraction)
type ServerConfig = {
  type?: 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
  activationPolicy?: ActivationPolicy;
  _lastError?: { message: string; timestamp: string; retryAfterMs?: number };
};

/** Activation request */
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

/** Activation result */
export type ActivationResult = {
  success: boolean;
  serverId: string;
  state: ServerState;
  error?: string;
  duration?: number;
};

/** Server activation manager */
export class ActivationManager {
  private readonly stateMachine: ServerStateMachine;
  private readonly serverConfigs = new Map<string, ServerConfig>();
  private readonly inflight = new Map<string, Promise<ActivationResult>>();
  private events: HubEventEmitter<string, unknown>;

  private connectHandler?: (serverId: string) => Promise<void>;
  private disconnectHandler?: (serverId: string) => Promise<void>;

  constructor(stateMachine: ServerStateMachine) {
    this.events = createEventEmitter<string, unknown>();
    this.stateMachine = stateMachine;
    this.stateMachine.on('transition', (event: unknown) => {
      this.events.emit('state:changed', event);
    });
  }

  registerServer(serverId: string, config: ServerConfig): void {
    this.serverConfigs.set(serverId, config);
    this.stateMachine.setState(serverId, ServerState.INACTIVE);
  }

  setHandlers(
    connect: (serverId: string) => Promise<void>,
    disconnect: (serverId: string) => Promise<void>
  ): void {
    this.connectHandler = connect;
    this.disconnectHandler = disconnect;
  }

  shouldActivate(serverId: string, source: ActivationRequest['source']): boolean {
    const config = this.serverConfigs.get(serverId);
    if (!config) return false;
    const policy = config.activationPolicy ?? 'manual';
    switch (policy) {
      case 'always':
        return source.type === 'startup' || source.type === 'dependency';
      case 'onDemand':
        return true;
      case 'manual':
        return source.type === 'manual';
      default:
        return false;
    }
  }

  async activate(
    serverId: string,
    source: ActivationRequest['source'],
    reason?: string
  ): Promise<ActivationResult> {
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

  private async performActivation(
    serverId: string,
    request: ActivationRequest
  ): Promise<ActivationResult> {
    const startTime = Date.now();
    try {
      this.events.emit('activation:start', request);
      const state = this.stateMachine.getState(serverId);
      if (state !== ServerState.INACTIVE && state !== ServerState.ERROR) {
        throw new Error(`Cannot activate from state: ${state}`);
      }
      if (state === ServerState.ERROR) {
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

  getServerState(serverId: string): ServerState {
    return this.stateMachine.getState(serverId);
  }
  getAllStates(): Map<string, ServerState> {
    const m = this.stateMachine.getAllStates?.();
    return (m as Map<string, ServerState>) ?? new Map<string, ServerState>();
  }
  isActive(serverId: string): boolean {
    return (
      this.stateMachine.isActive?.(serverId) ??
      this.stateMachine.getState(serverId) === ServerState.ACTIVE
    );
  }
  getActivationHistory(_serverId: string) {
    return [];
  }
  async handleServerError(serverId: string, error: Error): Promise<void> {
    await this.stateMachine.transition(serverId, ServerState.ERROR, error.message);
    await this.stateMachine.transition(serverId, ServerState.INACTIVE, 'Error handled');
  }
  async resetServer(serverId: string): Promise<void> {
    const state = this.stateMachine.getState(serverId);
    if (state === ServerState.ACTIVE) {
      await this.deactivate(serverId, 'Reset requested');
    }
    const config = this.serverConfigs.get(serverId);
    if (config) {
      delete config._lastError;
    }
    this.stateMachine.reset(serverId);
    if (config) {
      this.registerServer(serverId, config);
    }
  }
  async shutdown(): Promise<void> {
    const activeServers = Array.from(this.serverConfigs.keys()).filter((id) => this.isActive(id));
    await Promise.all(activeServers.map((id) => this.deactivate(id, 'System shutdown')));
    this.stateMachine.resetAll();
    this.inflight.clear();
  }
  on(event: string, handler: (data: unknown) => void): void {
    this.events.on(event, handler);
  }
  off(event: string, handler: (data: unknown) => void): void {
    this.events.off(event, handler);
  }
}
