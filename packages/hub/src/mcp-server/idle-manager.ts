/**
 * Idle management with reference counting
 * Tracks server usage and manages automatic shutdown
 */

import { EventEmitter } from 'node:events';
import type { IdlePolicy } from '@himorishige/hatago-core';
import { ServerState } from '@himorishige/hatago-core';
import type { ActivationManager } from './activation-manager.js';
import type { ServerStateMachine } from './state-machine.js';

/**
 * Activity tracking data
 */
export interface ActivityData {
  serverId: string;
  lastActivity: number;
  referenceCount: number;
  activeSessions: Set<string>;
  activeTools: Map<string, number>;
  startTime: number;
  totalCalls: number;
}

/**
 * Idle check result
 */
export interface IdleCheckResult {
  serverId: string;
  isIdle: boolean;
  idleTimeMs: number;
  referenceCount: number;
  shouldStop: boolean;
  reason?: string;
}

/**
 * Idle manager for automatic server shutdown
 */
export class IdleManager extends EventEmitter {
  private readonly stateMachine: ServerStateMachine;
  private readonly activationManager: ActivationManager;
  private readonly activities = new Map<string, ActivityData>();
  private readonly idlePolicies = new Map<string, IdlePolicy>();
  private readonly checkInterval: number = 10000; // 10 seconds
  private checkTimer?: NodeJS.Timeout;
  private readonly idleTimers = new Map<string, NodeJS.Timeout>();

  constructor(stateMachine: ServerStateMachine, activationManager: ActivationManager) {
    super();
    this.stateMachine = stateMachine;
    this.activationManager = activationManager;

    // Listen to state changes
    this.stateMachine.on('state:ACTIVE', ({ serverId }: { serverId: string }) => {
      this.initializeActivity(serverId);
    });

    this.stateMachine.on('state:INACTIVE', ({ serverId }: { serverId: string }) => {
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
    if (this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      this.checkAllServers();
    }, this.checkInterval);

    this.emit('monitoring:started');
  }

  /**
   * Stop idle monitoring
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }

    // Clear all idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    this.emit('monitoring:stopped');
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
    activity.activeSessions.add(sessionId);

    if (toolName) {
      const count = activity.activeTools.get(toolName) ?? 0;
      activity.activeTools.set(toolName, count + 1);
    }

    // Reset activity time based on policy
    if (resetTiming === 'onCallStart') {
      activity.lastActivity = Date.now();
      this.cancelIdleTimer(serverId);
    }

    activity.totalCalls++;

    this.emit('activity:start', {
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

    if (toolName) {
      const count = activity.activeTools.get(toolName) ?? 0;
      if (count <= 1) {
        activity.activeTools.delete(toolName);
      } else {
        activity.activeTools.set(toolName, count - 1);
      }
    }

    // Reset activity time based on policy
    if (resetTiming === 'onCallEnd') {
      activity.lastActivity = Date.now();
    }

    // Remove session if no more references
    if (activity.referenceCount === 0) {
      activity.activeSessions.delete(sessionId);
    }

    this.emit('activity:end', {
      serverId,
      sessionId,
      toolName,
      referenceCount: activity.referenceCount
    });

    // Schedule idle check if no references
    if (activity.referenceCount === 0) {
      this.scheduleIdleCheck(serverId);
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

      this.emit('activity:touch', { serverId });
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
    if (state !== ServerState.ACTIVE && state !== ServerState.IDLING) {
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

    // No policy = never stop
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

    // Check minimum linger time
    if (runTimeMs < (policy.minLingerMs ?? 30000)) {
      return {
        serverId,
        isIdle: true,
        idleTimeMs,
        referenceCount: 0,
        shouldStop: false,
        reason: `Minimum linger time not met (${runTimeMs}ms < ${policy.minLingerMs}ms)`
      };
    }

    // Check idle timeout
    const shouldStop = idleTimeMs >= (policy.idleTimeoutMs ?? 300000);

    return {
      serverId,
      isIdle: true,
      idleTimeMs,
      referenceCount: 0,
      shouldStop,
      reason: shouldStop
        ? `Idle timeout exceeded (${idleTimeMs}ms >= ${policy.idleTimeoutMs}ms)`
        : `Within idle timeout (${idleTimeMs}ms < ${policy.idleTimeoutMs}ms)`
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
      activeSessions: new Set(),
      activeTools: new Map(),
      startTime: now,
      totalCalls: 0
    });

    this.emit('activity:initialized', { serverId });
  }

  /**
   * Clear activity tracking
   */
  private clearActivity(serverId: string): void {
    this.activities.delete(serverId);
    this.cancelIdleTimer(serverId);

    this.emit('activity:cleared', { serverId });
  }

  /**
   * Schedule idle check for a server
   */
  private scheduleIdleCheck(serverId: string): void {
    const policy = this.idlePolicies.get(serverId);
    if (!policy) return;

    // Cancel existing timer
    this.cancelIdleTimer(serverId);

    // Schedule new check
    const timer = setTimeout(async () => {
      const result = this.checkIdle(serverId);

      if (result.shouldStop) {
        await this.handleIdleStop(serverId, result);
      } else if (result.isIdle) {
        // Transition to idling state
        const state = this.stateMachine.getState(serverId);
        if (state === ServerState.ACTIVE) {
          await this.stateMachine.transition(serverId, ServerState.IDLING, 'Server is idle');
        }
      }
    }, policy.idleTimeoutMs);

    this.idleTimers.set(serverId, timer);
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

    // Transition back to active if idling
    const state = this.stateMachine.getState(serverId);
    if (state === ServerState.IDLING) {
      this.stateMachine
        .transition(serverId, ServerState.ACTIVE, 'Activity resumed')
        .catch((err) => {
          this.emit('error', err);
        });
    }
  }

  /**
   * Check all servers for idle
   */
  private checkAllServers(): void {
    for (const [serverId, activity] of this.activities) {
      // Skip if has references
      if (activity.referenceCount > 0) continue;

      const result = this.checkIdle(serverId);

      if (result.shouldStop) {
        this.handleIdleStop(serverId, result).catch((err) => {
          this.emit('error', err);
        });
      }
    }
  }

  /**
   * Handle idle server stop
   */
  private async handleIdleStop(serverId: string, result: IdleCheckResult): Promise<void> {
    this.emit('idle:stopping', {
      serverId,
      reason: result.reason,
      idleTimeMs: result.idleTimeMs
    });

    try {
      await this.activationManager.deactivate(serverId, `Idle timeout: ${result.reason}`);

      this.emit('idle:stopped', { serverId });
    } catch (error) {
      this.emit('idle:stop-failed', {
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
}
