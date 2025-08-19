import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NpxServerConfig } from '../config/types.js';
import { NpxMcpServer, ServerState } from './npx-mcp-server.js';
import { ServerRegistry } from './server-registry.js';
import { WorkspaceManager } from './workspace-manager.js';

// Mock the modules
vi.mock('./workspace-manager.js');
vi.mock('./npx-mcp-server.js');

describe('ServerRegistry', () => {
  let registry: ServerRegistry;
  let mockWorkspaceManager: WorkspaceManager;

  beforeEach(() => {
    mockWorkspaceManager = new WorkspaceManager();
    vi.mocked(mockWorkspaceManager.createWorkspace).mockResolvedValue({
      id: 'workspace-1',
      path: '/tmp/workspace-1',
      serverId: 'test-server',
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    });

    registry = new ServerRegistry(mockWorkspaceManager);
  });

  afterEach(async () => {
    await registry.shutdown();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(registry.initialize()).resolves.not.toThrow();
    });
  });

  describe('NPX server registration', () => {
    const npxConfig: NpxServerConfig = {
      id: 'test-npx-server',
      type: 'npx',
      package: '@example/mcp-server',
      start: 'lazy',
    };

    it('should register a new NPX server', async () => {
      const registered = await registry.registerNpxServer(npxConfig);

      expect(registered.id).toBe('test-npx-server');
      expect(registered.config.type).toBe('npx');
      expect(registered.state).toBe(ServerState.STOPPED);
      expect(registered.instance).toBeDefined();
      expect(registered.registeredAt).toBeInstanceOf(Date);
    });

    it('should throw error if server already exists', async () => {
      await registry.registerNpxServer(npxConfig);

      await expect(registry.registerNpxServer(npxConfig)).rejects.toThrow(
        'Server test-npx-server is already registered',
      );
    });

    it('should auto-start server if configured', async () => {
      const autoStartRegistry = new ServerRegistry(mockWorkspaceManager, {
        autoStart: true,
      });
      await autoStartRegistry.initialize();

      const mockServer = new NpxMcpServer(npxConfig);
      const startSpy = vi.spyOn(mockServer, 'start').mockResolvedValue();
      vi.mocked(NpxMcpServer).mockImplementation(() => mockServer);

      await autoStartRegistry.registerNpxServer(npxConfig);

      expect(startSpy).toHaveBeenCalled();

      await autoStartRegistry.shutdown();
    });
  });

  describe('server management', () => {
    let mockServer: NpxMcpServer;

    beforeEach(async () => {
      const config: NpxServerConfig = {
        id: 'test-server',
        type: 'npx',
        package: '@example/test',
        start: 'lazy',
      };

      mockServer = new NpxMcpServer(config);
      vi.mocked(NpxMcpServer).mockImplementation(() => mockServer);

      await registry.registerNpxServer(config);
    });

    it('should start a registered server', async () => {
      const startSpy = vi.spyOn(mockServer, 'start').mockResolvedValue();

      await registry.startServer('test-server');

      expect(startSpy).toHaveBeenCalled();
    });

    it('should stop a registered server', async () => {
      const stopSpy = vi.spyOn(mockServer, 'stop').mockResolvedValue();

      await registry.stopServer('test-server');

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should restart a registered server', async () => {
      const restartSpy = vi.spyOn(mockServer, 'restart').mockResolvedValue();

      await registry.restartServer('test-server');

      expect(restartSpy).toHaveBeenCalled();
    });

    it('should throw error for non-existent server', async () => {
      await expect(registry.startServer('non-existent')).rejects.toThrow(
        'Server non-existent is not registered',
      );
    });

    it('should get server by ID', () => {
      const server = registry.getServer('test-server');

      expect(server).not.toBeNull();
      expect(server?.id).toBe('test-server');
    });

    it('should return null for non-existent server', () => {
      const server = registry.getServer('non-existent');
      expect(server).toBeNull();
    });

    it('should list all servers', () => {
      const servers = registry.listServers();

      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe('test-server');
    });

    it('should get servers by state', async () => {
      const config2: NpxServerConfig = {
        id: 'test-server-2',
        type: 'npx',
        package: '@example/test2',
        start: 'lazy',
      };

      const mockServer2 = new NpxMcpServer(config2);
      vi.mocked(NpxMcpServer).mockImplementationOnce(() => mockServer2);

      await registry.registerNpxServer(config2);

      const stoppedServers = registry.getServersByState(ServerState.STOPPED);
      expect(stoppedServers).toHaveLength(2);
    });
  });

  describe('server unregistration', () => {
    beforeEach(async () => {
      const config: NpxServerConfig = {
        id: 'test-server',
        type: 'npx',
        package: '@example/test',
        start: 'lazy',
      };

      const mockServer = new NpxMcpServer(config);
      vi.mocked(NpxMcpServer).mockImplementation(() => mockServer);
      vi.spyOn(mockServer, 'stop').mockResolvedValue();

      await registry.registerNpxServer(config);
    });

    it('should unregister a server', async () => {
      vi.mocked(mockWorkspaceManager.getWorkspaceByServerId).mockResolvedValue({
        id: 'workspace-1',
        path: '/tmp/workspace-1',
        serverId: 'test-server',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      });

      await registry.unregisterServer('test-server');

      const server = registry.getServer('test-server');
      expect(server).toBeNull();
    });

    it('should stop server before unregistering', async () => {
      const server = registry.getServer('test-server');
      if (!server?.instance) {
        throw new Error('Server or instance not found');
      }
      const stopSpy = vi.spyOn(server.instance, 'stop');

      vi.mocked(mockWorkspaceManager.getWorkspaceByServerId).mockResolvedValue({
        id: 'workspace-1',
        path: '/tmp/workspace-1',
        serverId: 'test-server',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      });

      await registry.unregisterServer('test-server');

      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      const configs: NpxServerConfig[] = [
        {
          id: 'server-1',
          type: 'npx',
          package: '@example/test1',
          start: 'lazy',
        },
        {
          id: 'server-2',
          type: 'npx',
          package: '@example/test2',
          start: 'lazy',
        },
      ];

      for (const config of configs) {
        const mockServer = new NpxMcpServer(config);
        vi.mocked(NpxMcpServer).mockImplementationOnce(() => mockServer);
        await registry.registerNpxServer(config);
      }
    });

    it('should return registry statistics', () => {
      const stats = registry.getStats();

      expect(stats.totalServers).toBe(2);
      expect(stats.serversByType.npx).toBe(2);
      expect(stats.serversByState[ServerState.STOPPED]).toBe(2);
      expect(stats.totalTools).toBe(0);
    });

    it('should count tools in statistics', async () => {
      // Update one server with tools
      const server = registry.getServer('server-1');
      if (server) {
        server.tools = ['tool1', 'tool2'];
      }

      const stats = registry.getStats();
      expect(stats.totalTools).toBe(2);
    });
  });

  describe('shutdown', () => {
    it('should stop all servers on shutdown', async () => {
      const configs: NpxServerConfig[] = [
        {
          id: 'server-1',
          type: 'npx',
          package: '@example/test1',
          start: 'lazy',
        },
        {
          id: 'server-2',
          type: 'npx',
          package: '@example/test2',
          start: 'lazy',
        },
      ];

      const stopSpies: ReturnType<typeof vi.spyOn>[] = [];

      for (const config of configs) {
        const mockServer = new NpxMcpServer(config);
        const stopSpy = vi.spyOn(mockServer, 'stop').mockResolvedValue();
        stopSpies.push(stopSpy);
        vi.mocked(NpxMcpServer).mockImplementationOnce(() => mockServer);
        await registry.registerNpxServer(config);
      }

      await registry.shutdown();

      for (const spy of stopSpies) {
        expect(spy).toHaveBeenCalled();
      }

      expect(registry.listServers()).toHaveLength(0);
    });
  });
});
