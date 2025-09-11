/**
 * Server state machine for managing server lifecycle (extracted)
 */

import { createEventEmitter, type EventEmitter as HubEventEmitter } from './utils/events.js';
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
 */
export class ServerStateMachine {
  private states = new Map<string, ServerState>();
  private transitions = new Map<string, Promise<void>>();
  private transitionHistory = new Map<string, StateTransitionEvent[]>();
  private events: HubEventEmitter<string, unknown>;

  constructor() {
    this.events = createEventEmitter<string, unknown>();
  }

  getState(serverId: string): ServerState {
    return this.states.get(serverId) ?? ServerState.INACTIVE;
  }

  setState(serverId: string, state: ServerState): void {
    this.states.set(serverId, state);
  }

  canTransition(from: ServerState, to: ServerState): boolean {
    const validTargets = VALID_TRANSITIONS[from];
    return validTargets?.includes(to) ?? false;
  }

  transition(serverId: string, to: ServerState, reason?: string): Promise<void> {
    const from = this.getState(serverId);
    if (!this.canTransition(from, to)) {
      return Promise.reject(
        new Error(`Invalid state transition for ${serverId}: ${from} -> ${to}`)
      );
    }
    this.executeTransition(serverId, from, to, reason);
    return Promise.resolve();
  }

  private executeTransition(
    serverId: string,
    from: ServerState,
    to: ServerState,
    reason?: string
  ): void {
    this.states.set(serverId, to);

    const event: StateTransitionEvent = {
      serverId,
      from,
      to,
      reason,
      timestamp: new Date().toISOString()
    };

    const history = this.transitionHistory.get(serverId) ?? [];
    history.push(event);
    if (history.length > 100) history.shift();
    this.transitionHistory.set(serverId, history);

    this.events.emit('transition', event);
    this.events.emit(`transition:${serverId}`, event);
    this.events.emit(`state:${to}`, { serverId, reason });
  }

  getHistory(serverId: string): StateTransitionEvent[] {
    return this.transitionHistory.get(serverId) ?? [];
  }

  getAllStates(): Map<string, ServerState> {
    return new Map(this.states);
  }

  isActive(serverId: string): boolean {
    const state = this.getState(serverId);
    return state === ServerState.ACTIVE;
  }

  canActivate(serverId: string): boolean {
    const state = this.getState(serverId);
    return state === ServerState.INACTIVE || state === ServerState.ERROR;
  }

  isTransitioning(serverId: string): boolean {
    return this.transitions.has(serverId);
  }

  async waitForTransition(serverId: string): Promise<void> {
    const transition = this.transitions.get(serverId);
    if (transition) await transition;
  }

  reset(serverId: string): void {
    this.states.delete(serverId);
    this.transitions.delete(serverId);
    this.transitionHistory.delete(serverId);
  }

  resetAll(): void {
    this.states.clear();
    this.transitions.clear();
    this.transitionHistory.clear();
  }

  on(event: string, handler: (data: unknown) => void): void {
    this.events.on(event, handler);
  }
  off(event: string, handler: (data: unknown) => void): void {
    this.events.off(event, handler);
  }
}
