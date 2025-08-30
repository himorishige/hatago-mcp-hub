/**
 * Server state machine for managing server lifecycle
 */

import { EventEmitter } from 'node:events';
import { ServerState } from '@hatago/core';

/**
 * State transition event
 */
export interface StateTransitionEvent {
  serverId: string;
  from: ServerState;
  to: ServerState;
  reason?: string;
  timestamp: string;
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<ServerState, ServerState[]> = {
  [ServerState.MANUAL]: [], // Cannot transition from manual
  [ServerState.INACTIVE]: [ServerState.ACTIVATING],
  [ServerState.ACTIVATING]: [ServerState.ACTIVE, ServerState.ERROR],
  [ServerState.ACTIVE]: [
    ServerState.IDLING,
    ServerState.STOPPING,
    ServerState.ERROR,
  ],
  [ServerState.IDLING]: [ServerState.ACTIVE, ServerState.STOPPING],
  [ServerState.STOPPING]: [ServerState.INACTIVE, ServerState.ERROR],
  [ServerState.ERROR]: [ServerState.COOLDOWN],
  [ServerState.COOLDOWN]: [ServerState.INACTIVE],
};

/**
 * Server state machine
 * Manages server lifecycle states and transitions
 */
export class ServerStateMachine extends EventEmitter {
  private states = new Map<string, ServerState>();
  private transitions = new Map<string, Promise<void>>();
  private transitionHistory = new Map<string, StateTransitionEvent[]>();

  /**
   * Get current state of a server
   */
  getState(serverId: string): ServerState {
    return this.states.get(serverId) || ServerState.INACTIVE;
  }

  /**
   * Set initial state without transition
   * Used for initialization from saved state
   */
  setState(serverId: string, state: ServerState): void {
    this.states.set(serverId, state);
  }

  /**
   * Check if a transition is valid
   */
  canTransition(from: ServerState, to: ServerState): boolean {
    const validTargets = VALID_TRANSITIONS[from];
    return validTargets?.includes(to) ?? false;
  }

  /**
   * Transition to a new state
   * Returns a promise that resolves when transition is complete
   */
  async transition(
    serverId: string,
    to: ServerState,
    reason?: string,
  ): Promise<void> {
    const from = this.getState(serverId);

    // Check if transition is valid
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid state transition for ${serverId}: ${from} -> ${to}`,
      );
    }

    // Wait for any ongoing transition
    const existing = this.transitions.get(serverId);
    if (existing) {
      await existing;
      // Re-check state after waiting
      const currentState = this.getState(serverId);
      if (currentState !== from) {
        throw new Error(
          `State changed during transition wait: expected ${from}, got ${currentState}`,
        );
      }
    }

    // Create transition promise
    const transitionPromise = this.executeTransition(
      serverId,
      from,
      to,
      reason,
    );
    this.transitions.set(serverId, transitionPromise);

    try {
      await transitionPromise;
    } finally {
      this.transitions.delete(serverId);
    }
  }

  /**
   * Execute the actual transition
   */
  private async executeTransition(
    serverId: string,
    from: ServerState,
    to: ServerState,
    reason?: string,
  ): Promise<void> {
    // Update state
    this.states.set(serverId, to);

    // Record in history
    const event: StateTransitionEvent = {
      serverId,
      from,
      to,
      reason,
      timestamp: new Date().toISOString(),
    };

    const history = this.transitionHistory.get(serverId) || [];
    history.push(event);

    // Keep only last 100 transitions per server
    if (history.length > 100) {
      history.shift();
    }
    this.transitionHistory.set(serverId, history);

    // Emit event
    this.emit('transition', event);
    this.emit(`transition:${serverId}`, event);

    // State-specific events
    this.emit(`state:${to}`, { serverId, reason });
  }

  /**
   * Get transition history for a server
   */
  getHistory(serverId: string): StateTransitionEvent[] {
    return this.transitionHistory.get(serverId) || [];
  }

  /**
   * Get all server states
   */
  getAllStates(): Map<string, ServerState> {
    return new Map(this.states);
  }

  /**
   * Check if server is in an active state
   */
  isActive(serverId: string): boolean {
    const state = this.getState(serverId);
    return state === ServerState.ACTIVE || state === ServerState.IDLING;
  }

  /**
   * Check if server can be activated
   */
  canActivate(serverId: string): boolean {
    const state = this.getState(serverId);
    return (
      state === ServerState.INACTIVE ||
      state === ServerState.COOLDOWN ||
      state === ServerState.ERROR
    );
  }

  /**
   * Check if server is transitioning
   */
  isTransitioning(serverId: string): boolean {
    return this.transitions.has(serverId);
  }

  /**
   * Wait for any ongoing transition to complete
   */
  async waitForTransition(serverId: string): Promise<void> {
    const transition = this.transitions.get(serverId);
    if (transition) {
      await transition;
    }
  }

  /**
   * Reset server state
   * Used for cleanup or testing
   */
  reset(serverId: string): void {
    this.states.delete(serverId);
    this.transitions.delete(serverId);
    this.transitionHistory.delete(serverId);
  }

  /**
   * Reset all states
   */
  resetAll(): void {
    this.states.clear();
    this.transitions.clear();
    this.transitionHistory.clear();
  }
}
