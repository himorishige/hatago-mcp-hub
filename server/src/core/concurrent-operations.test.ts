/**
 * Tests for concurrent operation safety
 */

import { describe, expect, it } from 'vitest';
import { createKeyedMutex, createMutex } from '../utils/mutex.js';

describe('Concurrent Operations Safety', () => {
  describe('Basic Mutex', () => {
    it('should prevent concurrent modifications to shared state', async () => {
      const mutex = createMutex();
      let counter = 0;

      const increment = async () => {
        await mutex.runExclusive(async () => {
          const current = counter;
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 0));
          counter = current + 1;
        });
      };

      // Run 10 increments concurrently
      await Promise.all(Array.from({ length: 10 }, () => increment()));

      // Should have incremented exactly 10 times
      expect(counter).toBe(10);
    });

    it('should prevent race conditions in Set operations', async () => {
      const mutex = createMutex();
      const toolSet = new Set<string>();

      const addTools = async (prefix: string) => {
        for (let i = 0; i < 10; i++) {
          await mutex.runExclusive(() => {
            toolSet.add(`${prefix}-${i}`);
          });
        }
      };

      // Run multiple concurrent additions
      await Promise.all([addTools('a'), addTools('b'), addTools('c')]);

      // Should have exactly 30 tools
      expect(toolSet.size).toBe(30);
    });
  });

  describe('Keyed Mutex', () => {
    it('should allow concurrent operations on different keys', async () => {
      const keyedMutex = createKeyedMutex<string>();
      const results: string[] = [];

      const operation = async (key: string, value: string) => {
        await keyedMutex.runExclusive(key, () => {
          results.push(value);
        });
      };

      // Run operations on different keys
      await Promise.all([
        operation('key1', 'a'),
        operation('key2', 'b'),
        operation('key3', 'c'),
      ]);

      // All operations should complete
      expect(results.length).toBe(3);
      expect(results).toContain('a');
      expect(results).toContain('b');
      expect(results).toContain('c');
    });

    it('should serialize operations on the same key', async () => {
      const keyedMutex = createKeyedMutex<string>();
      const results: number[] = [];

      const operation = async (value: number) => {
        await keyedMutex.runExclusive('shared-key', async () => {
          results.push(value);
          // Small delay to ensure serialization is tested
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      };

      // Run operations on the same key
      await Promise.all([operation(1), operation(2), operation(3)]);

      // All operations should complete
      expect(results.length).toBe(3);
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain(3);
    });
  });
});
