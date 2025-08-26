import { describe, expect, it } from 'vitest';
import {
  convertMcpServersToInternal,
  convertMcpServerToInternal,
  mergeConfigWithMcpServers,
} from './mcp-converter.js';
import type { McpServerConfig } from './types.js';

describe('MCP Converter', () => {
  describe('convertMcpServerToInternal', () => {
    it('should convert local server config', () => {
      const mcpConfig: McpServerConfig = {
        command: 'node',
        args: ['server.js', '--port', '3000'],
        env: { NODE_ENV: 'production' },
      };

      const result = convertMcpServerToInternal('test-local', mcpConfig);

      expect(result).toEqual({
        id: 'test-local',
        type: 'local',
        command: 'node',
        args: ['server.js', '--port', '3000'],
        env: { NODE_ENV: 'production' },
        transport: 'stdio',
        start: 'lazy',
      });
    });

    it('should convert npx server config', () => {
      const mcpConfig: McpServerConfig = {
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', '/tmp'],
      };

      const result = convertMcpServerToInternal('test-npx', mcpConfig);

      expect(result).toEqual({
        id: 'test-npx',
        type: 'npx',
        package: '@modelcontextprotocol/server-filesystem',
        args: ['/tmp'],
        transport: 'stdio',
        start: 'lazy',
        env: undefined,
      });
    });

    it('should convert remote server config', () => {
      const mcpConfig: McpServerConfig = {
        url: 'https://api.example.com/mcp',
        hatagoOptions: {
          auth: {
            type: 'bearer',
            token: 'secret-token',
          },
        },
      };

      const result = convertMcpServerToInternal('test-remote', mcpConfig);

      expect(result).toEqual({
        id: 'test-remote',
        type: 'remote',
        url: 'https://api.example.com/mcp',
        transport: 'http',
        start: 'lazy',
        env: undefined,
        auth: {
          type: 'bearer',
          token: 'secret-token',
        },
      });
    });

    it('should apply hatago options', () => {
      const mcpConfig: McpServerConfig = {
        command: 'node',
        args: ['server.js'],
        hatagoOptions: {
          start: 'eager',
          tools: {
            exclude: ['dangerous_tool'],
            prefix: 'test',
          },
        },
      };

      const result = convertMcpServerToInternal('test-options', mcpConfig);

      expect(result).toEqual({
        id: 'test-options',
        type: 'local',
        command: 'node',
        args: ['server.js'],
        transport: 'stdio',
        start: 'eager',
        tools: {
          exclude: ['dangerous_tool'],
          prefix: 'test',
        },
        env: undefined,
      });
    });

    it('should convert SSE server config', () => {
      const mcpConfig: McpServerConfig = {
        type: 'sse',
        url: 'https://sse.example.com/events',
        headers: {
          Authorization: 'Bearer my-token',
        },
      };

      const result = convertMcpServerToInternal('test-sse', mcpConfig);

      expect(result).toEqual({
        id: 'test-sse',
        type: 'remote',
        url: 'https://sse.example.com/events',
        transport: 'sse',
        start: 'lazy',
        env: undefined,
        auth: {
          type: 'bearer',
          token: 'my-token',
        },
      });
    });

    it('should convert HTTP server config', () => {
      const mcpConfig: McpServerConfig = {
        type: 'http',
        url: 'https://api.example.com/mcp',
        headers: {
          Authorization: 'Basic dXNlcjpwYXNz',
        },
      };

      const result = convertMcpServerToInternal('test-http', mcpConfig);

      expect(result).toEqual({
        id: 'test-http',
        type: 'remote',
        url: 'https://api.example.com/mcp',
        transport: 'http',
        start: 'lazy',
        env: undefined,
        auth: {
          type: 'basic',
          token: 'dXNlcjpwYXNz',
        },
      });
    });
  });

  describe('convertMcpServersToInternal', () => {
    it('should convert multiple servers', () => {
      const mcpServers = {
        local: {
          command: 'node',
          args: ['local.js'],
        },
        npx: {
          command: 'npx',
          args: ['some-package'],
        },
        remote: {
          url: 'https://example.com',
        },
      };

      const result = convertMcpServersToInternal(mcpServers);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('local');
      expect(result[0].type).toBe('local');
      expect(result[1].id).toBe('npx');
      expect(result[1].type).toBe('npx');
      expect(result[2].id).toBe('remote');
      expect(result[2].type).toBe('remote');
    });

    it('should throw error for invalid config', () => {
      const mcpServers = {
        invalid: {
          // Missing both command and url
        },
      };

      expect(() => convertMcpServersToInternal(mcpServers)).toThrow(
        "Convert mcpServer 'invalid' failed",
      );
    });
  });

  describe('mergeConfigWithMcpServers', () => {
    it('should merge mcpServers with existing servers', () => {
      const config = {
        version: 1,
        mcpServers: {
          mcp1: {
            command: 'node',
            args: ['mcp1.js'],
          },
        },
        servers: [
          {
            id: 'existing',
            type: 'local' as const,
            command: 'python',
            args: ['existing.py'],
          },
        ],
      };

      const result = mergeConfigWithMcpServers(config);

      expect(result.servers).toHaveLength(2);
      expect(result.servers[0].id).toBe('mcp1');
      expect(result.servers[1].id).toBe('existing');
    });

    it('should detect duplicate server IDs', () => {
      const config = {
        mcpServers: {
          duplicate: {
            command: 'node',
            args: ['dup1.js'],
          },
        },
        servers: [
          {
            id: 'duplicate',
            type: 'local' as const,
            command: 'python',
            args: ['dup2.py'],
          },
        ],
      };

      expect(() => mergeConfigWithMcpServers(config)).toThrow(
        'Duplicate server ID: duplicate',
      );
    });

    it('should return config unchanged if no mcpServers', () => {
      const config = {
        version: 1,
        servers: [
          {
            id: 'test',
            type: 'local' as const,
            command: 'node',
            args: ['test.js'],
          },
        ],
      };

      const result = mergeConfigWithMcpServers(config);

      expect(result).toEqual(config);
    });
  });
});
