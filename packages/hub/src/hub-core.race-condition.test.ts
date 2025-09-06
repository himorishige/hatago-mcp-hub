/**
 * Race condition and concurrency tests for HubCore
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HubCore } from './hub-core.js';
import type { ServerSpec } from './types.js';

describe('HubCore Race Conditions', () => {
  let hubCore: HubCore;

  beforeEach(() => {
    hubCore = new HubCore({
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });
  });

  afterEach(async () => {
    await hubCore.close();
  });

  describe('Concurrent Connection Prevention', () => {
    it('should not create duplicate connections when multiple requests arrive simultaneously', async () => {
      const servers: Record<string, ServerSpec> = {
        'test-server': {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      hubCore.init(servers);

      // Track connection attempts
      let connectionCount = 0;
      const originalConnect = hubCore['connectServer'].bind(hubCore);
      hubCore['connectServer'] = vi.fn(async (...args) => {
        connectionCount++;
        // Simulate slow connection
        await new Promise((resolve) => setTimeout(resolve, 100));
        return originalConnect(...args);
      });

      // Send multiple concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        hubCore.handle({
          jsonrpc: '2.0',
          id: i,
          method: 'test-server__tools/list',
          params: {}
        })
      );

      const responses = await Promise.all(requests);

      // Should only connect once despite multiple concurrent requests
      expect(connectionCount).toBe(1);

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.error).toBeUndefined();
      });
    });

    it('should handle concurrent connections to different servers', async () => {
      const servers: Record<string, ServerSpec> = {
        server1: {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        },
        server2: {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      hubCore.init(servers);

      // Send requests to different servers simultaneously
      const [response1, response2] = await Promise.all([
        hubCore.handle({
          jsonrpc: '2.0',
          id: 1,
          method: 'server1__tools/list',
          params: {}
        }),
        hubCore.handle({
          jsonrpc: '2.0',
          id: 2,
          method: 'server2__tools/list',
          params: {}
        })
      ]);

      // Both should succeed
      expect(response1.error).toBeUndefined();
      expect(response2.error).toBeUndefined();
    });

    it('should wait for ongoing connections before closing', async () => {
      const servers: Record<string, ServerSpec> = {
        'slow-server': {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      hubCore.init(servers);

      // Mock slow connection
      const originalConnect = hubCore['connectServer'].bind(hubCore);
      let connectResolve: () => void;
      const connectPromise = new Promise<void>((resolve) => {
        connectResolve = resolve;
      });

      hubCore['connectServer'] = vi.fn(async (...args) => {
        await connectPromise;
        return originalConnect(...args);
      });

      // Start connection (won't complete yet)
      const requestPromise = hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'slow-server__tools/list',
        params: {}
      });

      // Start closing immediately
      const closePromise = hubCore.close();

      // Verify that close is waiting
      expect(hubCore['connectingServers'].size).toBeGreaterThan(0);

      // Complete the connection
      connectResolve!();

      // Both should complete
      await Promise.all([requestPromise, closePromise]);

      // Connecting servers should be cleared
      expect(hubCore['connectingServers'].size).toBe(0);
    });
  });

  describe('Error State Management', () => {
    it('should store connection errors for diagnostics', async () => {
      const servers: Record<string, ServerSpec> = {
        'invalid-server': {
          command: 'nonexistent-command',
          args: []
        }
      };

      hubCore.init(servers);

      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'invalid-server__tools/list',
        params: {}
      });

      expect(response.error).toBeDefined();

      // Check that error was stored
      const server = hubCore['servers'].get('invalid-server');
      expect(server?.connectionError).toBeDefined();
      expect(server?.lastConnectionAttempt).toBeDefined();
    });

    it('should clear error state on successful connection', async () => {
      const servers: Record<string, ServerSpec> = {
        'test-server': {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      hubCore.init(servers);

      // First, inject an error state
      const server = hubCore['servers'].get('test-server')!;
      server.connectionError = new Error('Previous error');
      server.lastConnectionAttempt = Date.now() - 10000;

      // Now make a successful connection
      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'test-server__tools/list',
        params: {}
      });

      // Error should be cleared
      expect(server.connectionError).toBeUndefined();
      expect(server.lastConnectionAttempt).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate tools/call parameters', async () => {
      const servers: Record<string, ServerSpec> = {
        test: {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      hubCore.init(servers);

      // Invalid parameters - missing name
      const response1 = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'test__tools/call',
        params: { arguments: {} }
      });

      expect(response1.error).toBeDefined();
      expect(response1.error?.message).toContain('name must be a string');

      // Invalid parameters - not an object
      const response2 = await hubCore.handle({
        jsonrpc: '2.0',
        id: 2,
        method: 'test__tools/call',
        params: 'invalid'
      });

      expect(response2.error).toBeDefined();
      expect(response2.error?.message).toContain('expected object');

      // Valid parameters
      const response3 = await hubCore.handle({
        jsonrpc: '2.0',
        id: 3,
        method: 'test__tools/call',
        params: { name: 'test_tool', arguments: { key: 'value' } }
      });

      // Should succeed (or fail with server-specific error, not validation)
      if (response3.error) {
        expect(response3.error.message).not.toContain('Invalid tools/call parameters');
      }
    });

    it('should validate resources/read parameters', async () => {
      const servers: Record<string, ServerSpec> = {
        test: {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      hubCore.init(servers);

      // Invalid parameters - missing uri
      const response1 = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'test__resources/read',
        params: {}
      });

      expect(response1.error).toBeDefined();
      expect(response1.error?.message).toContain('uri must be a string');

      // Invalid parameters - uri not a string
      const response2 = await hubCore.handle({
        jsonrpc: '2.0',
        id: 2,
        method: 'test__resources/read',
        params: { uri: 123 }
      });

      expect(response2.error).toBeDefined();
      expect(response2.error?.message).toContain('uri must be a string');
    });

    it('should validate prompts/get parameters', async () => {
      const servers: Record<string, ServerSpec> = {
        test: {
          command: 'node',
          args: ['../test-fixtures/dist/stdio-server.js', '--echo']
        }
      };

      hubCore.init(servers);

      // Invalid parameters - arguments not an object
      const response1 = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'test__prompts/get',
        params: { name: 'prompt', arguments: 'invalid' }
      });

      expect(response1.error).toBeDefined();
      expect(response1.error?.message).toContain('arguments must be an object');

      // Invalid parameters - argument value not a string
      const response2 = await hubCore.handle({
        jsonrpc: '2.0',
        id: 2,
        method: 'test__prompts/get',
        params: { name: 'prompt', arguments: { key: 123 } }
      });

      expect(response2.error).toBeDefined();
      expect(response2.error?.message).toContain("argument 'key' must be a string");
    });
  });
});
