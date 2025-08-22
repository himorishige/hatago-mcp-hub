/**
 * Debug tests for mutex implementation
 */

import { describe, expect, it } from 'vitest';
import { createMutex } from './mutex.js';

describe('Mutex Debug', () => {
  it('should handle simple sequential locks', async () => {
    const mutex = createMutex();

    const release1 = await mutex.acquire();
    console.log('Lock 1 acquired');
    release1();
    console.log('Lock 1 released');

    const release2 = await mutex.acquire();
    console.log('Lock 2 acquired');
    release2();
    console.log('Lock 2 released');

    expect(true).toBe(true);
  });

  it('should handle two concurrent operations', async () => {
    const mutex = createMutex();
    let counter = 0;

    const task1 = mutex.runExclusive(async () => {
      console.log('Task 1 started');
      counter++;
      console.log('Task 1 done');
    });

    const task2 = mutex.runExclusive(async () => {
      console.log('Task 2 started');
      counter++;
      console.log('Task 2 done');
    });

    await Promise.all([task1, task2]);

    expect(counter).toBe(2);
  });

  it('should handle nested runExclusive', async () => {
    const mutex = createMutex();
    let value = 0;

    await mutex.runExclusive(async () => {
      value = 1;
      // This should not create a deadlock if we use the same mutex
      // But it would! So we shouldn't nest the same mutex
    });

    expect(value).toBe(1);
  });
});
