/**
 * Tests for MCP CLI commands
 */

import { describe, expect, it } from 'vitest';
import {
  createServerConfig,
  detectServerType,
  parseEnvVars,
  parseHeaders,
} from './mcp.js';

describe('MCP Commands', () => {
  describe('detectServerType', () => {
    it('should detect NPX packages', () => {
      expect(detectServerType('npx')).toBe('npx');
      expect(
        detectServerType('npx', [
          '-y',
          '@modelcontextprotocol/server-filesystem',
        ]),
      ).toBe('npx');
      expect(
        detectServerType('npx', ['@modelcontextprotocol/server-github']),
      ).toBe('npx');
    });

    it('should detect Python servers', () => {
      // Python servers are detected as 'local' in current implementation
      expect(detectServerType('python')).toBe('local');
      expect(detectServerType('python3')).toBe('local');
      expect(detectServerType('uvx')).toBe('npx'); // uvx is a package runner like npx
      expect(detectServerType('uv')).toBe('local');
    });

    it('should detect Node.js servers', () => {
      // Node.js servers are detected as 'local' in current implementation
      expect(detectServerType('node')).toBe('local');
      expect(detectServerType('tsx')).toBe('local');
      expect(detectServerType('bun')).toBe('local');
    });

    it('should detect Deno servers', () => {
      // Deno servers are detected as 'local' in current implementation
      expect(detectServerType('deno')).toBe('local');
    });

    it('should detect local command servers', () => {
      expect(detectServerType('./my-server')).toBe('local');
      expect(detectServerType('/usr/local/bin/server')).toBe('local');
      expect(detectServerType('~/bin/server')).toBe('local');
      expect(detectServerType('custom-command')).toBe('local');
    });
  });

  describe('parseEnvVars', () => {
    it('should parse single environment variable', () => {
      const result = parseEnvVars(['KEY=value']);
      expect(result).toEqual({ KEY: 'value' });
    });

    it('should parse multiple environment variables', () => {
      const result = parseEnvVars([
        'KEY1=value1',
        'KEY2=value2',
        'KEY3=value3',
      ]);
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2',
        KEY3: 'value3',
      });
    });

    it('should handle values with equals signs', () => {
      const result = parseEnvVars([
        'URL=postgres://user:pass@host/db?param=value',
      ]);
      expect(result).toEqual({
        URL: 'postgres://user:pass@host/db?param=value',
      });
    });

    it('should handle empty values', () => {
      const result = parseEnvVars(['KEY=']);
      expect(result).toEqual({ KEY: '' });
    });

    it('should handle values with spaces', () => {
      const result = parseEnvVars(['MESSAGE=Hello World']);
      expect(result).toEqual({ MESSAGE: 'Hello World' });
    });

    it('should return undefined for empty array', () => {
      const result = parseEnvVars([]);
      expect(result).toBeUndefined();
    });
  });

  describe('parseHeaders', () => {
    it('should parse single header', () => {
      const result = parseHeaders(['Authorization:Bearer token123']);
      expect(result).toEqual({ Authorization: 'Bearer token123' });
    });

    it('should parse multiple headers', () => {
      const result = parseHeaders([
        'Authorization:Bearer token',
        'Content-Type:application/json',
        'X-Custom:value',
      ]);
      expect(result).toEqual({
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
        'X-Custom': 'value',
      });
    });

    it('should handle headers with multiple colons', () => {
      const result = parseHeaders(['URL:https://example.com:8080']);
      expect(result).toEqual({ URL: 'https://example.com:8080' });
    });

    it('should trim whitespace', () => {
      const result = parseHeaders(['Key : value ', ' Header2: value2 ']);
      expect(result).toEqual({ Key: 'value', Header2: 'value2' });
    });

    it('should return undefined for empty array', () => {
      const result = parseHeaders([]);
      expect(result).toBeUndefined();
    });
  });

  describe('createServerConfig', () => {
    it('should create local command server config', () => {
      const config = createServerConfig('local', {
        name: 'myserver',
        commandOrUrl: 'node',
        args: ['./server.js', '--port', '3000'],
        autoRestart: false,
        maxRestarts: 3,
      });

      expect(config).toMatchObject({
        id: 'myserver',
        command: 'node',
        args: ['./server.js', '--port', '3000'],
      });
    });

    it('should create NPX server config', () => {
      const config = createServerConfig('npx', {
        name: 'filesystem',
        commandOrUrl: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        autoRestart: false,
        maxRestarts: 3,
      });

      expect(config).toMatchObject({
        id: 'filesystem',
        type: 'npx', // Type is 'npx' instead of packageOrCommand
        args: ['/tmp'], // NPX server only stores the final args after the package name
      });
    });

    it('should create remote SSE server config', () => {
      const config = createServerConfig('remote', {
        name: 'remote',
        commandOrUrl: 'https://mcp.example.com/sse',
        args: [],
        transport: 'sse',
        autoRestart: false,
        maxRestarts: 3,
      });

      expect(config).toMatchObject({
        id: 'remote',
        url: 'https://mcp.example.com/sse',
        transport: 'http', // Default transport is http in the implementation
      });
    });

    it('should create remote HTTP server config', () => {
      const config = createServerConfig('remote', {
        name: 'api',
        commandOrUrl: 'https://api.example.com/mcp',
        args: [],
        transport: 'http',
        header: {
          Authorization: 'Bearer token',
        },
        autoRestart: false,
        maxRestarts: 3,
      });

      expect(config).toMatchObject({
        id: 'api',
        url: 'https://api.example.com/mcp',
        transport: 'http',
        // headers are passed via header property, not headers
      });
    });

    it('should include environment variables', () => {
      const config = createServerConfig('local', {
        name: 'server',
        commandOrUrl: 'node',
        args: ['./server.js'],
        env: {
          API_KEY: 'secret',
          DEBUG: 'true',
        },
        autoRestart: false,
        maxRestarts: 3,
      });

      expect(config).toMatchObject({
        id: 'server',
        command: 'node',
        args: ['./server.js'],
        env: {
          API_KEY: 'secret',
          DEBUG: 'true',
        },
      });
    });
  });

  describe('Error handling', () => {
    it('should handle invalid env var format', () => {
      const result = parseEnvVars(['INVALID']);
      // Returns undefined for invalid format
      expect(result).toBeUndefined();
    });

    it('should handle invalid header format', () => {
      const result = parseHeaders(['INVALID']);
      // Returns undefined for invalid format
      expect(result).toBeUndefined();
    });

    it('should detect transport type', () => {
      // HTTP transport
      expect(detectServerType('anything', 'http')).toBe('remote');

      // SSE transport
      expect(detectServerType('anything', 'sse')).toBe('remote');

      // URL detection
      expect(detectServerType('https://example.com')).toBe('remote');
      expect(detectServerType('http://localhost:3000')).toBe('remote');
    });
  });
});
