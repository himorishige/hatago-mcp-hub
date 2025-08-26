/**
 * Functional concurrency utilities
 * Simple semaphore and task queue implementations using closures
 */

/**
 * Semaphore interface
 */
export interface Semaphore {
  acquire(): Promise<void>;
  release(): void;
  withPermit<T>(fn: () => Promise<T>): Promise<T>;
  available(): number;
  isAvailable(): boolean;
}

/**
 * Create a semaphore with the given number of permits
 */
export function createSemaphore(permits: number): Semaphore {
  let available = permits;
  const waiting: Array<() => void> = [];

  return {
    /**
     * Acquire a permit, waiting if necessary
     */
    async acquire(): Promise<void> {
      return new Promise<void>((resolve) => {
        if (available > 0) {
          available--;
          resolve();
        } else {
          waiting.push(resolve);
        }
      });
    },

    /**
     * Release a permit, potentially unblocking a waiter
     */
    release(): void {
      available++;
      if (waiting.length > 0 && available > 0) {
        available--;
        const resolve = waiting.shift();
        resolve?.();
      }
    },

    /**
     * Run a function with a permit, automatically acquiring and releasing
     */
    async withPermit<T>(fn: () => Promise<T>): Promise<T> {
      await this.acquire();
      try {
        return await fn();
      } finally {
        this.release();
      }
    },

    /**
     * Get the number of available permits
     */
    available(): number {
      return available;
    },

    /**
     * Check if any permits are available
     */
    isAvailable(): boolean {
      return available > 0;
    },
  };
}

/**
 * Task queue interface
 */
export interface TaskQueue<_T = unknown> {
  add<R>(fn: () => Promise<R>): Promise<R>;
  pause(): void;
  resume(): void;
  clear(): void;
  size(): number;
  pending(): number;
  running(): number;
  isPaused(): boolean;
}

/**
 * Create a task queue with concurrency control
 */
export function createTaskQueue<T = unknown>(
  concurrency: number,
): TaskQueue<T> {
  const semaphore = createSemaphore(concurrency);
  const pendingTasks: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  let running = 0;
  let paused = false;

  const processPending = async () => {
    while (pendingTasks.length > 0 && !paused) {
      const task = pendingTasks.shift();
      if (!task) break;

      running++;
      try {
        const result = await semaphore.withPermit(task.fn);
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      } finally {
        running--;
      }
    }
  };

  return {
    /**
     * Add a task to the queue
     */
    async add<R>(fn: () => Promise<R>): Promise<R> {
      return new Promise<R>((resolve, reject) => {
        if (paused) {
          pendingTasks.push({
            fn: fn as () => Promise<unknown>,
            resolve: resolve as (value: unknown) => void,
            reject,
          });
        } else {
          // Try to execute immediately if semaphore available
          if (semaphore.isAvailable()) {
            running++;
            semaphore
              .withPermit(fn)
              .then((result) => {
                running--;
                resolve(result);
              })
              .catch((error) => {
                running--;
                reject(error);
              });
          } else {
            // Queue for later execution
            pendingTasks.push({
              fn: fn as () => Promise<unknown>,
              resolve: resolve as (value: unknown) => void,
              reject,
            });
            processPending();
          }
        }
      });
    },

    /**
     * Pause task processing
     */
    pause(): void {
      paused = true;
    },

    /**
     * Resume task processing
     */
    resume(): void {
      paused = false;
      processPending();
    },

    /**
     * Clear pending tasks
     */
    clear(): void {
      pendingTasks.length = 0;
    },

    /**
     * Get total queue size
     */
    size(): number {
      return pendingTasks.length + running;
    },

    /**
     * Get number of pending tasks
     */
    pending(): number {
      return pendingTasks.length;
    },

    /**
     * Get number of running tasks
     */
    running(): number {
      return running;
    },

    /**
     * Check if queue is paused
     */
    isPaused(): boolean {
      return paused;
    },
  };
}

/**
 * Create a simple mutex (binary semaphore)
 */
export function createMutex(): Semaphore {
  return createSemaphore(1);
}

/**
 * Create a rate limiter
 */
export interface RateLimiter {
  acquire(): Promise<void>;
  withLimit<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Create a rate limiter that allows N operations per time window
 */
export function createRateLimiter(
  operations: number,
  windowMs: number,
): RateLimiter {
  const times: number[] = [];

  const cleanup = () => {
    const now = Date.now();
    const cutoff = now - windowMs;
    while (times.length > 0 && times[0] < cutoff) {
      times.shift();
    }
  };

  return {
    async acquire(): Promise<void> {
      return new Promise<void>((resolve) => {
        const attempt = () => {
          cleanup();
          if (times.length < operations) {
            times.push(Date.now());
            resolve();
          } else {
            // Wait and retry
            const oldestTime = times[0];
            const waitTime = oldestTime + windowMs - Date.now() + 1;
            setTimeout(attempt, Math.max(1, waitTime));
          }
        };
        attempt();
      });
    },

    async withLimit<T>(fn: () => Promise<T>): Promise<T> {
      await this.acquire();
      return fn();
    },
  };
}
