/**
 * Tests for McpHub
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HatagoConfig } from '../config/types.js';
import { McpHub } from './mcp-hub.js';

// Mock dependencies
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    server: {
      registerCapabilities: vi.fn(),
      setRequestHandler: vi.fn(),
      isConnected: vi.fn().mockReturnValue(false),
      getCapabilities: vi.fn().mockReturnValue({}),
      notification: vi.fn(),
    },
    registerTool: vi.fn(),
  })),
}));

vi.mock('../utils/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./session-manager.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    startCleanup: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
    createSession: vi.fn().mockResolvedValue({
      id: 'test-session',
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      ttlSeconds: 3600,
    }),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
  })),
}));

vi.mock('./tool-registry.js', () => ({
  ToolRegistry: vi.fn().mockImplementation(() => ({
    getAllTools: vi.fn().mockReturnValue([]),
    registerServerTools: vi.fn(),
    clearServerTools: vi.fn(),
    clear: vi.fn(),
    resolveTool: vi.fn(),
  })),
}));

vi.mock('./resource-registry.js', () => ({
  createResourceRegistry: vi.fn().mockReturnValue({
    getAllResources: vi.fn().mockReturnValue([]),
    registerServerResources: vi.fn(),
    clearServerResources: vi.fn(),
    clear: vi.fn(),
    resolveResource: vi.fn(),
  }),
}));

describe('McpHub', () => {
  let hub: McpHub;
  let mockConfig: HatagoConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      servers: [],
      toolNaming: {
        strategy: 'prefix',
        separator: '_',
      },
      session: {
        ttlSeconds: 3600,
      },
      timeouts: {
        toolCallMs: 30000,
      },
      registry: {
        persist: {
          enabled: false,
        },
      },
    };

    hub = new McpHub({ config: mockConfig });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await hub.initialize();

      const server = hub.getServer();
      expect(server).toBeDefined();
      expect(server.server.registerCapabilities).toHaveBeenCalledWith({
        tools: { listChanged: false },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      });
    });

    it('should only initialize once', async () => {
      await hub.initialize();
      await hub.initialize(); // Second call should be no-op

      const server = hub.getServer();
      expect(server.server.registerCapabilities).toHaveBeenCalledTimes(1);
    });

    it('should start session cleanup on initialization', async () => {
      const sessionManager = hub.getSessionManager();
      await hub.initialize();

      expect(sessionManager.startCleanup).toHaveBeenCalled();
    });

    it('should connect eager servers on initialization', async () => {
      mockConfig.servers = [
        {
          id: 'test-server',
          type: 'npx',
          package: 'test-package',
          start: 'eager',
        },
      ];

      hub = new McpHub({ config: mockConfig });
      const connectSpy = vi.spyOn(hub, 'connectServer').mockResolvedValue();

      await hub.initialize();

      expect(connectSpy).toHaveBeenCalledWith(mockConfig.servers[0]);
    });

    it('should not connect lazy servers on initialization', async () => {
      mockConfig.servers = [
        {
          id: 'test-server',
          type: 'npx',
          package: 'test-package',
          start: 'lazy',
        },
      ];

      hub = new McpHub({ config: mockConfig });
      const connectSpy = vi.spyOn(hub, 'connectServer').mockResolvedValue();

      await hub.initialize();

      expect(connectSpy).not.toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should clean up all resources on shutdown', async () => {
      await hub.initialize();

      const sessionManager = hub.getSessionManager();
      const registry = hub.getRegistry();

      await hub.shutdown();

      expect(sessionManager.stop).toHaveBeenCalled();
      expect(sessionManager.clear).toHaveBeenCalled();
      expect(registry.clear).toHaveBeenCalled();
    });

    it('should disconnect all servers on shutdown', async () => {
      await hub.initialize();

      // Mock a connection
      const connections = hub.getConnections();
      connections.set('test-server', {
        serverId: 'test-server',
        connected: true,
        type: 'npx',
      });

      const disconnectSpy = vi
        .spyOn(hub, 'disconnectServer')
        .mockResolvedValue();

      await hub.shutdown();

      expect(disconnectSpy).toHaveBeenCalledWith('test-server');
      expect(connections.size).toBe(0);
    });
  });

  describe('tool management', () => {
    it('should handle tool registration with mutex', async () => {
      await hub.initialize();

      const registry = hub.getRegistry();
      const mockTools = [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: { properties: { input: { type: 'string' } } },
        },
      ];

      registry.getAllTools = vi.fn().mockReturnValue(mockTools);

      // Call updateHubTools multiple times concurrently
      await Promise.all([
        hub.updateHubTools(),
        hub.updateHubTools(),
        hub.updateHubTools(),
      ]);

      // Should only register once due to mutex and idempotency
      const server = hub.getServer();
      expect(server.registerTool).toHaveBeenCalledTimes(1);
      expect(server.registerTool).toHaveBeenCalledWith(
        'test_tool',
        expect.objectContaining({
          description: 'Test tool',
        }),
        expect.any(Function),
      );
    });

    it('should handle callTool with valid tool', async () => {
      await hub.initialize();

      const registry = hub.getRegistry();
      registry.resolveTool = vi.fn().mockReturnValue({
        serverId: 'test-server',
        originalName: 'original_tool',
      });

      // Mock connection
      const connections = hub.getConnections();
      const mockNpxServer = {
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Tool result' }],
        }),
      };
      connections.set('test-server', {
        serverId: 'test-server',
        connected: true,
        type: 'npx',
        npxServer: mockNpxServer,
      });

      const result = await hub.callTool({
        name: 'test_tool',
        arguments: { input: 'test' },
      });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool result' }],
      });
      expect(mockNpxServer.callTool).toHaveBeenCalledWith('original_tool', {
        input: 'test',
      });
    });

    it('should handle callTool with non-existent tool', async () => {
      await hub.initialize();

      const registry = hub.getRegistry();
      registry.resolveTool = vi.fn().mockReturnValue(null);

      const result = await hub.callTool({
        name: 'non_existent',
        arguments: {},
      });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool not found: non_existent' }],
        isError: true,
      });
    });

    it('should handle callTool with disconnected server', async () => {
      await hub.initialize();

      const registry = hub.getRegistry();
      registry.resolveTool = vi.fn().mockReturnValue({
        serverId: 'test-server',
        originalName: 'original_tool',
      });

      // No connection exists

      const result = await hub.callTool({
        name: 'test_tool',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Server not connected');
    });

    it('should handle tool call timeout', async () => {
      mockConfig.timeouts.toolCallMs = 100; // Short timeout
      hub = new McpHub({ config: mockConfig });
      await hub.initialize();

      const registry = hub.getRegistry();
      registry.resolveTool = vi.fn().mockReturnValue({
        serverId: 'test-server',
        originalName: 'original_tool',
      });

      // Mock connection with slow tool
      const connections = hub.getConnections();
      const mockNpxServer = {
        callTool: vi
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 500)),
          ),
      };
      connections.set('test-server', {
        serverId: 'test-server',
        connected: true,
        type: 'npx',
        npxServer: mockNpxServer,
      });

      const result = await hub.callTool({
        name: 'test_tool',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain('timeout');
    });
  });

  describe('handlers', () => {
    it('should setup tool handlers on construction', () => {
      const server = hub.getServer();
      // Check that setRequestHandler was called (we can't check the exact schema due to Zod objects)
      expect(server.server.setRequestHandler).toHaveBeenCalled();
      const calls = server.server.setRequestHandler.mock.calls;
      // Should have at least 2 calls for tools/list and tools/call
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should setup resource and prompt handlers on initialization', async () => {
      await hub.initialize();

      const server = hub.getServer();
      // After initialization, should have more handler registrations
      const calls = server.server.setRequestHandler.mock.calls;
      // Should have handlers for tools, resources, and prompts
      expect(calls.length).toBeGreaterThanOrEqual(6); // tools/list, tools/call, resources/list, resources/read, prompts/list, prompts/get
    });
  });

  describe('getters', () => {
    it('should return server instance', () => {
      const server = hub.getServer();
      expect(server).toBeDefined();
      expect(server.server).toBeDefined();
    });

    it('should return registry instance', () => {
      const registry = hub.getRegistry();
      expect(registry).toBeDefined();
      expect(registry.getAllTools).toBeDefined();
    });

    it('should return connections map', () => {
      const connections = hub.getConnections();
      expect(connections).toBeInstanceOf(Map);
    });

    it('should return session manager', () => {
      const sessionManager = hub.getSessionManager();
      expect(sessionManager).toBeDefined();
      expect(sessionManager.createSession).toBeDefined();
    });
  });
});
