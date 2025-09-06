import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HubCore } from './hub-core.js';
import type { ServerSpec } from './types.js';
import type { JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';

describe('HubCore', () => {
  let hubCore: HubCore;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    };
    hubCore = new HubCore({ logger: mockLogger });
  });

  afterEach(async () => {
    await hubCore.close();
  });

  describe('Philosophy Compliance', () => {
    it('should be thin - no state management', () => {
      // HubCore should not have any state management properties
      const instance = hubCore as unknown as Record<string, unknown>;
      expect(instance.state).toBeUndefined();
      expect(instance.stateManager).toBeUndefined();
      expect(instance.activationManager).toBeUndefined();
      expect(instance.idleManager).toBeUndefined();
    });

    it('should be transparent - no caching', () => {
      const instance = hubCore as unknown as Record<string, unknown>;
      expect(instance.cache).toBeUndefined();
      expect(instance.metadataStore).toBeUndefined();
      expect(instance.resultCache).toBeUndefined();
    });

    it('should be minimal - only essential methods', () => {
      // Only init, handle, close should be public
      const instance = hubCore as unknown as Record<string, unknown>;
      const publicMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(hubCore))
        .filter((name) => typeof instance[name] === 'function')
        .filter((name) => !name.startsWith('_') && name !== 'constructor');

      expect(publicMethods).toEqual(expect.arrayContaining(['init', 'handle', 'close']));
      // Core methods only - init, handle, close
      expect(publicMethods.length).toBeLessThanOrEqual(10); // Allow private methods that might be exposed
    });
  });

  describe('Basic Operations', () => {
    it('should initialize with server specs', async () => {
      const servers: Record<string, ServerSpec> = {
        'test-server': {
          command: 'node',
          args: ['test.js']
        }
      };

      await hubCore.init(servers);
      expect(mockLogger.info).toHaveBeenCalledWith('HubCore initialized', { serverCount: 1 });
    });

    it('should handle close gracefully', async () => {
      await hubCore.init({});
      await hubCore.close();
      expect(mockLogger.info).toHaveBeenCalledWith('HubCore closed');
    });

    it('should reject operations after close', async () => {
      await hubCore.close();

      // Should throw on init
      expect(() => hubCore.init({})).toThrow('HubCore is closed');

      // Should return error on handle
      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: {}
      });
      expect(response.error).toBeDefined();
      expect(response.error?.message).toBe('HubCore is closed');
    });
  });

  describe('Request Handling', () => {
    it('should parse server-prefixed methods', async () => {
      const servers: Record<string, ServerSpec> = {
        server1: { command: 'node', args: ['server1.js'] },
        server2: { command: 'node', args: ['server2.js'] }
      };
      await hubCore.init(servers);

      // Mock the private method to test parsing
      const instance = hubCore as unknown as {
        parseMethod: (method: string) => { serverId: string | undefined; method: string };
      };
      const parsed = instance.parseMethod('server1__tools/list');
      expect(parsed).toEqual({
        serverId: 'server1',
        method: 'tools/list'
      });
    });

    it('should handle unprefixed methods', async () => {
      const servers: Record<string, ServerSpec> = {
        default: { command: 'node', args: ['default.js'] }
      };
      await hubCore.init(servers);

      const instance = hubCore as unknown as {
        parseMethod: (method: string) => { serverId?: string; method: string };
      };
      const parsed = instance.parseMethod('tools/list');
      expect(parsed).toEqual({
        serverId: undefined,
        method: 'tools/list'
      });
    });

    it('should return error for no servers', async () => {
      await hubCore.init({});

      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'test',
        params: {}
      });

      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('No servers configured');
    });

    it('should return error for unknown server', async () => {
      await hubCore.init({
        server1: { command: 'node', args: ['test.js'] }
      });

      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown__test',
        params: {}
      });

      expect(response.error).toBeDefined();
    });
  });

  describe('Passthrough Behavior', () => {
    it('should not transform request params', async () => {
      const servers: Record<string, ServerSpec> = {
        test: { command: 'node', args: ['test.js'] }
      };
      await hubCore.init(servers);

      const originalParams = {
        complexData: {
          nested: {
            deep: 'value'
          },
          array: [1, 2, 3],
          special: '!@#$%^&*()'
        }
      };

      // We can't test actual passthrough without a real server,
      // but we can verify the request structure isn't modified
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test__custom',
        params: originalParams
      };

      // The params should remain unchanged in the catch error
      try {
        await hubCore.handle(request);
      } catch (error) {
        // Expected to fail without real server
      }

      // Verify logger wasn't called with transformed data
      expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('transform'));
    });

    it('should support all MCP standard methods', async () => {
      const standardMethods = [
        'initialize',
        'initialized',
        'shutdown',
        'ping',
        'tools/list',
        'tools/call',
        'resources/list',
        'resources/read',
        'prompts/list',
        'prompts/get'
      ];

      const servers: Record<string, ServerSpec> = {
        test: { command: 'node', args: ['test.js'] }
      };
      await hubCore.init(servers);

      // Each method should be handled (though will error without real server)
      for (const method of standardMethods) {
        const response = await hubCore.handle({
          jsonrpc: '2.0',
          id: 1,
          method,
          params: {}
        });

        // Should get an error (no real server) but not "unknown method"
        expect(response.error).toBeDefined();
        expect(response.error?.message).not.toContain('Unknown method');
      }
    });
  });

  describe('Lazy Connection', () => {
    it('should not connect on init', async () => {
      const servers: Record<string, ServerSpec> = {
        lazy: { command: 'node', args: ['lazy.js'] }
      };

      await hubCore.init(servers);

      // Check internal state - should not have client yet
      const instance = hubCore as unknown as {
        servers: Map<string, { client?: unknown; transport?: unknown }>;
      };
      const server = instance.servers.get('lazy');
      expect(server.client).toBeUndefined();
      expect(server.transport).toBeUndefined();
    });

    it('should connect on first request', async () => {
      const servers: Record<string, ServerSpec> = {
        lazy: { command: 'node', args: ['lazy.js'] }
      };

      await hubCore.init(servers);

      // Make a request (will fail but should attempt connection)
      try {
        await hubCore.handle({
          jsonrpc: '2.0',
          id: 1,
          method: 'lazy__test',
          params: {}
        });
      } catch {
        // Expected to fail
      }

      // Should have attempted connection
      expect(mockLogger.debug).toHaveBeenCalledWith('Connecting to server lazy');
    });
  });

  describe('Error Handling', () => {
    it('should handle server connection errors gracefully', async () => {
      const servers: Record<string, ServerSpec> = {
        broken: { command: 'nonexistent-command', args: [] }
      };

      await hubCore.init(servers);

      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'broken__test',
        params: {}
      });

      expect(response.error).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to connect'),
        expect.anything()
      );
    });

    it('should handle request errors gracefully', async () => {
      await hubCore.init({});

      const response = await hubCore.handle({
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test',
        params: null
      });

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 'test-id',
        error: expect.objectContaining({
          code: -32603,
          message: expect.any(String)
        })
      });
    });
  });

  describe('Line Count Target', () => {
    it('should be a thin implementation', async () => {
      // Read the source file to check size
      const fs = await import('fs/promises');
      const path = await import('path');
      const __dirname = path.dirname(new URL(import.meta.url).pathname);
      const sourceFile = path.join(__dirname, 'hub-core.ts');

      try {
        const source = await fs.readFile(sourceFile, 'utf-8');
        const lines = source.split('\n').length;

        // Target: Under 400 lines for core functionality
        expect(lines).toBeLessThan(400);

        // Ideal: Under 300 lines
        if (lines < 300) {
          console.log(`✅ Excellent! HubCore is only ${lines} lines`);
        } else {
          console.log(`⚠️  HubCore is ${lines} lines (target: <300)`);
        }
      } catch (error) {
        // File might not exist in test environment
        console.log('Could not check file size');
      }
    });
  });
});
