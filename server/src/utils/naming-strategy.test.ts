import { describe, expect, it } from 'vitest';
import type { NamingStrategy } from '../config/types.js';
import {
  createNamingFunction,
  createParsingFunction,
  generatePublicName,
  parsePublicName,
} from './naming-strategy.js';

describe('naming-strategy', () => {
  describe('generatePublicName', () => {
    it('should generate namespace strategy names (suffix)', () => {
      const result = generatePublicName('server1', 'tool_name', 'namespace');
      expect(result).toBe('tool_name_server1');
    });

    it('should generate alias strategy names (prefix)', () => {
      const result = generatePublicName('server1', 'tool_name', 'alias');
      expect(result).toBe('server1_tool_name');
    });

    it('should not modify names with error strategy', () => {
      const result = generatePublicName('server1', 'tool_name', 'error');
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

    it('should handle URIs correctly', () => {
      const result = generatePublicName(
        'server1',
        'file://path/to/file',
        'namespace',
      );
      expect(result).toBe('file://path/to/file_server1');
    });

    it('should handle names with special characters', () => {
      const result = generatePublicName('server-1', 'tool.name', 'alias', '_');
      expect(result).toBe('server-1_tool.name');
    });

    it('should default to namespace strategy for unknown strategies', () => {
      const result = generatePublicName(
        'server1',
        'tool_name',
        'unknown' as unknown as NamingStrategy,
      );
      expect(result).toBe('tool_name_server1');
    });
  });

  describe('parsePublicName', () => {
    it('should parse namespace strategy names (suffix)', () => {
      const result = parsePublicName('tool_name_server1', 'namespace');
      expect(result).toEqual({
        originalName: 'tool_name',
        serverId: 'server1',
      });
    });

    it('should parse alias strategy names (prefix)', () => {
      const result = parsePublicName('server1_tool_name', 'alias');
      expect(result).toEqual({
        serverId: 'server1',
        originalName: 'tool_name',
      });
    });

    it('should return null for error strategy', () => {
      const result = parsePublicName('tool_name', 'error');
      expect(result).toBeNull();
    });

    it('should parse with custom separator', () => {
      const result = parsePublicName('tool_name__server1', 'namespace', '__');
      expect(result).toEqual({
        originalName: 'tool_name',
        serverId: 'server1',
      });
    });

    it('should handle names with multiple separators correctly', () => {
      const result = parsePublicName(
        'tool_name_with_underscore_server1',
        'namespace',
      );
      expect(result).toEqual({
        originalName: 'tool_name_with_underscore',
        serverId: 'server1',
      });
    });

    it('should handle prefix with multiple separators', () => {
      const result = parsePublicName(
        'server1_tool_name_with_underscore',
        'alias',
      );
      expect(result).toEqual({
        serverId: 'server1',
        originalName: 'tool_name_with_underscore',
      });
    });

    it('should return null for names without separator', () => {
      const result = parsePublicName('toolname', 'namespace');
      expect(result).toBeNull();
    });

    it('should return null for unknown strategy', () => {
      const result = parsePublicName(
        'tool_name_server1',
        'unknown' as unknown as NamingStrategy,
      );
      expect(result).toBeNull();
    });

    it('should handle URIs with namespace strategy', () => {
      const result = parsePublicName(
        'file://path/to/file_server1',
        'namespace',
      );
      expect(result).toEqual({
        originalName: 'file://path/to/file',
        serverId: 'server1',
      });
    });
  });

  describe('createNamingFunction', () => {
    it('should create a function with namespace strategy', () => {
      const namingFn = createNamingFunction({
        strategy: 'namespace',
      });

      const result = namingFn('server1', 'tool_name');
      expect(result).toBe('tool_name_server1');
    });

    it('should create a function with alias strategy', () => {
      const namingFn = createNamingFunction({
        strategy: 'alias',
      });

      const result = namingFn('server1', 'tool_name');
      expect(result).toBe('server1_tool_name');
    });

    it('should create a function with custom separator', () => {
      const namingFn = createNamingFunction({
        strategy: 'namespace',
        separator: '--',
      });

      const result = namingFn('server1', 'tool_name');
      expect(result).toBe('tool_name--server1');
    });

    it('should use default separator when not specified', () => {
      const namingFn = createNamingFunction({
        strategy: 'namespace',
      });

      const result = namingFn('server1', 'tool_name');
      expect(result).toBe('tool_name_server1');
    });
  });

  describe('createParsingFunction', () => {
    it('should create a function with namespace strategy', () => {
      const parseFn = createParsingFunction({
        strategy: 'namespace',
      });

      const result = parseFn('tool_name_server1');
      expect(result).toEqual({
        originalName: 'tool_name',
        serverId: 'server1',
      });
    });

    it('should create a function with alias strategy', () => {
      const parseFn = createParsingFunction({
        strategy: 'alias',
      });

      const result = parseFn('server1_tool_name');
      expect(result).toEqual({
        serverId: 'server1',
        originalName: 'tool_name',
      });
    });

    it('should create a function with custom separator', () => {
      const parseFn = createParsingFunction({
        strategy: 'namespace',
        separator: '--',
      });

      const result = parseFn('tool_name--server1');
      expect(result).toEqual({
        originalName: 'tool_name',
        serverId: 'server1',
      });
    });

    it('should return null for invalid input', () => {
      const parseFn = createParsingFunction({
        strategy: 'namespace',
      });

      const result = parseFn('invalid');
      expect(result).toBeNull();
    });
  });

  describe('round-trip tests', () => {
    it('should correctly round-trip with namespace strategy', () => {
      const serverId = 'myserver';
      const originalName = 'complex_tool_name';
      const strategy = 'namespace' as const;

      const publicName = generatePublicName(serverId, originalName, strategy);
      const parsed = parsePublicName(publicName, strategy);

      expect(parsed).toEqual({
        originalName,
        serverId,
      });
    });

    it('should correctly round-trip with alias strategy', () => {
      const serverId = 'myserver';
      const originalName = 'complex_tool_name';
      const strategy = 'alias' as const;

      const publicName = generatePublicName(serverId, originalName, strategy);
      const parsed = parsePublicName(publicName, strategy);

      expect(parsed).toEqual({
        originalName,
        serverId,
      });
    });

    it('should correctly round-trip with custom separator', () => {
      const serverId = 'myserver';
      const originalName = 'complex_tool_name';
      const strategy = 'namespace' as const;
      const separator = '::';

      const publicName = generatePublicName(
        serverId,
        originalName,
        strategy,
        separator,
      );
      const parsed = parsePublicName(publicName, strategy, separator);

      expect(parsed).toEqual({
        originalName,
        serverId,
      });
    });

    it('should handle edge case with empty server ID', () => {
      const publicName = generatePublicName('', 'tool_name', 'namespace');
      expect(publicName).toBe('tool_name_');

      const parsed = parsePublicName(publicName, 'namespace');
      expect(parsed).toEqual({
        originalName: 'tool_name',
        serverId: '',
      });
    });

    it('should handle edge case with empty tool name', () => {
      const publicName = generatePublicName('server1', '', 'alias');
      expect(publicName).toBe('server1_');

      const parsed = parsePublicName(publicName, 'alias');
      expect(parsed).toEqual({
        serverId: 'server1',
        originalName: '',
      });
    });
  });
});
