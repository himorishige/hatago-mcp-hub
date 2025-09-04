/**
 * Circuit breaker pattern implementation
 */

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failure threshold to open circuit */
  failureThreshold: number;

  /** Success threshold to close circuit from half-open */
  successThreshold: number;

  /** Time window for counting failures (ms) */
  timeWindow: number;

  /** Cool-down period before trying half-open (ms) */
  cooldownPeriod: number;

  /** Optional callback when state changes */
  onStateChange?: (oldState: CircuitState, newState: CircuitState) => void;
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number[] = [];
  private successes: number[] = [];
  private lastFailureTime?: number;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 3,
      timeWindow: config.timeWindow ?? 60000, // 1 minute
      cooldownPeriod: config.cooldownPeriod ?? 30000, // 30 seconds
      onStateChange: config.onStateChange
    };
  }

  /**
   * Check if request should be allowed
   */
  shouldAllow(): boolean {
    this.updateState();

    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        return false;

      case CircuitState.HALF_OPEN:
        return true; // Allow limited requests to test
    }
  }

  /**
   * Record successful operation
   */
  recordSuccess(): void {
    const now = Date.now();
    this.successes.push(now);

    // Clean old successes
    this.successes = this.successes.filter((time) => now - time <= this.config.timeWindow);

    // Check if should close from half-open
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes.length >= this.config.successThreshold) {
        this.changeState(CircuitState.CLOSED);
        this.failures = [];
      }
    }
  }

  /**
   * Record failed operation
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;

    // Clean old failures
    this.failures = this.failures.filter((time) => now - time <= this.config.timeWindow);

    // Check if should open circuit
    if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
      if (this.failures.length >= this.config.failureThreshold) {
        this.changeState(CircuitState.OPEN);
        this.successes = [];
      }
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime?: number;
  } {
    return {
      state: this.state,
      failures: this.failures.length,
      successes: this.successes.length,
      lastFailureTime: this.lastFailureTime
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.changeState(CircuitState.CLOSED);
    this.failures = [];
    this.successes = [];
    this.lastFailureTime = undefined;
  }

  /**
   * Update state based on time and conditions
   */
  private updateState(): void {
    if (this.state === CircuitState.OPEN && this.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;

      // Check if cooldown period has passed
      if (timeSinceLastFailure >= this.config.cooldownPeriod) {
        this.changeState(CircuitState.HALF_OPEN);
      }
    }
  }

  /**
   * Change state with callback
   */
  private changeState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (this.config.onStateChange && oldState !== newState) {
      this.config.onStateChange(oldState, newState);
    }
  }
}

/**
 * Create a circuit breaker with default config
 */
export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Execute function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>
): Promise<T> {
  if (!breaker.shouldAllow()) {
    throw new Error(`Circuit breaker is ${breaker.getState()}`);
  }

  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}
