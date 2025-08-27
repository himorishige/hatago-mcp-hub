import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerRegistry } from '../servers/server-registry.js';
import type { Logger } from '../utils/logger.js';
import { McpHubToolManager } from './mcp-hub-tools.js';
import type { ToolRegistry } from './tool-registry.js';

describe('McpHubToolManager', () => {
  let toolManager: McpHubToolManager;
  let mockServer: Server;
  let mockRegistry: Partial<ToolRegistry>;
  let mockLogger: Partial<Logger>;

  beforeEach(() => {
    mockServer = {
      _requestHandlers: new Map(),
    } as unknown as Server;

    mockRegistry = {
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
      hasRegisteredTool: vi.fn(),
      getRegisteredTool: vi.fn(),
      listRegisteredTools: vi.fn(),
      callTool: vi.fn(),
      getTool: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => mockLogger),
    };

    const mockServerRegistry = {} as ServerRegistry;
    const mockConnections = new Map();

    toolManager = new McpHubToolManager(
      mockRegistry as ToolRegistry,
      mockServerRegistry as ServerRegistry,
      mockConnections,
      mockServer,
      mockLogger as Logger,
    );
  });

  describe('setupToolHandlers', () => {
    it('should set up list_tools handler', () => {
      toolManager.setupToolHandlers();
      expect(mockServer._requestHandlers.has('tools/list')).toBe(true);
      expect(mockServer._requestHandlers.get('tools/list')).toBeInstanceOf(
        Function,
      );
    });

    it('should set up call_tool handler', () => {
      toolManager.setupToolHandlers();
      expect(mockServer._requestHandlers.has('tools/call')).toBe(true);
      expect(mockServer._requestHandlers.get('tools/call')).toBeInstanceOf(
        Function,
      );
    });
  });

  describe('callTool', () => {
    it('should call tool with correct parameters', async () => {
      const expectedResult = {
        content: [{ type: 'text', text: 'Success' }],
      };

      const mockConnection = {
        transport: {
          request: vi.fn().mockResolvedValue(expectedResult),
        },
      };

      const mockConnections = new Map([['server1', mockConnection]]);
      const mockToolManager = new McpHubToolManager(
        mockRegistry as ToolRegistry,
        {} as ServerRegistry,
        mockConnections,
        mockServer,
        mockLogger as Logger,
      );

      vi.mocked(mockRegistry.getTool).mockReturnValue({
        name: 'test_tool',
        originalName: 'test_tool',
        serverId: 'server1',
        description: 'Test tool',
        inputSchema: {},
      });

      const result = await mockToolManager.callTool('test_tool', {
        input: 'test',
      });

      expect(mockConnection.transport.request).toHaveBeenCalledWith({
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: { input: 'test' },
        },
      });
      expect(result).toEqual(expectedResult);
    });

    it('should handle tool not found', async () => {
      vi.mocked(mockRegistry.getTool).mockReturnValue(undefined);

      await expect(toolManager.callTool('unknown_tool', {})).rejects.toThrow(
        'Tool unknown_tool not found',
      );
    });

    it('should handle server not connected', async () => {
      vi.mocked(mockRegistry.getTool).mockReturnValue({
        name: 'test_tool',
        originalName: 'test_tool',
        serverId: 'server1',
        description: 'Test tool',
        inputSchema: {},
      });

      await expect(toolManager.callTool('test_tool', {})).rejects.toThrow(
        'Server server1 not connected',
      );
    });
  });
});
