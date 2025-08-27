import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerRegistry } from '../servers/server-registry.js';
import type { Logger } from '../utils/logger.js';
import { McpHubPromptManager } from './mcp-hub-prompts.js';
import type { PromptRegistry } from './prompt-registry.js';

describe('McpHubPromptManager', () => {
  let promptManager: McpHubPromptManager;
  let mockServer: Server;
  let mockRegistry: Partial<PromptRegistry>;
  let mockServerRegistry: Partial<ServerRegistry>;
  let mockLogger: Partial<Logger>;

  beforeEach(() => {
    mockServer = {
      _requestHandlers: new Map(),
    } as unknown as Server;

    mockRegistry = {
      registerPrompt: vi.fn(),
      unregisterPrompt: vi.fn(),
      hasRegisteredPrompt: vi.fn(),
      getRegisteredPrompt: vi.fn(),
      listRegisteredPrompts: vi.fn(),
      getPrompt: vi.fn(),
      getAllPrompts: vi.fn().mockReturnValue([]),
      registerServerPrompts: vi.fn(),
      resolvePrompt: vi.fn(),
    };

    mockServerRegistry = {
      listServers: vi.fn().mockReturnValue([]),
      registerServerPrompts: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => mockLogger),
    };

    const mockConnections = new Map();

    promptManager = new McpHubPromptManager(
      mockRegistry as PromptRegistry,
      mockServerRegistry as ServerRegistry,
      mockConnections,
      mockServer,
      mockLogger as Logger,
    );
  });

  describe('setupPromptHandlers', () => {
    it('should set up list_prompts handler', () => {
      promptManager.setupPromptHandlers();
      expect(mockServer._requestHandlers.has('prompts/list')).toBe(true);
      expect(mockServer._requestHandlers.get('prompts/list')).toBeInstanceOf(
        Function,
      );
    });

    it('should set up get_prompt handler', () => {
      promptManager.setupPromptHandlers();
      expect(mockServer._requestHandlers.has('prompts/get')).toBe(true);
      expect(mockServer._requestHandlers.get('prompts/get')).toBeInstanceOf(
        Function,
      );
    });
  });

  describe('getPrompt', () => {
    it('should get prompt with correct parameters', async () => {
      const expectedResult = {
        messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
        description: 'Test prompt',
      };

      const mockConnection = {
        transport: {
          request: vi.fn().mockResolvedValue(expectedResult),
        },
      };

      const mockConnections = new Map([['server1', mockConnection]]);
      const mockPromptManager = new McpHubPromptManager(
        mockRegistry,
        mockServerRegistry,
        mockConnections,
        mockServer,
        mockLogger,
      );

      // Setup handlers
      mockPromptManager.setupPromptHandlers();

      vi.mocked(mockRegistry.getPrompt).mockReturnValue({
        name: 'test_prompt',
        description: 'Test prompt',
        arguments: [],
      });

      vi.mocked(mockRegistry.resolvePrompt).mockReturnValue({
        originalName: 'test_prompt',
        serverId: 'server1',
      });

      // Call the handler directly
      const handler = mockServer._requestHandlers.get('prompts/get');
      const result = await handler({
        params: {
          name: 'test_prompt',
          arguments: { input: 'test' },
        },
      });

      expect(mockConnection.transport.request).toHaveBeenCalledWith({
        method: 'prompts/get',
        params: {
          name: 'test_prompt',
          arguments: { input: 'test' },
        },
      });
      expect(result).toEqual(expectedResult);
    });

    it('should handle prompt not found', async () => {
      promptManager.setupPromptHandlers();
      vi.mocked(mockRegistry.getPrompt).mockReturnValue(undefined);

      const handler = mockServer._requestHandlers.get('prompts/get');
      await expect(
        handler({ params: { name: 'unknown_prompt' } }),
      ).rejects.toThrow('Prompt unknown_prompt not found');
    });

    it('should handle server not connected', async () => {
      promptManager.setupPromptHandlers();

      vi.mocked(mockRegistry.getPrompt).mockReturnValue({
        name: 'test_prompt',
        description: 'Test prompt',
        arguments: [],
      });

      vi.mocked(mockRegistry.resolvePrompt).mockReturnValue({
        originalName: 'test_prompt',
        serverId: 'server1',
      });

      const handler = mockServer._requestHandlers.get('prompts/get');
      await expect(
        handler({ params: { name: 'test_prompt' } }),
      ).rejects.toThrow('Server server1 not connected');
    });
  });

  describe('refreshNpxServerPrompts', () => {
    it('should refresh prompts from NPX server', async () => {
      const mockNpxServer = {
        getPrompts: vi.fn().mockReturnValue([
          { name: 'prompt1', description: 'Prompt 1', arguments: [] },
          { name: 'prompt2', description: 'Prompt 2', arguments: [] },
        ]),
      };

      vi.mocked(mockServerRegistry.listServers).mockReturnValue([
        { id: 'server1', instance: mockNpxServer },
      ]);

      await promptManager.refreshNpxServerPrompts('server1');

      expect(mockNpxServer.getPrompts).toHaveBeenCalled();
      expect(mockRegistry.registerServerPrompts).toHaveBeenCalledWith(
        'server1',
        expect.arrayContaining([
          expect.objectContaining({ name: 'prompt1' }),
          expect.objectContaining({ name: 'prompt2' }),
        ]),
      );
    });

    it('should handle server without prompt support', async () => {
      const mockNpxServer = {}; // No getPrompts method

      vi.mocked(mockServerRegistry.listServers).mockReturnValue([
        { id: 'server1', instance: mockNpxServer },
      ]);

      await promptManager.refreshNpxServerPrompts('server1');

      expect(mockRegistry.registerServerPrompts).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("doesn't implement prompts/list"),
      );
    });
  });

  describe('refreshRemoteServerPrompts', () => {
    it('should refresh prompts from remote server', async () => {
      const mockRemoteServer = {
        listPrompts: vi.fn().mockResolvedValue([
          { name: 'prompt1', description: 'Prompt 1', arguments: [] },
          { name: 'prompt2', description: 'Prompt 2', arguments: [] },
        ]),
      };

      vi.mocked(mockServerRegistry.listServers).mockReturnValue([
        { id: 'server1', instance: mockRemoteServer },
      ]);

      await promptManager.refreshRemoteServerPrompts('server1');

      expect(mockRemoteServer.listPrompts).toHaveBeenCalled();
      expect(mockRegistry.registerServerPrompts).toHaveBeenCalledWith(
        'server1',
        expect.arrayContaining([
          expect.objectContaining({ name: 'prompt1' }),
          expect.objectContaining({ name: 'prompt2' }),
        ]),
      );
    });

    it('should handle server without prompt support', async () => {
      const mockRemoteServer = {
        listPrompts: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(mockServerRegistry.listServers).mockReturnValue([
        { id: 'server1', instance: mockRemoteServer },
      ]);

      await promptManager.refreshRemoteServerPrompts('server1');

      expect(mockRemoteServer.listPrompts).toHaveBeenCalled();
      expect(mockRegistry.registerServerPrompts).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("doesn't support prompts/list"),
      );
    });

    it('should handle server list error', async () => {
      const mockRemoteServer = {
        listPrompts: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      vi.mocked(mockServerRegistry.listServers).mockReturnValue([
        { id: 'server1', instance: mockRemoteServer },
      ]);

      await promptManager.refreshRemoteServerPrompts('server1');

      expect(mockRemoteServer.listPrompts).toHaveBeenCalled();
      expect(mockRegistry.registerServerPrompts).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("doesn't support prompts/list"),
      );
    });
  });

  describe('setInitialized', () => {
    it('should set initialized flag', () => {
      promptManager.setInitialized(true);
      // Should not throw - we can't test internal state directly
      expect(() => promptManager.setInitialized(false)).not.toThrow();
    });
  });
});
