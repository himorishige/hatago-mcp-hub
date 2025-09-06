/**
 * Integration tests for HubCore with real MCP servers
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HubCore } from './hub-core.js';
import type { ServerSpec } from './types.js';

describe('HubCore Integration Tests', () => {
  let hubCore: HubCore;

  beforeEach(() => {
    hubCore = new HubCore({
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {}
      }
    });
  });

  afterEach(async () => {
    await hubCore.close();
  });

  describe('Real MCP Server Integration', () => {
    it.skip('should connect to filesystem MCP server', async () => {
      // Skip by default as it requires @modelcontextprotocol/server-filesystem
      const servers: Record<string, ServerSpec> = {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: {}
        }
      };

      hubCore.init(servers);

      // Test tools/list
      const toolsResponse = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'filesystem__tools/list',
        params: {}
      });

      expect(toolsResponse.error).toBeUndefined();
      expect(toolsResponse.result).toBeDefined();

      if (
        toolsResponse.result &&
        typeof toolsResponse.result === 'object' &&
        'tools' in toolsResponse.result
      ) {
        const tools = (toolsResponse.result as any).tools;
        expect(Array.isArray(tools)).toBe(true);

        // Filesystem server should provide read_file, write_file, etc.
        const toolNames = tools.map((t: any) => t.name);
        expect(toolNames).toContain('read_file');
        expect(toolNames).toContain('write_file');
        expect(toolNames).toContain('list_directory');
      }
    });

    it.skip('should execute filesystem server tool', async () => {
      // Skip by default as it requires @modelcontextprotocol/server-filesystem
      const servers: Record<string, ServerSpec> = {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: {}
        }
      };

      hubCore.init(servers);

      // Test list_directory tool
      const callResponse = await hubCore.handle({
        jsonrpc: '2.0',
        id: 2,
        method: 'filesystem__tools/call',
        params: {
          name: 'list_directory',
          arguments: {
            path: '/'
          }
        }
      });

      expect(callResponse.error).toBeUndefined();
      expect(callResponse.result).toBeDefined();

      if (
        callResponse.result &&
        typeof callResponse.result === 'object' &&
        'content' in callResponse.result
      ) {
        const content = (callResponse.result as any).content;
        expect(Array.isArray(content)).toBe(true);

        // Should have at least one content item
        if (content.length > 0) {
          const firstItem = content[0];
          expect(firstItem).toHaveProperty('type');
          expect(firstItem).toHaveProperty('text');
        }
      }
    });

    it.skip('should handle multiple server connections', async () => {
      // Skip by default as it requires external servers
      const servers: Record<string, ServerSpec> = {
        fs1: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          env: {}
        },
        fs2: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/var'],
          env: {}
        }
      };

      hubCore.init(servers);

      // Test both servers
      const [response1, response2] = await Promise.all([
        hubCore.handle({
          jsonrpc: '2.0',
          id: 1,
          method: 'fs1__tools/list',
          params: {}
        }),
        hubCore.handle({
          jsonrpc: '2.0',
          id: 2,
          method: 'fs2__tools/list',
          params: {}
        })
      ]);

      expect(response1.error).toBeUndefined();
      expect(response2.error).toBeUndefined();
      expect(response1.result).toBeDefined();
      expect(response2.result).toBeDefined();
    });
  });

  describe('Remote Server Integration', () => {
    it.skip('should connect to SSE server', async () => {
      // Skip by default as it requires a running SSE server
      const servers: Record<string, ServerSpec> = {
        remote: {
          url: 'http://localhost:3000/sse',
          type: 'sse'
        }
      };

      hubCore.init(servers);

      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'remote__tools/list',
        params: {}
      });

      // This will fail if server is not running
      if (response.error) {
        expect(response.error.message).toContain('connect');
      } else {
        expect(response.result).toBeDefined();
      }
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle concurrent requests efficiently', async () => {
      const servers: Record<string, ServerSpec> = {
        test: {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      hubCore.init(servers);

      const startTime = Date.now();

      // Send 10 concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) =>
        hubCore.handle({
          jsonrpc: '2.0',
          id: i,
          method: 'test__tools/list',
          params: {}
        })
      );

      const responses = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All should succeed
      responses.forEach((response) => {
        expect(response.error).toBeUndefined();
      });

      // Should complete reasonably quickly (under 1 second for 10 requests)
      expect(duration).toBeLessThan(1000);
    });

    it('should use lazy connection (connect on first use)', async () => {
      const servers: Record<string, ServerSpec> = {
        test: {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      // Track connection timing
      let firstRequestTime: number;
      let initTime: number;

      initTime = Date.now();
      hubCore.init(servers);
      const initDuration = Date.now() - initTime;

      // Init should be instant (no connection)
      expect(initDuration).toBeLessThan(10);

      // First request triggers connection
      firstRequestTime = Date.now();
      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'test__tools/list',
        params: {}
      });
      const firstRequestDuration = Date.now() - firstRequestTime;

      expect(response.error).toBeUndefined();

      // First request takes longer due to connection
      expect(firstRequestDuration).toBeGreaterThan(10);

      // Second request should be faster (already connected)
      const secondRequestTime = Date.now();
      const response2 = await hubCore.handle({
        jsonrpc: '2.0',
        id: 2,
        method: 'test__tools/list',
        params: {}
      });
      const secondRequestDuration = Date.now() - secondRequestTime;

      expect(response2.error).toBeUndefined();

      // Second request should be faster than first
      expect(secondRequestDuration).toBeLessThan(firstRequestDuration);
    });
  });
});
