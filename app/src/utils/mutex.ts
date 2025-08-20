/**
 * Simple Mutex implementation for exclusive execution
 * Ensures proper lock release even on errors
 */
export class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  /**
   * Acquire the lock
   * Returns a release function that must be called to release the lock
   */
  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  /**
   * Release the lock
   * Automatically allows the next queued operation to proceed
   */
  private release(): void {
    const next = this.queue.shift();
    if (next) {
      // Let the next waiter acquire the lock
      next();
    } else {
      this.locked = false;
    }
  }

  /**
   * Execute a function exclusively (with automatic lock management)
   * The lock is automatically released after the function completes or throws
   */
  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release(); // Always release, even on error
    }
  }
}

/**
 * Keyed Mutex for managing multiple independent locks
 * Each key has its own mutex
 */
export class KeyedMutex<K = string> {
  private mutexes = new Map<K, Mutex>();

  /**
   * Get or create a mutex for the given key
   */
  private getMutex(key: K): Mutex {
    let mutex = this.mutexes.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(key, mutex);
    }
    return mutex;
  }

  /**
   * Execute a function exclusively for a given key
   */
  async runExclusive<T>(key: K, fn: () => Promise<T> | T): Promise<T> {
    const mutex = this.getMutex(key);
    return mutex.runExclusive(fn);
  }

  /**
   * Clean up mutex for a key (optional, for memory management)
   */
  delete(key: K): void {
    this.mutexes.delete(key);
  }

  /**
   * Clear all mutexes
   */
  clear(): void {
    this.mutexes.clear();
  }
}
