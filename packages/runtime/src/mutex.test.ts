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

  it('should queue concurrent operations', async () => {
    const mutex = createMutex();
    const results: number[] = [];

    const operations = Array.from({ length: 5 }, (_, i) =>
      mutex.runExclusive(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(i);
      }),
    );

    await Promise.all(operations);
    expect(results).toEqual([0, 1, 2, 3, 4]);
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

  it('should allow concurrent operations on different keys', async () => {
    const keyedMutex = createKeyedMutex<string>();
    const results: string[] = [];

    await Promise.all([
      keyedMutex.runExclusive('key1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push('key1');
      }),
      keyedMutex.runExclusive('key2', async () => {
        results.push('key2');
      }),
    ]);

    expect(results).toContain('key1');
    expect(results).toContain('key2');
    expect(results.length).toBe(2);
  });

  it('should queue operations on the same key', async () => {
    const keyedMutex = createKeyedMutex<string>();
    const results: number[] = [];

    const operations = Array.from({ length: 3 }, (_, i) =>
      keyedMutex.runExclusive('same-key', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(i);
      }),
    );

    await Promise.all(operations);
    expect(results).toEqual([0, 1, 2]);
  });
});
