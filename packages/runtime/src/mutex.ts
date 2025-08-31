/**
 * Simple Mutex implementation using closures for state management
 * Ensures proper lock release even on errors
 */
export type Mutex = {
  acquire(): Promise<() => void>;
  runExclusive<T>(fn: () => Promise<T> | T): Promise<T>;
};

export function createMutex(): Mutex {
  const queue: Array<() => void> = [];
  let locked = false;

  const release = (): void => {
    const next = queue.shift();
    if (next) {
      // The lock remains locked, just transfer to next waiter
      next();
    } else {
      // No more waiters, release the lock
      locked = false;
    }
  };

  const acquire = async (): Promise<() => void> => {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        locked = true;
        resolve(() => release());
      };

      if (!locked) {
        // Immediately acquire if not locked
        tryAcquire();
      } else {
        // Queue the acquisition
        queue.push(tryAcquire);
      }
    });
  };

  const runExclusive = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    const releaseLock = await acquire();
    try {
      return await fn();
    } finally {
      releaseLock(); // Always release, even on error
    }
  };

  return { acquire, runExclusive };
}

/**
 * Keyed Mutex for managing multiple independent locks
 * Each key has its own mutex
 */
export type KeyedMutex<K = string> = {
  runExclusive<T>(key: K, fn: () => Promise<T> | T): Promise<T>;
  delete(key: K): void;
  clear(): void;
};

export function createKeyedMutex<K = string>(): KeyedMutex<K> {
  const mutexes = new Map<K, Mutex>();

  const getMutex = (key: K): Mutex => {
    let mutex = mutexes.get(key);
    if (!mutex) {
      mutex = createMutex();
      mutexes.set(key, mutex);
    }
    return mutex;
  };

  const runExclusive = async <T>(key: K, fn: () => Promise<T> | T): Promise<T> => {
    const mutex = getMutex(key);
    return mutex.runExclusive(fn);
  };

  const del = (key: K): void => {
    mutexes.delete(key);
  };

  const clear = (): void => {
    mutexes.clear();
  };

  return { runExclusive, delete: del, clear };
}
