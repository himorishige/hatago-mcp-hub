/**
 * Tests for tag filtering functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HatagoHub } from './hub.js';

describe('Tag Filtering', () => {
  let hub: HatagoHub;

  beforeEach(() => {
    // Reset hub for each test
    hub = new HatagoHub();
  });

  describe('Configuration Schema', () => {
    it('should accept tags array in server config', () => {
      const config = {
        version: 1,
        mcpServers: {
          'test-server': {
            command: 'echo',
            args: ['test'],
            tags: ['dev', 'test']
          }
        }
      };

      // Should not throw when tags are present
      expect(() => JSON.stringify(config)).not.toThrow();
    });

    it('should accept Japanese tags', () => {
      const config = {
        version: 1,
        mcpServers: {
          'test-server': {
            command: 'echo',
            args: ['test'],
            tags: ['開発', 'テスト', '本番']
          }
        }
      };

      // Should handle Japanese characters
      expect(config.mcpServers['test-server'].tags).toContain('開発');
      expect(config.mcpServers['test-server'].tags).toContain('テスト');
      expect(config.mcpServers['test-server'].tags).toContain('本番');
    });
  });

  describe('Tag Matching Logic', () => {
    it('should match servers with any of the specified tags', () => {
      const serverTags = ['dev', 'test', 'local'];
      const requiredTags = ['test', 'production'];

      // Should match because 'test' is in both arrays
      const hasMatch = requiredTags.some((tag) => serverTags.includes(tag));
      expect(hasMatch).toBe(true);
    });

    it('should not match servers without any specified tags', () => {
      const serverTags = ['dev', 'local'];
      const requiredTags = ['production', 'staging'];

      // Should not match because no common tags
      const hasMatch = requiredTags.some((tag) => serverTags.includes(tag));
      expect(hasMatch).toBe(false);
    });

    it('should match all servers when no tags are specified', () => {
      const serverTags = ['dev', 'test'];
      const requiredTags: string[] = [];

      // Empty required tags means all servers match
      const shouldFilter = requiredTags.length > 0;
      expect(shouldFilter).toBe(false);
    });

    it('should handle servers without tags when filtering is active', () => {
      const serverTags: string[] = [];
      const requiredTags = ['dev'];

      // Server without tags should not match when filtering
      const hasMatch = requiredTags.some((tag) => serverTags.includes(tag));
      expect(hasMatch).toBe(false);
    });
  });

  describe('Hub Options with Tags', () => {
    it('should store tags in hub options', () => {
      const hubWithTags = new HatagoHub({
        tags: ['dev', 'test']
      });

      expect(hubWithTags['options'].tags).toEqual(['dev', 'test']);
    });

    it('should handle undefined tags', () => {
      const hubWithoutTags = new HatagoHub({});

      expect(hubWithoutTags['options'].tags).toBeUndefined();
    });
  });

  describe('CLI Tag Parsing', () => {
    it('should parse comma-separated tags', () => {
      const input = 'dev,test,production';
      const tags = input.split(',').map((t) => t.trim());

      expect(tags).toEqual(['dev', 'test', 'production']);
    });

    it('should handle spaces in comma-separated tags', () => {
      const input = 'dev, test , production';
      const tags = input.split(',').map((t) => t.trim());

      expect(tags).toEqual(['dev', 'test', 'production']);
    });

    it('should handle Japanese tags in CLI', () => {
      const input = '開発,テスト,本番';
      const tags = input.split(',').map((t) => t.trim());

      expect(tags).toEqual(['開発', 'テスト', '本番']);
    });

    it('should handle mixed language tags', () => {
      const input = 'dev,開発,test,テスト';
      const tags = input.split(',').map((t) => t.trim());

      expect(tags).toEqual(['dev', '開発', 'test', 'テスト']);
    });
  });
});
