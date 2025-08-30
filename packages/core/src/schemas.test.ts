/**
 * Tests for Configuration Schemas
 * Claude Code compatible format tests
 */

import { describe, expect, it } from 'vitest';
import {
  getServerTransportType,
  isHttpServer,
  isSseServer,
  isStdioServer,
  safeParseConfig,
  ServerConfigSchema,
  HatagoConfigSchema,
} from './schemas.js';

describe('ServerConfigSchema', () => {
  describe('STDIO Server (Claude Code Compatible)', () => {
    it('should parse STDIO server without type field', () => {
      const config = {
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'production' },
        cwd: '/app',
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(config);
      }
    });

    it('should parse minimal STDIO server', () => {
      const config = {
        command: 'npx',
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.command).toBe('npx');
        expect(result.data.args).toEqual([]);
      }
    });

    it('should parse Claude Code filesystem example', () => {
      const config = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(config);
      }
    });
  });

  describe('HTTP Server (Claude Code Compatible)', () => {
    it('should parse HTTP server without type field', () => {
      const config = {
        url: 'https://api.example.com/mcp',
        headers: {
          Authorization: 'Bearer token',
        },
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(config);
      }
    });

    it('should parse HTTP server with optional type field', () => {
      const config = {
        type: 'http' as const,
        url: 'https://api.example.com/mcp',
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(config);
      }
    });

    it('should parse minimal HTTP server', () => {
      const config = {
        url: 'http://localhost:3000',
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe('http://localhost:3000');
      }
    });
  });

  describe('SSE Server (Claude Code Compatible)', () => {
    it('should parse SSE server with required type field', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://api.github.com/mcp/sse',
        headers: {
          Authorization: 'Bearer ${GITHUB_TOKEN}',
        },
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject(config);
        expect(result.data.type).toBe('sse');
      }
    });

    it('should fail SSE server without type field', () => {
      const config = {
        url: 'https://api.github.com/mcp/sse',
        headers: {
          Authorization: 'Bearer ${GITHUB_TOKEN}',
        },
      };

      const result = ServerConfigSchema.safeParse(config);
      // This should parse as HTTP server, not SSE
      expect(result.success).toBe(true);
      if (result.success) {
        expect('type' in result.data && result.data.type).not.toBe('sse');
      }
    });

    it('should parse minimal SSE server', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://example.com/sse',
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('sse');
        expect(result.data.url).toBe('https://example.com/sse');
      }
    });
  });

  describe('Invalid Configurations', () => {
    it('should reject server without command or url', () => {
      const config = {
        headers: { 'X-Custom': 'value' },
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject server with both command and url', () => {
      const config = {
        command: 'node',
        url: 'https://example.com',
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid URL', () => {
      const config = {
        url: 'not-a-valid-url',
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject wrong type value', () => {
      const config = {
        type: 'websocket' as any,
        url: 'wss://example.com',
      };

      const result = ServerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});

describe('Transport Type Detection', () => {
  describe('getServerTransportType', () => {
    it('should detect STDIO transport', () => {
      const config = {
        command: 'node',
        args: ['server.js'],
      };

      const result = ServerConfigSchema.parse(config);
      expect(getServerTransportType(result)).toBe('stdio');
    });

    it('should detect HTTP transport without type', () => {
      const config = {
        url: 'https://api.example.com',
      };

      const result = ServerConfigSchema.parse(config);
      expect(getServerTransportType(result)).toBe('streamable-http');
    });

    it('should detect HTTP transport with type', () => {
      const config = {
        type: 'http' as const,
        url: 'https://api.example.com',
      };

      const result = ServerConfigSchema.parse(config);
      expect(getServerTransportType(result)).toBe('streamable-http');
    });

    it('should detect SSE transport', () => {
      const config = {
        type: 'sse' as const,
        url: 'https://api.github.com/mcp/sse',
      };

      const result = ServerConfigSchema.parse(config);
      expect(getServerTransportType(result)).toBe('sse');
    });
  });

  describe('Type Guards', () => {
    it('should identify STDIO server', () => {
      const config = ServerConfigSchema.parse({
        command: 'node',
      });

      expect(isStdioServer(config)).toBe(true);
      expect(isHttpServer(config)).toBe(false);
      expect(isSseServer(config)).toBe(false);
    });

    it('should identify HTTP server without type', () => {
      const config = ServerConfigSchema.parse({
        url: 'https://example.com',
      });

      expect(isStdioServer(config)).toBe(false);
      expect(isHttpServer(config)).toBe(true);
      expect(isSseServer(config)).toBe(false);
    });

    it('should identify HTTP server with type', () => {
      const config = ServerConfigSchema.parse({
        type: 'http' as const,
        url: 'https://example.com',
      });

      expect(isStdioServer(config)).toBe(false);
      expect(isHttpServer(config)).toBe(true);
      expect(isSseServer(config)).toBe(false);
    });

    it('should identify SSE server', () => {
      const config = ServerConfigSchema.parse({
        type: 'sse' as const,
        url: 'https://example.com/sse',
      });

      expect(isStdioServer(config)).toBe(false);
      expect(isHttpServer(config)).toBe(false);
      expect(isSseServer(config)).toBe(true);
    });
  });
});

describe('HatagoConfigSchema', () => {
  it('should parse Claude Code compatible configuration', () => {
    const config = {
      version: 1,
      logLevel: 'info',
      http: {
        port: 3535,
        host: 'localhost',
      },
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        },
        'github-sse': {
          type: 'sse' as const,
          url: 'https://api.github.com/mcp/sse',
          headers: {
            Authorization: 'Bearer ${GITHUB_TOKEN}',
          },
        },
        'openai-api': {
          url: 'https://api.openai.com/mcp',
          headers: {
            Authorization: 'Bearer ${OPENAI_API_KEY}',
          },
        },
      },
    };

    const result = safeParseConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mcpServers).toHaveProperty('filesystem');
      expect(result.data.mcpServers).toHaveProperty('github-sse');
      expect(result.data.mcpServers).toHaveProperty('openai-api');
    }
  });

  it('should parse minimal configuration', () => {
    const config = {
      mcpServers: {},
    };

    const result = safeParseConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.logLevel).toBe('info');
      expect(result.data.mcpServers).toEqual({});
    }
  });

  it('should parse configuration with mixed server types', () => {
    const config = {
      mcpServers: {
        local: {
          command: 'node',
          args: ['./server.js'],
        },
        remote: {
          url: 'https://api.example.com/mcp',
        },
        sse: {
          type: 'sse' as const,
          url: 'https://stream.example.com/sse',
        },
      },
    };

    const result = safeParseConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      const servers = result.data.mcpServers;
      expect(getServerTransportType(servers.local)).toBe('stdio');
      expect(getServerTransportType(servers.remote)).toBe('streamable-http');
      expect(getServerTransportType(servers.sse)).toBe('sse');
    }
  });

  it('should handle disabled servers', () => {
    const config = {
      mcpServers: {
        disabled: {
          command: 'node',
          args: ['./server.js'],
          disabled: true,
        },
        enabled: {
          command: 'python',
          args: ['./server.py'],
          disabled: false,
        },
      },
    };

    const result = safeParseConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mcpServers.disabled.disabled).toBe(true);
      expect(result.data.mcpServers.enabled.disabled).toBe(false);
    }
  });

  it('should handle server timeouts', () => {
    const config = {
      mcpServers: {
        'with-timeouts': {
          command: 'node',
          args: ['./server.js'],
          timeouts: {
            connectMs: 10000,
            requestMs: 60000,
            keepAliveMs: 30000,
          },
        },
      },
    };

    const result = safeParseConfig(config);
    expect(result.success).toBe(true);
    if (result.success) {
      const server = result.data.mcpServers['with-timeouts'];
      expect(server.timeouts?.connectMs).toBe(10000);
      expect(server.timeouts?.requestMs).toBe(60000);
      expect(server.timeouts?.keepAliveMs).toBe(30000);
    }
  });
});
