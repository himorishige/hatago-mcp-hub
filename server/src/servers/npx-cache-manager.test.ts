/**
 * Tests for NPX Cache Manager
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getNpxCacheManager, NpxCacheManager } from './npx-cache-manager.js';

describe('NpxCacheManager', () => {
  let manager: NpxCacheManager;

  beforeEach(() => {
    // Create a fresh instance for each test
    manager = new NpxCacheManager();
  });

  describe('recordWarmupResult', () => {
    it('should record successful warmup as cached', () => {
      manager.recordWarmupResult(
        '@modelcontextprotocol/server-filesystem',
        true,
      );
      // This would be async in real use, but we can test the recording logic
      expect(manager.getCachedPackages()).toContain(
        '@modelcontextprotocol/server-filesystem',
      );
    });

    it('should not mark failed warmup as cached', () => {
      manager.recordWarmupResult('non-existent-package', false);
      expect(manager.getCachedPackages()).not.toContain('non-existent-package');
    });
  });

  describe('parsePackageName', () => {
    // Type assertion for accessing private methods in tests
    type NpxCacheManagerPrivate = NpxCacheManager & {
      parsePackageName(packageSpec: string): string;
    };

    it('should parse package name without version', () => {
      // Using private method through reflection for testing
      const parsed = (manager as NpxCacheManagerPrivate).parsePackageName(
        '@modelcontextprotocol/server-filesystem',
      );
      expect(parsed).toBe('@modelcontextprotocol/server-filesystem');
    });

    it('should parse package name with version', () => {
      const parsed = (manager as NpxCacheManagerPrivate).parsePackageName(
        '@modelcontextprotocol/server-filesystem@1.0.0',
      );
      expect(parsed).toBe('@modelcontextprotocol/server-filesystem');
    });

    it('should handle non-scoped packages', () => {
      const parsed = (manager as NpxCacheManagerPrivate).parsePackageName(
        'express@4.18.0',
      );
      expect(parsed).toBe('express');
    });
  });

  describe('clearStatus', () => {
    it('should clear both warmup and cache status', () => {
      const packageSpec = 'test-package';
      manager.recordWarmupResult(packageSpec, true);
      expect(manager.getCachedPackages()).toContain(packageSpec);

      manager.clearStatus(packageSpec);
      expect(manager.getCachedPackages()).not.toContain(packageSpec);
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getNpxCacheManager();
      const instance2 = getNpxCacheManager();
      expect(instance1).toBe(instance2);
    });
  });
});
