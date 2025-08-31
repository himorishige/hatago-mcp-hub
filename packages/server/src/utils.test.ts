/**
 * Tests for Utility Functions
 */

import { describe, expect, it } from 'vitest';
import { generateDefaultConfig, parseArgs } from './utils.js';

describe('parseArgs', () => {
  describe('Commands', () => {
    it('should parse command when first argument is not a flag', () => {
      const result = parseArgs(['serve', '--port', '3000']);

      expect(result.command).toBe('serve');
      expect(result.flags.port).toBe('3000');
      expect(result.positional).toEqual([]);
    });

    it('should not parse command when first argument is a flag', () => {
      const result = parseArgs(['--port', '3000', 'serve']);

      expect(result.command).toBeUndefined();
      expect(result.flags.port).toBe('3000');
      expect(result.positional).toEqual(['serve']);
    });

    it('should handle no arguments', () => {
      const result = parseArgs([]);

      expect(result.command).toBeUndefined();
      expect(result.flags).toEqual({});
      expect(result.positional).toEqual([]);
    });

    it('should handle command only', () => {
      const result = parseArgs(['serve']);

      expect(result.command).toBe('serve');
      expect(result.flags).toEqual({});
      expect(result.positional).toEqual([]);
    });
  });

  describe('Flags', () => {
    it('should parse string flags', () => {
      const result = parseArgs(['--config', 'hatago.json', '--port', '8080']);

      expect(result.flags.config).toBe('hatago.json');
      expect(result.flags.port).toBe('8080');
    });

    it('should parse boolean flags', () => {
      const result = parseArgs(['--verbose', '--debug']);

      expect(result.flags.verbose).toBe(true);
      expect(result.flags.debug).toBe(true);
    });

    it('should handle mixed flags', () => {
      const result = parseArgs(['--config', 'file.json', '--verbose', '--port', '3000']);

      expect(result.flags.config).toBe('file.json');
      expect(result.flags.verbose).toBe(true);
      expect(result.flags.port).toBe('3000');
    });

    it('should treat flag followed by another flag as boolean', () => {
      const result = parseArgs(['--first', '--second', 'value']);

      expect(result.flags.first).toBe(true);
      expect(result.flags.second).toBe('value');
    });

    it('should handle flags with equals sign in name', () => {
      const result = parseArgs(['--key=value']);

      // This parses as flag name "key=value" with boolean true
      expect(result.flags['key=value']).toBe(true);
    });
  });

  describe('Positional Arguments', () => {
    it('should collect positional arguments after command', () => {
      const result = parseArgs(['serve', 'file1', 'file2']);

      expect(result.command).toBe('serve');
      expect(result.positional).toEqual(['file1', 'file2']);
    });

    it('should collect positional arguments mixed with flags', () => {
      const result = parseArgs(['serve', '--port', '3000', 'file1', '--verbose', 'file2']);

      expect(result.command).toBe('serve');
      expect(result.flags.port).toBe('3000');
      expect(result.flags.verbose).toBe('file2'); // --verbose takes 'file2' as its value
      expect(result.positional).toEqual(['file1']);
    });

    it('should handle all positional arguments when no command', () => {
      const result = parseArgs(['file1', 'file2', 'file3']);

      expect(result.command).toBe('file1');
      expect(result.positional).toEqual(['file2', 'file3']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const result = parseArgs(['--key', '', '--flag']);

      // Empty string is falsy, so --key becomes boolean and '' becomes positional
      expect(result.flags.key).toBe(true);
      expect(result.flags.flag).toBe(true);
      expect(result.positional).toEqual(['']);
    });

    it('should handle special characters in values', () => {
      const result = parseArgs(['--path', '/path/with spaces/file.txt', '--regex', '.*\\.js$']);

      expect(result.flags.path).toBe('/path/with spaces/file.txt');
      expect(result.flags.regex).toBe('.*\\.js$');
    });

    it('should handle numeric values as strings', () => {
      const result = parseArgs(['--port', '3000', '--timeout', '30']);

      expect(result.flags.port).toBe('3000');
      expect(result.flags.timeout).toBe('30');
      expect(typeof result.flags.port).toBe('string');
    });

    it('should handle last flag without value', () => {
      const result = parseArgs(['--config', 'file.json', '--verbose']);

      expect(result.flags.config).toBe('file.json');
      expect(result.flags.verbose).toBe(true);
    });

    it('should handle double dash only', () => {
      const result = parseArgs(['--']);

      expect(result.flags['']).toBe(true);
    });
  });
});

describe('generateDefaultConfig', () => {
  it('should generate valid JSON', () => {
    const config = generateDefaultConfig();

    // Should not throw
    const parsed = JSON.parse(config);
    expect(parsed).toBeDefined();
  });

  it('should include schema reference', () => {
    const config = generateDefaultConfig();
    const parsed = JSON.parse(config);

    expect(parsed.$schema).toBe('../../../schemas/config.schema.json');
  });

  it('should include version', () => {
    const config = generateDefaultConfig();
    const parsed = JSON.parse(config);

    expect(parsed.version).toBe(1);
  });

  it('should include example MCP server', () => {
    const config = generateDefaultConfig();
    const parsed = JSON.parse(config);

    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.deepwiki).toBeDefined();
    expect(parsed.mcpServers.deepwiki.url).toBe('https://mcp.deepwiki.com/mcp');
    expect(parsed.mcpServers.deepwiki.transport).toBe('streamable-http');
  });

  it('should format with proper indentation', () => {
    const config = generateDefaultConfig();

    // Check for 2-space indentation
    expect(config).toContain('  ');
    expect(config).not.toContain('\t');

    // Check for proper newlines
    const lines = config.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('should generate consistent output', () => {
    const config1 = generateDefaultConfig();
    const config2 = generateDefaultConfig();

    expect(config1).toBe(config2);
  });
});
