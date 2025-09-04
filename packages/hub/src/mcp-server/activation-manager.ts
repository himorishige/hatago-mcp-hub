/**
 * Server activation manager with deduplication
 * Handles on-demand activation and concurrent call management
 */

import type { ActivationPolicy } from '@himorishige/hatago-core';
import { ServerState } from '@himorishige/hatago-core';

// Extended server config type
interface ServerConfig {
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
}

import { EventEmitter } from 'node:events';
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
export class ActivationManager extends EventEmitter {
  private readonly stateMachine: ServerStateMachine;
  private readonly activationQueue = new Map<string, Promise<ActivationResult>>();
  private readonly serverConfigs = new Map<string, ServerConfig>();
  private readonly activationHistory = new Map<string, ActivationRequest[]>();
  private readonly maxHistorySize = 100;

  // Connection handlers (to be set by hub)
  private connectHandler?: (serverId: string) => Promise<void>;
  private disconnectHandler?: (serverId: string) => Promise<void>;

  constructor(stateMachine: ServerStateMachine) {
    super();
    this.stateMachine = stateMachine;

    // Listen to state changes
    this.stateMachine.on('transition', (event) => {
      this.emit('state:changed', event);
    });
  }

  /**
   * Register server configuration
   */
  registerServer(serverId: string, config: ServerConfig): void {
    this.serverConfigs.set(serverId, config);

    // Initialize state based on activation policy
    const policy = config.activationPolicy ?? 'manual';
    if (policy === 'manual') {
      this.stateMachine.setState(serverId, ServerState.MANUAL);
    } else {
      this.stateMachine.setState(serverId, ServerState.INACTIVE);
    }
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
        // Always servers activate on startup or dependency
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
    // Check if already activating
    const existing = this.activationQueue.get(serverId);
    if (existing) {
      this.emit('activation:deduplicated', { serverId, source });
      return existing;
    }

    // Check current state
    const currentState = this.stateMachine.getState(serverId);

    // Already active
    if (currentState === ServerState.ACTIVE) {
      return {
        success: true,
        serverId,
        state: currentState
      };
    }

    // Check if activation is allowed
    if (!this.shouldActivate(serverId, source)) {
      return {
        success: false,
        serverId,
        state: currentState,
        error: `Activation not allowed for policy: ${this.serverConfigs.get(serverId)?.activationPolicy}`
      };
    }

    // Create activation request
    const request: ActivationRequest = {
      serverId,
      reason: reason ?? `Activated by ${source.type}`,
      source,
      timestamp: new Date().toISOString()
    };

    // Record in history
    this.recordActivation(request);

    // Start activation with deduplication
    const activationPromise = this.performActivation(serverId, request);
    this.activationQueue.set(serverId, activationPromise);

    try {
      const result = await activationPromise;
      return result;
    } finally {
      // Remove from queue after completion
      this.activationQueue.delete(serverId);
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
      // Emit activation start
      this.emit('activation:start', request);

      // Check if can activate
      if (!this.stateMachine.canActivate(serverId)) {
        const state = this.stateMachine.getState(serverId);

        // Wait for cooldown if needed
        if (state === ServerState.COOLDOWN) {
          await this.waitForCooldown(serverId);
        } else if (state === ServerState.ERROR) {
          // Reset from error state
          await this.stateMachine.transition(
            serverId,
            ServerState.COOLDOWN,
            'Resetting from error'
          );
          await this.waitForCooldown(serverId);
        } else {
          throw new Error(`Cannot activate from state: ${state}`);
        }
      }

      // Transition to activating
      await this.stateMachine.transition(serverId, ServerState.ACTIVATING, request.reason);

      // Connect to server
      if (this.connectHandler) {
        await this.connectHandler(serverId);
      }

      // Transition to active
      await this.stateMachine.transition(serverId, ServerState.ACTIVE, 'Successfully connected');

      // Emit success
      const duration = Date.now() - startTime;
      this.emit('activation:success', {
        serverId,
        duration,
        request
      });

      return {
        success: true,
        serverId,
        state: ServerState.ACTIVE,
        duration
      };
    } catch (error) {
      // Transition to error
      await this.stateMachine.transition(
        serverId,
        ServerState.ERROR,
        error instanceof Error ? error.message : 'Activation failed'
      );

      // Emit failure
      this.emit('activation:failed', {
        serverId,
        error,
        request
      });

      return {
        success: false,
        serverId,
        state: ServerState.ERROR,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Deactivate a server
   */
  async deactivate(serverId: string, reason?: string): Promise<ActivationResult> {
    const currentState = this.stateMachine.getState(serverId);

    // Check if can deactivate
    if (currentState !== ServerState.ACTIVE && currentState !== ServerState.IDLING) {
      return {
        success: false,
        serverId,
        state: currentState,
        error: `Cannot deactivate from state: ${currentState}`
      };
    }

    try {
      // Transition to stopping
      await this.stateMachine.transition(
        serverId,
        ServerState.STOPPING,
        reason ?? 'Manual deactivation'
      );

      // Disconnect from server
      if (this.disconnectHandler) {
        await this.disconnectHandler(serverId);
      }

      // Transition to inactive
      await this.stateMachine.transition(
        serverId,
        ServerState.INACTIVE,
        'Successfully disconnected'
      );

      this.emit('deactivation:success', { serverId });

      return {
        success: true,
        serverId,
        state: ServerState.INACTIVE
      };
    } catch (error) {
      // Transition to error
      await this.stateMachine.transition(
        serverId,
        ServerState.ERROR,
        error instanceof Error ? error.message : 'Deactivation failed'
      );

      this.emit('deactivation:failed', {
        serverId,
        error
      });

      return {
        success: false,
        serverId,
        state: ServerState.ERROR,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Activate all "always" servers
   */
  async activateAlwaysServers(): Promise<Map<string, ActivationResult>> {
    const results = new Map<string, ActivationResult>();

    for (const [serverId, config] of this.serverConfigs) {
      if (config.activationPolicy === 'always') {
        const result = await this.activate(
          serverId,
          {
            type: 'startup'
          },
          'Startup activation for always policy'
        );

        results.set(serverId, result);
      }
    }

    return results;
  }

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
  getActivationHistory(serverId: string): ActivationRequest[] {
    return this.activationHistory.get(serverId) ?? [];
  }

  /**
   * Wait for cooldown period
   */
  private async waitForCooldown(serverId: string): Promise<void> {
    const config = this.serverConfigs.get(serverId);
    const cooldownMs = config?._lastError?.retryAfterMs ?? 5000;

    await new Promise((resolve) => setTimeout(resolve, cooldownMs));

    // Transition from cooldown to inactive
    await this.stateMachine.transition(serverId, ServerState.INACTIVE, 'Cooldown period complete');
  }

  /**
   * Record activation in history
   */
  private recordActivation(request: ActivationRequest): void {
    const history = this.activationHistory.get(request.serverId) ?? [];
    history.push(request);

    // Keep only recent history
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    this.activationHistory.set(request.serverId, history);
  }

  /**
   * Handle server error
   */
  async handleServerError(serverId: string, error: Error, retryAfterMs?: number): Promise<void> {
    const config = this.serverConfigs.get(serverId);
    if (config) {
      config._lastError = {
        message: error.message,
        timestamp: new Date().toISOString(),
        retryAfterMs: retryAfterMs ?? 5000
      };
    }

    // Transition to error state
    await this.stateMachine.transition(serverId, ServerState.ERROR, error.message);

    // Auto-transition to cooldown
    setTimeout(async () => {
      if (this.stateMachine.getState(serverId) === ServerState.ERROR) {
        await this.stateMachine.transition(
          serverId,
          ServerState.COOLDOWN,
          'Entering cooldown after error'
        );
      }
    }, 1000);
  }

  /**
   * Reset server state
   */
  async resetServer(serverId: string): Promise<void> {
    // Deactivate if active
    const state = this.stateMachine.getState(serverId);
    if (state === ServerState.ACTIVE || state === ServerState.IDLING) {
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

    // Deactivate all active servers
    await Promise.all(activeServers.map((id) => this.deactivate(id, 'System shutdown')));

    // Clear all state
    this.stateMachine.resetAll();
    this.activationQueue.clear();
    this.activationHistory.clear();
  }
}
