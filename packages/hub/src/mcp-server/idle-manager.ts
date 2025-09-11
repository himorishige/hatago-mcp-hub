/**
 * Idle management with reference counting
 * Tracks server usage and manages automatic shutdown
 *
 * Simplified design:
 * - No periodic scan timer
 * - Single scheduled timer per server when referenceCount becomes 0
 * - Stop condition is evaluated once per schedule based on policy
 */

import { createEventEmitter, type EventEmitter as HubEventEmitter } from '../utils/events.js';
import type { IdlePolicy } from '@himorishige/hatago-core';
import { ServerState } from '@himorishige/hatago-core';
import type { ActivationManager } from './activation-manager.js';
import type { ServerStateMachine } from './state-machine.js';

/**
 * Activity tracking data
 */
export type ActivityData = {
  serverId: string;
  lastActivity: number;
  referenceCount: number;
  startTime: number;
};

/**
 * Idle check result
 */
export type IdleCheckResult = {
  serverId: string;
  isIdle: boolean;
  idleTimeMs: number;
  referenceCount: number;
  shouldStop: boolean;
  reason?: string;
};

/**
 * Idle manager for automatic server shutdown
 */
export class IdleManager {
  private readonly stateMachine: ServerStateMachine;
  private readonly activationManager: ActivationManager;
  private readonly activities = new Map<string, ActivityData>();
  private readonly idlePolicies = new Map<string, IdlePolicy>();
  private readonly idleTimers = new Map<string, NodeJS.Timeout>();
  private events: HubEventEmitter<string, unknown>;

  constructor(stateMachine: ServerStateMachine, activationManager: ActivationManager) {
    this.events = createEventEmitter<string, unknown>();
    this.stateMachine = stateMachine;
    this.activationManager = activationManager;

    // Listen to state changes (initialize/clear activity lifecycle)
    this.stateMachine.on('state:ACTIVE', (data: unknown) => {
      const { serverId } = data as { serverId: string };
      this.initializeActivity(serverId);
    });

    this.stateMachine.on('state:INACTIVE', (data: unknown) => {
      const { serverId } = data as { serverId: string };
      this.clearActivity(serverId);
    });
  }

  /**
   * Register server idle policy
   */
  registerPolicy(serverId: string, policy?: IdlePolicy): void {
    if (policy) {
      this.idlePolicies.set(serverId, {
        idleTimeoutMs: policy.idleTimeoutMs ?? 300000, // 5 min default
        minLingerMs: policy.minLingerMs ?? 30000, // 30 sec default
        activityReset: policy.activityReset ?? 'onCallEnd'
      });
    }
  }

  /**
   * Start idle monitoring
   */
  start(): void {
    // No-op: periodic monitoring removed
    this.events.emit('monitoring:started', undefined);
  }

  /**
   * Stop idle monitoring
   */
  stop(): void {
    // Clear all idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    this.events.emit('monitoring:stopped', undefined);
  }

  /**
   * Track activity start (increment reference)
   */
  trackActivityStart(serverId: string, sessionId: string, toolName?: string): void {
    const activity = this.activities.get(serverId);
    if (!activity) return;

    const policy = this.idlePolicies.get(serverId);
    const resetTiming = policy?.activityReset ?? 'onCallEnd';

    // Update reference count
    activity.referenceCount++;

    // Reset activity time based on policy
    if (resetTiming === 'onCallStart') {
      activity.lastActivity = Date.now();
      this.cancelIdleTimer(serverId);
    }

    this.events.emit('activity:start', {
      serverId,
      sessionId,
      toolName,
      referenceCount: activity.referenceCount
    });
  }

  /**
   * Track activity end (decrement reference)
   */
  trackActivityEnd(serverId: string, sessionId: string, toolName?: string): void {
    const activity = this.activities.get(serverId);
    if (!activity) return;

    const policy = this.idlePolicies.get(serverId);
    const resetTiming = policy?.activityReset ?? 'onCallEnd';

    // Update reference count
    activity.referenceCount = Math.max(0, activity.referenceCount - 1);

    // Reset activity time based on policy
    if (resetTiming === 'onCallEnd') {
      activity.lastActivity = Date.now();
    }

    // Remove session if no more references
    // (Sessions/tools tracking removed)

    this.events.emit('activity:end', {
      serverId,
      sessionId,
      toolName,
      referenceCount: activity.referenceCount
    });

    // Schedule idle stop if no references
    if (activity.referenceCount === 0) {
      this.scheduleIdleStop(serverId);
    }
  }

  /**
   * Force activity update
   */
  touchActivity(serverId: string): void {
    const activity = this.activities.get(serverId);
    if (activity) {
      activity.lastActivity = Date.now();
      this.cancelIdleTimer(serverId);

      this.events.emit('activity:touch', { serverId });
    }
  }

  /**
   * Check if server is idle
   */
  checkIdle(serverId: string): IdleCheckResult {
    const activity = this.activities.get(serverId);
    const policy = this.idlePolicies.get(serverId);
    const state = this.stateMachine.getState(serverId);

    // Not active = not idle
    if (state !== ServerState.ACTIVE) {
      return {
        serverId,
        isIdle: false,
        idleTimeMs: 0,
        referenceCount: 0,
        shouldStop: false,
        reason: 'Server not active'
      };
    }

    // No activity data
    if (!activity) {
      return {
        serverId,
        isIdle: true,
        idleTimeMs: 0,
        referenceCount: 0,
        shouldStop: false,
        reason: 'No activity data'
      };
    }

    // Has active references
    if (activity.referenceCount > 0) {
      return {
        serverId,
        isIdle: false,
        idleTimeMs: 0,
        referenceCount: activity.referenceCount,
        shouldStop: false,
        reason: 'Active references exist'
      };
    }

    // No policy = never stop (but report idle time)
    if (!policy) {
      return {
        serverId,
        isIdle: true,
        idleTimeMs: Date.now() - activity.lastActivity,
        referenceCount: 0,
        shouldStop: false,
        reason: 'No idle policy defined'
      };
    }

    const now = Date.now();
    const idleTimeMs = now - activity.lastActivity;
    const runTimeMs = now - activity.startTime;

    // Compute stop condition: both minLinger and idleTimeout satisfied
    const lingerOk = runTimeMs >= (policy.minLingerMs ?? 30000);
    const idleOk = idleTimeMs >= (policy.idleTimeoutMs ?? 300000);
    const shouldStop = lingerOk && idleOk;

    return {
      serverId,
      isIdle: true,
      idleTimeMs,
      referenceCount: 0,
      shouldStop,
      reason: shouldStop
        ? `Idle + linger satisfied (${idleTimeMs}ms idle, ${runTimeMs}ms runtime)`
        : `Waiting conditions (idle:${idleOk}, linger:${lingerOk})`
    };
  }

  /**
   * Get activity statistics
   */
  getActivityStats(serverId: string): ActivityData | undefined {
    return this.activities.get(serverId);
  }

  /**
   * Get all activities
   */
  getAllActivities(): Map<string, ActivityData> {
    return new Map(this.activities);
  }

  // Private methods

  /**
   * Initialize activity tracking
   */
  private initializeActivity(serverId: string): void {
    if (this.activities.has(serverId)) return;

    const now = Date.now();
    this.activities.set(serverId, {
      serverId,
      lastActivity: now,
      referenceCount: 0,
      startTime: now
    });

    this.events.emit('activity:initialized', { serverId });
  }

  /**
   * Clear activity tracking
   */
  private clearActivity(serverId: string): void {
    this.activities.delete(serverId);
    this.cancelIdleTimer(serverId);

    this.events.emit('activity:cleared', { serverId });
  }

  /**
   * Schedule idle check for a server
   */
  private scheduleIdleStop(serverId: string): void {
    const policy = this.idlePolicies.get(serverId);
    const activity = this.activities.get(serverId);
    if (!policy || !activity) return;

    // Cancel existing timer if any
    this.cancelIdleTimer(serverId);

    const now = Date.now();
    const idleElapsed = now - activity.lastActivity;
    const runElapsed = now - activity.startTime;

    const idleWait = Math.max((policy.idleTimeoutMs ?? 300000) - idleElapsed, 0);
    const lingerWait = Math.max((policy.minLingerMs ?? 30000) - runElapsed, 0);
    const waitMs = Math.max(idleWait, lingerWait);

    if (waitMs === 0) {
      // Conditions already satisfied, stop immediately
      void this.handleIdleStop(serverId, this.checkIdle(serverId));
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        const result = this.checkIdle(serverId);
        if (result.shouldStop) {
          await this.handleIdleStop(serverId, result);
        }
      })();
    }, waitMs);

    this.idleTimers.set(serverId, timer);
    this.events.emit('idle:scheduled', { serverId, waitMs });
  }

  /**
   * Cancel idle timer
   */
  private cancelIdleTimer(serverId: string): void {
    const timer = this.idleTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(serverId);
    }
    this.events.emit('idle:canceled', { serverId });
  }

  /**
   * Handle idle server stop
   */
  private async handleIdleStop(serverId: string, result: IdleCheckResult): Promise<void> {
    this.events.emit('idle:stopping', {
      serverId,
      reason: result.reason,
      idleTimeMs: result.idleTimeMs
    });

    try {
      await this.activationManager.deactivate(serverId, `Idle timeout: ${result.reason}`);

      this.events.emit('idle:stopped', { serverId });
    } catch (error) {
      this.events.emit('idle:stop-failed', {
        serverId,
        error
      });
    }
  }

  /**
   * Force stop idle servers
   */
  async stopIdleServers(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const serverId of this.activities.keys()) {
      const result = this.checkIdle(serverId);

      if (result.isIdle && result.referenceCount === 0) {
        try {
          await this.activationManager.deactivate(serverId, 'Force stop idle servers');
          results.set(serverId, true);
        } catch {
          results.set(serverId, false);
        }
      }
    }

    return results;
  }

  /**
   * Reset idle tracking
   */
  reset(): void {
    this.stop();
    this.activities.clear();
    this.idlePolicies.clear();
  }
  // Lightweight on/off
  on(event: string, handler: (data: unknown) => void): void {
    this.events.on(event, handler);
  }
  off(event: string, handler: (data: unknown) => void): void {
    this.events.off(event, handler);
  }
}
