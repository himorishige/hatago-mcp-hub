/**
 * Tests for pure functional routing logic
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearParseCache,
  filterCandidates,
  generatePublicName,
  makeRouteDecision,
  parsePublicName,
  resolveRoute,
  selectServer,
} from './mcp-router-functional.js';
import type { RegistryState, RouteTarget } from './mcp-router-types.js';

describe('mcp-router-functional', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure isolation
    clearParseCache();
  });

  describe('parsePublicName', () => {
    it('should parse namespace strategy names (suffix)', () => {
      const result = parsePublicName('tool_name_server1', 'namespace', '_');
      expect(result).toEqual({
        originalName: 'tool_name',
        serverId: 'server1',
      });
    });

    it('should parse alias strategy names (prefix)', () => {
      const result = parsePublicName('server1_tool_name', 'alias', '_');
      expect(result).toEqual({
        serverId: 'server1',
        originalName: 'tool_name',
      });
    });

    it('should return null for error strategy', () => {
      const result = parsePublicName('tool_name', 'error', '_');
      expect(result).toBeNull();
    });

    it('should handle custom separator', () => {
      const result = parsePublicName('tool_name__server1', 'namespace', '__');
      expect(result).toEqual({
        originalName: 'tool_name',
        serverId: 'server1',
      });
    });

    it('should handle names with multiple separators', () => {
      const result = parsePublicName(
        'tool_name_with_underscore_server1',
        'namespace',
        '_',
      );
      expect(result).toEqual({
        originalName: 'tool_name_with_underscore',
        serverId: 'server1',
      });
    });

    it('should return null if separator not found', () => {
      const result = parsePublicName('toolname', 'namespace', '_');
      expect(result).toBeNull();
    });

    it('should return null for empty or whitespace-only input', () => {
      expect(parsePublicName('', 'namespace', '_')).toBeNull();
      expect(parsePublicName('   ', 'namespace', '_')).toBeNull();
      expect(parsePublicName('tool', 'namespace', '')).toBeNull();
    });

    it('should cache results for performance', () => {
      const name = 'cached_tool_server1';

      // First call - should parse
      const result1 = parsePublicName(name, 'namespace', '_');
      expect(result1).toEqual({
        originalName: 'cached_tool',
        serverId: 'server1',
      });

      // Second call - should return cached result (same instance)
      const result2 = parsePublicName(name, 'namespace', '_');
      expect(result2).toBe(result1); // Same reference

      // Different parameters - should not use cache
      const result3 = parsePublicName(name, 'alias', '_');
      expect(result3).not.toBe(result1);
    });

    it('should handle cache size limits', () => {
      // Fill cache beyond MAX_CACHE_SIZE (1000)
      const results = [];
      for (let i = 0; i < 1100; i++) {
        const name = `tool_${i}_server`;
        const result = parsePublicName(name, 'namespace', '_');
        if (i < 10) {
          results.push(result);
        }
      }

      // Cache should have been pruned, but recent entries should still work
      const recent = parsePublicName('tool_1099_server', 'namespace', '_');
      expect(recent).toEqual({
        originalName: 'tool_1099',
        serverId: 'server',
      });
    });
  });

  describe('generatePublicName', () => {
    it('should generate namespace strategy names', () => {
      const result = generatePublicName(
        'server1',
        'tool_name',
        'namespace',
        '_',
      );
      expect(result).toBe('tool_name_server1');
    });

    it('should generate alias strategy names', () => {
      const result = generatePublicName('server1', 'tool_name', 'alias', '_');
      expect(result).toBe('server1_tool_name');
    });

    it('should return original name for error strategy', () => {
      const result = generatePublicName('server1', 'tool_name', 'error', '_');
      expect(result).toBe('tool_name');
    });

    it('should use custom separator', () => {
      const result = generatePublicName(
        'server1',
        'tool_name',
        'namespace',
        '__',
      );
      expect(result).toBe('tool_name__server1');
    });

    it('should handle default case for unknown strategy', () => {
      const result = generatePublicName(
        'server1',
        'tool_name',
        'unknown' as any,
        '_',
      );
      expect(result).toBe('tool_name_server1');
    });

    it('should throw error for too long server ID', () => {
      const longServerId = 'a'.repeat(101);
      expect(() =>
        generatePublicName(longServerId, 'tool', 'namespace', '_'),
      ).toThrow('Server ID too long (max 100 chars)');
    });

    it('should throw error for too long name', () => {
      const longName = 'a'.repeat(201);
      expect(() =>
        generatePublicName('server1', longName, 'namespace', '_'),
      ).toThrow('Name too long (max 200 chars)');
    });
  });

  describe('resolveRoute', () => {
    const createRegistryState = (): RegistryState => {
      const state: RegistryState = new Map();
      state.set('tool_server1', {
        serverId: 'server1',
        originalName: 'tool',
      });
      state.set('another_tool_server2', {
        serverId: 'server2',
        originalName: 'another_tool',
      });
      return state;
    };

    it('should resolve direct lookup from registry', () => {
      const registry = createRegistryState();
      const result = resolveRoute('tool_server1', registry, 'namespace');

      expect(result.target).toEqual({
        serverId: 'server1',
        originalName: 'tool',
      });
      expect(result.error).toBeUndefined();
    });

    it('should parse and resolve if not directly found', () => {
      const registry = createRegistryState();
      // Add the expected parsed name to registry
      registry.set('parsed_tool_server3', {
        serverId: 'server3',
        originalName: 'parsed_tool',
      });

      const result = resolveRoute('parsed_tool_server3', registry, 'namespace');

      expect(result.target).toEqual({
        serverId: 'server3',
        originalName: 'parsed_tool',
      });
    });

    it('should return null target if not found', () => {
      const registry = createRegistryState();
      const result = resolveRoute('unknown_tool', registry, 'namespace');

      expect(result.target).toBeNull();
      expect(result.error).toContain(
        'Unable to resolve route for: unknown_tool',
      );
    });

    it('should handle alias strategy', () => {
      const registry: RegistryState = new Map();
      registry.set('server1_tool', {
        serverId: 'server1',
        originalName: 'tool',
      });

      const result = resolveRoute('server1_tool', registry, 'alias');

      expect(result.target).toEqual({
        serverId: 'server1',
        originalName: 'tool',
      });
    });
  });

  describe('selectServer', () => {
    const candidates: RouteTarget[] = [
      { serverId: 'server1', originalName: 'tool' },
      { serverId: 'server2', originalName: 'tool' },
    ];

    it('should select first candidate', () => {
      const result = selectServer(candidates);
      expect(result).toEqual(candidates[0]);
    });

    it('should return null for empty array', () => {
      const result = selectServer([]);
      expect(result).toBeNull();
    });

    it('should accept context for future extensibility', () => {
      const result = selectServer(candidates, { requestId: '123' });
      expect(result).toEqual(candidates[0]);
    });
  });

  describe('filterCandidates', () => {
    const candidates: RouteTarget[] = [
      { serverId: 'server1', originalName: 'tool' },
      { serverId: 'server2', originalName: 'tool' },
    ];

    it('should return all candidates (no filtering currently)', () => {
      const result = filterCandidates(candidates);
      expect(result).toEqual(candidates);
    });

    it('should accept context for future extensibility', () => {
      const result = filterCandidates(candidates, { sessionId: 'abc' });
      expect(result).toEqual(candidates);
    });
  });

  describe('makeRouteDecision', () => {
    it('should return selected target', () => {
      const candidates: RouteTarget[] = [
        { serverId: 'server1', originalName: 'tool' },
        { serverId: 'server2', originalName: 'tool' },
      ];

      const result = makeRouteDecision(candidates);

      expect(result.target).toEqual(candidates[0]);
      expect(result.error).toBeUndefined();
      expect(result.metadata).toEqual({
        candidatesCount: 2,
        filteredCount: 2,
      });
    });

    it('should handle empty candidates', () => {
      const result = makeRouteDecision([]);

      expect(result.target).toBeNull();
      expect(result.error).toBe('No suitable target found');
      expect(result.metadata).toEqual({
        candidatesCount: 0,
        filteredCount: 0,
      });
    });

    it('should include metadata about filtering', () => {
      const candidates: RouteTarget[] = [
        { serverId: 'server1', originalName: 'tool' },
      ];

      const result = makeRouteDecision(candidates, { requestId: '123' });

      expect(result.metadata).toEqual({
        candidatesCount: 1,
        filteredCount: 1,
      });
    });
  });
});
