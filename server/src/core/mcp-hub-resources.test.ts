import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerRegistry } from '../servers/server-registry.js';
import type { Logger } from '../utils/logger.js';
import { McpHubResourceManager } from './mcp-hub-resources.js';
import type { ResourceRegistry } from './resource-registry.js';

describe('McpHubResourceManager', () => {
  let resourceManager: McpHubResourceManager;
  let mockServer: Server;
  let mockRegistry: ResourceRegistry;
  let mockLogger: Partial<Logger>;

  beforeEach(() => {
    mockServer = {
      _requestHandlers: new Map(),
    } as unknown as Server;

    mockRegistry = {
      registerResource: vi.fn(),
      unregisterResource: vi.fn(),
      listResources: vi.fn(),
      readResource: vi.fn(),
      subscribeToResource: vi.fn(),
      unsubscribeFromResource: vi.fn(),
    } as unknown as ResourceRegistry;

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => mockLogger),
    };

    const mockServerRegistry = {} as ServerRegistry;
    const mockConnections = new Map();

    resourceManager = new McpHubResourceManager(
      mockRegistry,
      mockServerRegistry,
      mockConnections,
      mockServer,
      mockLogger as Logger,
    );
  });

  describe('setupResourceHandlers', () => {
    it('should set up resources/list handler', () => {
      resourceManager.setupResourceHandlers();
      expect(mockServer._requestHandlers.has('resources/list')).toBe(true);
      expect(mockServer._requestHandlers.get('resources/list')).toBeInstanceOf(
        Function,
      );
    });

    it('should set up resources/read handler', () => {
      resourceManager.setupResourceHandlers();
      expect(mockServer._requestHandlers.has('resources/read')).toBe(true);
      expect(mockServer._requestHandlers.get('resources/read')).toBeInstanceOf(
        Function,
      );
    });
  });
});
