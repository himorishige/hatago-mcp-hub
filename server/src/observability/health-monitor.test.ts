import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HealthMonitor,
  type HealthProbe,
  HealthState,
} from './health-monitor.js';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor = new HealthMonitor({ checkIntervalMs: 100 }); // Fast interval for tests
  });

  afterEach(() => {
    monitor.stop();
  });

  it('should start in starting state', () => {
    const health = monitor.getHealth();
    expect(health.state).toBe(HealthState.Starting);
    expect(monitor.isLive()).toBe(true);
    expect(monitor.isReady()).toBe(false);
    expect(monitor.isStarted()).toBe(false);
  });

  it('should add and remove probes', () => {
    const probe: HealthProbe = {
      name: 'test',
      check: async () => ({ success: true }),
    };

    monitor.addProbe('component1', probe);
    monitor.removeProbe('component1', 'test');

    // Should not crash on unknown probe
    expect(monitor.removeProbe('unknown', 'test')).toBe(false);
  });

  it('should transition to ready when all probes pass', async () => {
    const probe: HealthProbe = {
      name: 'test',
      check: async () => ({ success: true, message: 'OK' }),
    };

    monitor.addProbe('test-component', probe);

    // Wait for health check
    await new Promise((resolve) => setTimeout(resolve, 150));

    const health = monitor.getHealth();
    expect(health.state).toBe(HealthState.Ready);
    expect(monitor.isReady()).toBe(true);
    expect(monitor.isStarted()).toBe(true);
    expect(health.readyAt).toBeDefined();
  });

  it('should transition to failing when critical probe fails', async () => {
    const failingProbe: HealthProbe = {
      name: 'critical-test',
      critical: true,
      check: async () => ({ success: false, message: 'Failed' }),
    };

    monitor.addProbe('test-component', failingProbe);

    // Wait for health check
    await new Promise((resolve) => setTimeout(resolve, 150));

    const health = monitor.getHealth();
    expect(health.state).toBe(HealthState.Failing);
    expect(monitor.isReady()).toBe(false);
  });

  it('should transition to not ready when non-critical probe fails', async () => {
    const passingProbe: HealthProbe = {
      name: 'passing',
      critical: true,
      check: async () => ({ success: true }),
    };

    const failingProbe: HealthProbe = {
      name: 'failing',
      critical: false,
      check: async () => ({ success: false }),
    };

    monitor.addProbe('component1', passingProbe);
    monitor.addProbe('component2', failingProbe);

    // Wait for health check
    await new Promise((resolve) => setTimeout(resolve, 150));

    const health = monitor.getHealth();
    expect(health.state).toBe(HealthState.NotReady);
  });

  it('should handle probe timeouts', async () => {
    const timeoutProbe: HealthProbe = {
      name: 'timeout-test',
      timeoutMs: 50,
      check: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { success: true };
      },
    };

    monitor.addProbe('test-component', timeoutProbe);

    // Wait for health check
    await new Promise((resolve) => setTimeout(resolve, 200));

    const health = monitor.getHealth();
    const component = health.components['test-component'];
    expect(component.probes['timeout-test'].success).toBe(false);
    expect(component.probes['timeout-test'].message).toContain('timed out');
  });

  it('should handle probe exceptions', async () => {
    const throwingProbe: HealthProbe = {
      name: 'throwing-test',
      check: async () => {
        throw new Error('Probe error');
      },
    };

    monitor.addProbe('test-component', throwingProbe);

    // Wait for health check
    await new Promise((resolve) => setTimeout(resolve, 150));

    const health = monitor.getHealth();
    const component = health.components['test-component'];
    expect(component.probes['throwing-test'].success).toBe(false);
    expect(component.probes['throwing-test'].message).toBe('Probe error');
  });

  it('should emit state change events', async () => {
    const stateChanges: any[] = [];
    monitor.on('state-change', (event) => {
      stateChanges.push(event);
    });

    const probe: HealthProbe = {
      name: 'test',
      check: async () => ({ success: true }),
    };

    monitor.addProbe('test-component', probe);

    // Wait for state change
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(stateChanges.length).toBeGreaterThan(0);
    expect(stateChanges[stateChanges.length - 1].to).toBe(HealthState.Ready);
  });

  it('should calculate component summary correctly', async () => {
    const readyProbe: HealthProbe = {
      name: 'ready',
      check: async () => ({ success: true }),
    };

    const failingProbe: HealthProbe = {
      name: 'failing',
      critical: true,
      check: async () => ({ success: false }),
    };

    monitor.addProbe('ready-component', readyProbe);
    monitor.addProbe('failing-component', failingProbe);

    // Wait for health check
    await new Promise((resolve) => setTimeout(resolve, 150));

    const health = monitor.getHealth();
    expect(health.summary.total).toBe(2);
    expect(health.summary.ready).toBe(1);
    expect(health.summary.failing).toBe(1);
    expect(health.summary.failed).toBe(0);
  });

  it('should track failure counts for failure threshold', async () => {
    const monitor = new HealthMonitor({
      checkIntervalMs: 50,
      failureThreshold: 2,
    });

    const failingProbe: HealthProbe = {
      name: 'failing',
      critical: true,
      check: async () => ({ success: false }),
    };

    monitor.addProbe('test-component', failingProbe);

    // Wait for multiple checks
    await new Promise((resolve) => setTimeout(resolve, 200));

    const health = monitor.getHealth();
    expect(health.components['test-component'].state).toBe(HealthState.Failed);

    monitor.stop();
  });

  it('should handle manual health checks', async () => {
    const probe: HealthProbe = {
      name: 'test',
      check: async () => ({ success: true }),
    };

    monitor.addProbe('test-component', probe);

    const health = await monitor.check();
    expect(health.state).toBe(HealthState.Ready);
    expect(health.components['test-component']).toBeDefined();
  });
});
