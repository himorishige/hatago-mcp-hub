import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackoffStrategy,
  CircuitBreaker,
  CircuitState,
  ErrorSeverity,
} from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    vi.clearAllMocks();
    circuitBreaker = new CircuitBreaker('test-circuit', {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
      monitoringWindowMs: 5000,
    });
  });

  it('should start in closed state', () => {
    expect(circuitBreaker.getState()).toBe(CircuitState.Closed);
    expect(circuitBreaker.isOpen()).toBe(false);
  });

  it('should execute operation successfully in closed state', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await circuitBreaker.execute(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledOnce();
    expect(circuitBreaker.getState()).toBe(CircuitState.Closed);
  });

  it('should open after failure threshold reached', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Service error'));

    // Execute failures up to threshold
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation);
      } catch (_error) {
        // Expected
      }
    }

    expect(circuitBreaker.getState()).toBe(CircuitState.Open);
    expect(circuitBreaker.isOpen()).toBe(true);
  });

  it('should reject calls when open', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Service error'));

    // Trigger open state
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation);
      } catch (_error) {
        // Expected
      }
    }

    // Should reject without calling operation
    await expect(circuitBreaker.execute(operation)).rejects.toThrow(
      'Circuit breaker',
    );
    expect(operation).toHaveBeenCalledTimes(3); // Only the initial failures
  });

  it('should transition to half-open after timeout', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Service error'));

    // Trigger open state
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation);
      } catch (_error) {
        // Expected
      }
    }

    expect(circuitBreaker.getState()).toBe(CircuitState.Open);

    // Fast-forward time
    vi.advanceTimersByTime(1001);

    // Next call should transition to half-open
    const successOperation = vi.fn().mockResolvedValue('success');
    await circuitBreaker.execute(successOperation);

    expect(circuitBreaker.getState()).toBe(CircuitState.HalfOpen);
  });

  it('should close from half-open after success threshold', async () => {
    // Create circuit breaker with timeout
    const cb = new CircuitBreaker('test', {
      failureThreshold: 2,
      resetTimeoutMs: 100,
      successThreshold: 2,
    });

    const failingOperation = vi.fn().mockRejectedValue(new Error('Error'));
    const successOperation = vi.fn().mockResolvedValue('success');

    // Open circuit
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(failingOperation);
      } catch (_error) {
        // Expected
      }
    }

    expect(cb.getState()).toBe(CircuitState.Open);

    // Wait for transition to half-open
    await new Promise((resolve) => setTimeout(resolve, 101));

    // Execute successful operations
    await cb.execute(successOperation);
    expect(cb.getState()).toBe(CircuitState.HalfOpen);

    await cb.execute(successOperation);
    expect(cb.getState()).toBe(CircuitState.Closed);
  });

  it('should classify errors by severity', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 10,
      errorThresholds: {
        [ErrorSeverity.Critical]: 1,
        [ErrorSeverity.High]: 2,
        [ErrorSeverity.Medium]: 5,
        [ErrorSeverity.Low]: 10,
      },
    });

    // Critical error should open immediately
    const criticalError = new Error('Out of memory');

    try {
      await cb.execute(() => Promise.reject(criticalError));
    } catch (_error) {
      // Expected
    }

    expect(cb.getState()).toBe(CircuitState.Open);
  });

  it('should handle different backoff strategies', () => {
    const exponentialCB = new CircuitBreaker('exp', {
      backoffStrategy: BackoffStrategy.Exponential,
      resetTimeoutMs: 1000,
      backoffMultiplier: 2,
    });

    const linearCB = new CircuitBreaker('linear', {
      backoffStrategy: BackoffStrategy.Linear,
      resetTimeoutMs: 1000,
      backoffMultiplier: 2,
    });

    const fixedCB = new CircuitBreaker('fixed', {
      backoffStrategy: BackoffStrategy.Fixed,
      resetTimeoutMs: 1000,
    });

    // Force open state to trigger backoff calculation
    exponentialCB.forceOpen();
    linearCB.forceOpen();
    fixedCB.forceOpen();

    // All should be in open state
    expect(exponentialCB.getState()).toBe(CircuitState.Open);
    expect(linearCB.getState()).toBe(CircuitState.Open);
    expect(fixedCB.getState()).toBe(CircuitState.Open);
  });

  it('should track slow calls', async () => {
    const cb = new CircuitBreaker('test', {
      slowCallDurationMs: 100,
      slowCallRateThreshold: 0.5,
      failureThreshold: 10, // High threshold to focus on slow calls
    });

    const slowOperation = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return 'slow-success';
    });

    const fastOperation = vi.fn().mockResolvedValue('fast-success');

    // Execute mix of slow and fast calls
    await cb.execute(slowOperation);
    await cb.execute(fastOperation);

    const stats = cb.getStats();
    expect(stats.slowCalls).toBe(1);
    expect(stats.totalCalls).toBe(2);
  });

  it('should emit state change events', async () => {
    const stateChanges: any[] = [];
    circuitBreaker.on('state-change', (event) => {
      stateChanges.push(event);
    });

    const operation = vi.fn().mockRejectedValue(new Error('Error'));

    // Trigger state change to open
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation);
      } catch (_error) {
        // Expected
      }
    }

    expect(stateChanges.length).toBe(1);
    expect(stateChanges[0].from).toBe(CircuitState.Closed);
    expect(stateChanges[0].to).toBe(CircuitState.Open);
  });

  it('should provide detailed statistics', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Service error'));

    try {
      await circuitBreaker.execute(operation);
    } catch (_error) {
      // Expected
    }

    const stats = circuitBreaker.getStats();

    expect(stats.state).toBe(CircuitState.Closed);
    expect(stats.failureCount).toBe(1);
    expect(stats.totalCalls).toBe(1);
    expect(stats.errorStats).toBeDefined();
    expect(stats.errorStats[ErrorSeverity.Medium]).toBe(1);
  });

  it('should allow manual state control', () => {
    // Force open
    circuitBreaker.forceOpen();
    expect(circuitBreaker.getState()).toBe(CircuitState.Open);

    // Force close
    circuitBreaker.forceClose();
    expect(circuitBreaker.getState()).toBe(CircuitState.Closed);

    const stats = circuitBreaker.getStats();
    expect(stats.failureCount).toBe(0);
    expect(stats.successCount).toBe(0);
  });

  it('should limit concurrent calls in half-open state', async () => {
    const cb = new CircuitBreaker('test', {
      failureThreshold: 1,
      halfOpenMaxCalls: 2,
      resetTimeoutMs: 100,
    });

    // Open circuit
    try {
      await cb.execute(() => Promise.reject(new Error('Error')));
    } catch (_error) {
      // Expected
    }

    // Wait for half-open
    await new Promise((resolve) => setTimeout(resolve, 101));

    const slowOperation = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return 'success';
    });

    // Start concurrent calls
    const promises = [cb.execute(slowOperation), cb.execute(slowOperation)];

    // Third call should be rejected
    await expect(cb.execute(slowOperation)).rejects.toThrow(
      'half-open call limit',
    );

    // Wait for original calls to complete
    await Promise.all(promises);
  });
});
