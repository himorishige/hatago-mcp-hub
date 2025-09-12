/**
 * Server state machine for managing server lifecycle
 */

import { createEventEmitter, type EventEmitter as HubEventEmitter } from '../utils/events.js';
import { ServerState } from '@himorishige/hatago-core';

/**
 * State transition event
 */
export type StateTransitionEvent = {
  serverId: string;
  from: ServerState;
  to: ServerState;
  reason?: string;
  timestamp: string;
};

/**
 * Valid state transitions (simplified)
 * Note: IDLING/COOLDOWN have been removed from core types.
 */
const VALID_TRANSITIONS: Record<ServerState, ServerState[]> = {
  [ServerState.MANUAL]: [],
  [ServerState.INACTIVE]: [ServerState.ACTIVATING],
  [ServerState.ACTIVATING]: [ServerState.ACTIVE, ServerState.ERROR],
  [ServerState.ACTIVE]: [ServerState.STOPPING, ServerState.ERROR],
  [ServerState.STOPPING]: [ServerState.INACTIVE, ServerState.ERROR],
  [ServerState.ERROR]: [ServerState.INACTIVE]
};

/**
 * Server state machine
 * Manages server lifecycle states and transitions
 */
export class ServerStateMachine {
  private states = new Map<string, ServerState>();
  private transitions = new Map<string, Promise<void>>();
  private transitionHistory = new Map<string, StateTransitionEvent[]>();
  private events: HubEventEmitter<string, unknown>;

  constructor() {
    this.events = createEventEmitter<string, unknown>();
  }

  /**
   * Get current state of a server
   */
  getState(serverId: string): ServerState {
    return this.states.get(serverId) ?? ServerState.INACTIVE;
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
  transition(serverId: string, to: ServerState, reason?: string): Promise<void> {
    const from = this.getState(serverId);

    // Check if transition is valid
    if (!this.canTransition(from, to)) {
      return Promise.reject(
        new Error(`Invalid state transition for ${serverId}: ${from} -> ${to}`)
      );
    }

    // Execute synchronously; keep transitions map for compatibility (no real async work)
    this.executeTransition(serverId, from, to, reason);
    return Promise.resolve();
  }

  /**
   * Execute the actual transition
   */
  private executeTransition(
    serverId: string,
    from: ServerState,
    to: ServerState,
    reason?: string
  ): void {
    // Update state
    this.states.set(serverId, to);

    // Record in history
    const event: StateTransitionEvent = {
      serverId,
      from,
      to,
      reason,
      timestamp: new Date().toISOString()
    };

    const history = this.transitionHistory.get(serverId) ?? [];
    history.push(event);

    // Keep only last 100 transitions per server
    if (history.length > 100) {
      history.shift();
    }
    this.transitionHistory.set(serverId, history);

    // Emit event
    this.events.emit('transition', event);
    this.events.emit(`transition:${serverId}`, event);

    // State-specific events
    this.events.emit(`state:${to}`, { serverId, reason });
  }

  /**
   * Get transition history for a server
   */
  getHistory(serverId: string): StateTransitionEvent[] {
    return this.transitionHistory.get(serverId) ?? [];
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
    return state === ServerState.ACTIVE;
  }

  /**
   * Check if server can be activated
   */
  canActivate(serverId: string): boolean {
    const state = this.getState(serverId);
    return state === ServerState.INACTIVE || state === ServerState.ERROR;
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

  // Lightweight on/off
  on(event: string, handler: (data: unknown) => void): void {
    this.events.on(event, handler);
  }
  off(event: string, handler: (data: unknown) => void): void {
    this.events.off(event, handler);
  }
}
import { reportLegacyUsage } from '../utils/legacy-guard.js';
reportLegacyUsage('mcp-server', 'state-machine');
