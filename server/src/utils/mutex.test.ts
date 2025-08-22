/**
 * Tests for mutex implementation
 */

import { describe, expect, it } from 'vitest';
import { createKeyedMutex, createMutex } from './mutex.js';

describe('Mutex', () => {
  it('should acquire and release lock', async () => {
    const mutex = createMutex();
    const release = await mutex.acquire();
    release();
    // Should be able to acquire again
    const release2 = await mutex.acquire();
    release2();
    expect(true).toBe(true);
  });

  it('should run exclusive function', async () => {
    const mutex = createMutex();
    let counter = 0;

    await mutex.runExclusive(() => {
      counter++;
    });

    expect(counter).toBe(1);
  });

  it('should handle async functions', async () => {
    const mutex = createMutex();
    let counter = 0;

    await mutex.runExclusive(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      counter++;
    });

    expect(counter).toBe(1);
  });
});

describe('KeyedMutex', () => {
  it('should run exclusive function for a key', async () => {
    const keyedMutex = createKeyedMutex<string>();
    let counter = 0;

    await keyedMutex.runExclusive('key1', () => {
      counter++;
    });

    expect(counter).toBe(1);
  });

  it('should handle async functions', async () => {
    const keyedMutex = createKeyedMutex<string>();
    let counter = 0;

    await keyedMutex.runExclusive('key1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      counter++;
    });

    expect(counter).toBe(1);
  });

  it('should allow different keys to run in parallel', async () => {
    const keyedMutex = createKeyedMutex<string>();
    const results: number[] = [];

    const task1 = keyedMutex.runExclusive('key1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(1);
      return 1;
    });

    const task2 = keyedMutex.runExclusive('key2', async () => {
      results.push(2);
      return 2;
    });

    const [r1, r2] = await Promise.all([task1, task2]);

    expect(r1).toBe(1);
    expect(r2).toBe(2);
    // Task 2 should complete first since different key
    expect(results).toEqual([2, 1]);
  });
});
