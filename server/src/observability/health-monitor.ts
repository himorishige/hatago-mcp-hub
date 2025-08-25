/**
 * Health Monitor
 *
 * Kubernetes-compatible health monitoring with liveness/readiness/startup probes.
 */

import { EventEmitter } from 'node:events';
import type { ServerNode } from '../proxy/server-node.js';
import type { Transport } from '../transport/index.js';
import { incrementCounter, METRICS, setGauge } from './metrics.js';
import { logger } from './structured-logger.js';

export enum HealthState {
  Unknown = 'unknown',
  Starting = 'starting',
  Ready = 'ready',
  NotReady = 'not-ready',
  Failing = 'failing',
  Failed = 'failed',
}

export interface HealthProbe {
  name: string;
  description?: string;
  critical?: boolean;
  timeoutMs?: number;
  check: () => Promise<HealthProbeResult>;
}

export interface HealthProbeResult {
  success: boolean;
  message?: string;
  latencyMs?: number;
  metadata?: Record<string, any>;
}

export interface ComponentHealth {
  name: string;
  state: HealthState;
  probes: Record<string, HealthProbeResult>;
  lastCheck: number;
  message?: string;
}

export interface OverallHealth {
  state: HealthState;
  startedAt: number;
  readyAt?: number;
  lastCheck: number;
  message?: string;
  components: Record<string, ComponentHealth>;
  summary: {
    total: number;
    ready: number;
    failing: number;
    failed: number;
  };
}

export interface HealthMonitorOptions {
  checkIntervalMs?: number;
  probeTimeoutMs?: number;
  failureThreshold?: number;
  startupTimeoutMs?: number;
}

export class HealthMonitor extends EventEmitter {
  private readonly startedAt = Date.now();
  private readyAt?: number;
  private state = HealthState.Starting;
  private components = new Map<string, ComponentHealth>();
  private probes = new Map<string, HealthProbe>();
  private checkTimer?: NodeJS.Timeout;
  private failureCounts = new Map<string, number>();

  private readonly options: Required<HealthMonitorOptions>;

  constructor(options: HealthMonitorOptions = {}) {
    super();
    this.options = {
      checkIntervalMs: options.checkIntervalMs ?? 30000, // 30s
      probeTimeoutMs: options.probeTimeoutMs ?? 5000, // 5s
      failureThreshold: options.failureThreshold ?? 3,
      startupTimeoutMs: options.startupTimeoutMs ?? 120000, // 2min
    };

    this.setupDefaultProbes();
    // Don't start monitoring automatically - must be explicitly started
  }

  /**
   * Add health probe
   */
  addProbe(componentName: string, probe: HealthProbe): void {
    const key = `${componentName}:${probe.name}`;
    this.probes.set(key, probe);

    logger.info('Health probe registered', {
      component: componentName,
      probe: probe.name,
      critical: probe.critical ?? false,
    });
  }

  /**
   * Remove health probe
   */
  removeProbe(componentName: string, probeName: string): boolean {
    const key = `${componentName}:${probeName}`;
    return this.probes.delete(key);
  }

  /**
   * Add server node to monitoring
   */
  addServerNode(node: ServerNode): void {
    this.addProbe('servers', {
      name: node.name,
      description: `Server node ${node.name} connectivity`,
      critical: true,
      check: async () => {
        const isAvailable = node.isAvailable;
        return {
          success: isAvailable,
          message: isAvailable
            ? 'Server available'
            : `Server unavailable: ${node.state}`,
          metadata: {
            state: node.state,
            activeCalls: node.activeCalls,
            connectionAttempts: node.connectionAttempts,
            lastError: node.lastError?.message,
          },
        };
      },
    });
  }

  /**
   * Remove server node from monitoring
   */
  removeServerNode(nodeName: string): boolean {
    return this.removeProbe('servers', nodeName);
  }

  /**
   * Add transport to monitoring
   */
  addTransport(name: string, transport: Transport): void {
    this.addProbe('transport', {
      name,
      description: `Transport ${name} connectivity`,
      critical: true,
      check: async () => {
        const isConnected = transport.isConnected();
        return {
          success: isConnected,
          message: isConnected
            ? 'Transport connected'
            : 'Transport disconnected',
          metadata: {
            connected: isConnected,
          },
        };
      },
    });
  }

  /**
   * Remove transport from monitoring
   */
  removeTransport(name: string): boolean {
    return this.removeProbe('transport', name);
  }

  /**
   * Get current health status
   */
  getHealth(): OverallHealth {
    const components: Record<string, ComponentHealth> = {};
    let total = 0;
    let ready = 0;
    let failing = 0;
    let failed = 0;

    // Group probes by component
    for (const component of this.components.values()) {
      components[component.name] = component;
      total++;

      switch (component.state) {
        case HealthState.Ready:
          ready++;
          break;
        case HealthState.Failing:
          failing++;
          break;
        case HealthState.Failed:
          failed++;
          break;
      }
    }

    return {
      state: this.state,
      startedAt: this.startedAt,
      readyAt: this.readyAt,
      lastCheck: Date.now(),
      components,
      summary: { total, ready, failing, failed },
    };
  }

  /**
   * Get liveness status
   */
  isLive(): boolean {
    return this.state !== HealthState.Failed;
  }

  /**
   * Get readiness status
   */
  isReady(): boolean {
    return this.state === HealthState.Ready;
  }

  /**
   * Get startup status
   */
  isStarted(): boolean {
    return (
      this.state !== HealthState.Starting && this.state !== HealthState.Unknown
    );
  }

  /**
   * Manual health check
   */
  async check(): Promise<OverallHealth> {
    await this.runHealthChecks();
    return this.getHealth();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }

    this.state = HealthState.Failed;
    this.emit('state-change', { from: this.state, to: HealthState.Failed });
  }

  private setupDefaultProbes(): void {
    // System resources probe
    this.addProbe('system', {
      name: 'resources',
      description: 'System resource availability',
      critical: false,
      check: async () => {
        const memUsage = process.memoryUsage();
        const heapUsed = memUsage.heapUsed / 1024 / 1024; // MB
        const heapTotal = memUsage.heapTotal / 1024 / 1024; // MB
        const heapPercent = (heapUsed / heapTotal) * 100;

        const success = heapPercent < 90;

        return {
          success,
          message: success
            ? `Memory usage normal (${heapPercent.toFixed(1)}%)`
            : `High memory usage (${heapPercent.toFixed(1)}%)`,
          metadata: {
            heapUsedMB: Math.round(heapUsed),
            heapTotalMB: Math.round(heapTotal),
            heapPercent: Math.round(heapPercent),
            rssMB: Math.round(memUsage.rss / 1024 / 1024),
          },
        };
      },
    });

    // Startup timeout probe
    this.addProbe('system', {
      name: 'startup-timeout',
      description: 'Startup timeout check',
      critical: true,
      check: async () => {
        const uptime = Date.now() - this.startedAt;
        const timedOut =
          this.state === HealthState.Starting &&
          uptime > this.options.startupTimeoutMs;

        return {
          success: !timedOut,
          message: timedOut
            ? `Startup timeout after ${this.options.startupTimeoutMs}ms`
            : `Startup in progress (${uptime}ms)`,
          metadata: {
            uptimeMs: uptime,
            timeoutMs: this.options.startupTimeoutMs,
            timedOut,
          },
        };
      },
    });
  }

  /**
   * Start health monitoring
   */
  startMonitoring(): void {
    this.checkTimer = setInterval(() => {
      this.runHealthChecks().catch((error) => {
        logger.error('Health check error', { error });
      });
    }, this.options.checkIntervalMs);

    // Initial check
    setImmediate(() => {
      this.runHealthChecks().catch((error) => {
        logger.error('Initial health check error', { error });
      });
    });
  }

  private async runHealthChecks(): Promise<void> {
    const componentHealth = new Map<string, ComponentHealth>();

    // Group probes by component
    const probesByComponent = new Map<string, Array<[string, HealthProbe]>>();
    for (const [key, probe] of this.probes) {
      const [componentName, probeName] = key.split(':');
      if (!probesByComponent.has(componentName)) {
        probesByComponent.set(componentName, []);
      }
      probesByComponent.get(componentName)?.push([probeName, probe]);
    }

    // Check each component
    for (const [componentName, probes] of probesByComponent) {
      const componentProbes: Record<string, HealthProbeResult> = {};
      let componentState = HealthState.Ready;
      let criticalFailures = 0;
      let anyFailure = false;

      for (const [probeName, probe] of probes) {
        const result = await this.runProbe(probe);
        componentProbes[probeName] = result;

        if (!result.success) {
          anyFailure = true;
          if (probe.critical) {
            criticalFailures++;
          }
        }
      }

      // Determine component state
      if (criticalFailures > 0) {
        const failureCount = this.failureCounts.get(componentName) || 0;
        if (failureCount >= this.options.failureThreshold) {
          componentState = HealthState.Failed;
        } else {
          componentState = HealthState.Failing;
          this.failureCounts.set(componentName, failureCount + 1);
        }
      } else if (anyFailure) {
        componentState = HealthState.NotReady;
        this.failureCounts.delete(componentName); // Reset failure count
      } else {
        componentState = HealthState.Ready;
        this.failureCounts.delete(componentName); // Reset failure count
      }

      componentHealth.set(componentName, {
        name: componentName,
        state: componentState,
        probes: componentProbes,
        lastCheck: Date.now(),
      });
    }

    // Update components
    this.components = componentHealth;

    // Determine overall state
    const previousState = this.state;
    this.updateOverallState();

    // Update metrics
    this.updateMetrics();

    // Emit events if state changed
    if (previousState !== this.state) {
      this.emit('state-change', { from: previousState, to: this.state });

      logger.info('Health state changed', {
        from: previousState,
        to: this.state,
        readyAt: this.readyAt,
      });
    }
  }

  private async runProbe(probe: HealthProbe): Promise<HealthProbeResult> {
    const startTime = Date.now();
    const timeoutMs = probe.timeoutMs ?? this.options.probeTimeoutMs;

    try {
      const result = await Promise.race([
        probe.check(),
        new Promise<HealthProbeResult>((resolve) => {
          setTimeout(
            () =>
              resolve({
                success: false,
                message: `Probe timed out after ${timeoutMs}ms`,
                latencyMs: timeoutMs,
              }),
            timeoutMs,
          );
        }),
      ]);

      return {
        ...result,
        latencyMs: result.latencyMs ?? Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  private updateOverallState(): void {
    const components = Array.from(this.components.values());

    // Check for any failed components
    const failedComponents = components.filter(
      (c) => c.state === HealthState.Failed,
    );
    if (failedComponents.length > 0) {
      this.state = HealthState.Failed;
      return;
    }

    // Check for any failing components
    const failingComponents = components.filter(
      (c) => c.state === HealthState.Failing,
    );
    if (failingComponents.length > 0) {
      this.state = HealthState.Failing;
      return;
    }

    // Check for any not ready components
    const notReadyComponents = components.filter(
      (c) => c.state === HealthState.NotReady,
    );
    if (notReadyComponents.length > 0) {
      this.state = HealthState.NotReady;
      return;
    }

    // All components ready
    if (this.state !== HealthState.Ready) {
      this.state = HealthState.Ready;
      this.readyAt = Date.now();
    }
  }

  private updateMetrics(): void {
    const health = this.getHealth();

    // Overall state
    setGauge('hatago_health_state', this.state === HealthState.Ready ? 1 : 0);
    setGauge(
      'hatago_health_startup_time',
      this.readyAt ? this.readyAt - this.startedAt : 0,
    );

    // Component states
    setGauge('hatago_health_components_total', health.summary.total);
    setGauge('hatago_health_components_ready', health.summary.ready);
    setGauge('hatago_health_components_failing', health.summary.failing);
    setGauge('hatago_health_components_failed', health.summary.failed);

    // Probe results
    for (const [componentName, component] of this.components) {
      for (const [probeName, result] of Object.entries(component.probes)) {
        incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
          component: componentName,
          probe: probeName,
          result: result.success ? 'success' : 'failure',
        });

        if (result.latencyMs) {
          setGauge('hatago_health_probe_latency_ms', result.latencyMs, {
            component: componentName,
            probe: probeName,
          });
        }
      }
    }
  }
}

// Global health monitor instance - no auto-start
export const healthMonitor = new HealthMonitor();

// Convenience functions
export function addHealthProbe(
  componentName: string,
  probe: HealthProbe,
): void {
  healthMonitor.addProbe(componentName, probe);
}

export function getHealth(): OverallHealth {
  return healthMonitor.getHealth();
}

export function isHealthy(): boolean {
  return healthMonitor.isReady();
}
