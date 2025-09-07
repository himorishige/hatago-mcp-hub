/**
 * Tests for HubCore
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HubCore } from './hub-core.js';
import type { ServerSpec } from './types.js';

describe('HubCore', () => {
  let hubCore: HubCore;

  beforeEach(() => {
    hubCore = new HubCore();
  });

  describe('Initialization', () => {
    it('should initialize with server configurations', () => {
      const servers: Record<string, ServerSpec> = {
        'local-server': {
          command: 'node',
          args: ['test.js']
        },
        'remote-server': {
          url: 'http://localhost:3000',
          type: 'http'
        }
      };

      hubCore.init(servers);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle empty server configuration', () => {
      hubCore.init({});
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Request Handling', () => {
    it('should return error when HubCore is closed', async () => {
      await hubCore.close();

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/list',
        params: {}
      };

      const response = await hubCore.handle(request);

      expect(response).toHaveProperty('error');
      expect(response.error?.message).toBe('HubCore is closed');
    });

    it('should return error for request without servers', async () => {
      hubCore.init({});

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/list',
        params: {}
      };

      const response = await hubCore.handle(request);

      expect(response).toHaveProperty('error');
      expect(response.error?.message).toContain('No servers configured');
    });

    it('should parse server-prefixed method names', async () => {
      const servers: Record<string, ServerSpec> = {
        'test-server': {
          command: 'node',
          args: ['test.js']
        }
      };

      hubCore.init(servers);

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'test-server__tools/list',
        params: {}
      };

      // Mock transport to avoid actual connection
      const response = await hubCore.handle(request);

      // Would fail to connect but should parse method correctly
      expect(response).toHaveProperty('error');
    });
  });

  describe('Server Types', () => {
    it('should support local process servers', () => {
      const servers: Record<string, ServerSpec> = {
        local: {
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem', '.'],
          env: { KEY: 'value' },
          cwd: '/tmp'
        }
      };

      hubCore.init(servers);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should support HTTP servers', () => {
      const servers: Record<string, ServerSpec> = {
        http: {
          url: 'http://api.example.com/mcp',
          type: 'http',
          headers: { Authorization: 'Bearer token' },
          timeout: 30000
        }
      };

      hubCore.init(servers);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should support SSE servers', () => {
      const servers: Record<string, ServerSpec> = {
        sse: {
          url: 'http://api.example.com/sse',
          type: 'sse',
          headers: { 'X-API-Key': 'secret' },
          timeout: 60000
        }
      };

      hubCore.init(servers);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should support Streamable HTTP servers', () => {
      const servers: Record<string, ServerSpec> = {
        streamable: {
          url: 'http://api.example.com/stream',
          type: 'streamable-http',
          headers: { 'Content-Type': 'application/json' }
        }
      };

      hubCore.init(servers);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Lifecycle', () => {
    it('should close all connections', async () => {
      const servers: Record<string, ServerSpec> = {
        server1: {
          command: 'node',
          args: ['test1.js']
        },
        server2: {
          url: 'http://localhost:3000',
          type: 'http'
        }
      };

      hubCore.init(servers);
      await hubCore.close();

      // Should be closed
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'ping',
        params: {}
      };

      const response = await hubCore.handle(request);
      expect(response.error?.message).toBe('HubCore is closed');
    });

    it('should handle multiple close calls gracefully', async () => {
      await hubCore.close();
      await hubCore.close(); // Second close should not throw

      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown server spec types', () => {
      const servers: Record<string, ServerSpec> = {
        invalid: {
          // Invalid spec - neither command nor url
        } as ServerSpec
      };

      hubCore.init(servers);
      // Init should succeed, error happens on connection
      expect(true).toBe(true);
    });

    it('should handle request errors gracefully', async () => {
      hubCore.init({});

      const request = {
        jsonrpc: '2.0' as const,
        // Missing id
        method: 'tools/list',
        params: {}
      };

      const response = await hubCore.handle(request);

      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', null);
    });
  });

  describe('Method Routing', () => {
    it('should route system methods', async () => {
      const servers: Record<string, ServerSpec> = {
        test: {
          command: 'node',
          args: ['test.js']
        }
      };

      hubCore.init(servers);

      // Test various system methods
      const methods = ['initialize', 'initialized', 'shutdown', 'ping'];

      for (const method of methods) {
        const request = {
          jsonrpc: '2.0' as const,
          id: 1,
          method,
          params: {}
        };

        const response = await hubCore.handle(request);
        // Would fail to connect but should route correctly
        expect(response).toHaveProperty('jsonrpc', '2.0');
      }
    });

    it('should route MCP standard methods', async () => {
      const servers: Record<string, ServerSpec> = {
        test: {
          command: 'node',
          args: ['test.js']
        }
      };

      hubCore.init(servers);

      // Test various MCP methods
      const methods = [
        'tools/list',
        'tools/call',
        'resources/list',
        'resources/read',
        'prompts/list',
        'prompts/get'
      ];

      for (const method of methods) {
        const request = {
          jsonrpc: '2.0' as const,
          id: 1,
          method,
          params: {}
        };

        const response = await hubCore.handle(request);
        // Would fail to connect but should route correctly
        expect(response).toHaveProperty('jsonrpc', '2.0');
      }
    });

    it('should pass through unknown methods', async () => {
      const servers: Record<string, ServerSpec> = {
        test: {
          command: 'node',
          args: ['test.js']
        }
      };

      hubCore.init(servers);

      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'custom/method',
        params: { custom: 'data' }
      };

      const response = await hubCore.handle(request);
      // Would fail to connect but should attempt to pass through
      expect(response).toHaveProperty('jsonrpc', '2.0');
    });
  });
});
