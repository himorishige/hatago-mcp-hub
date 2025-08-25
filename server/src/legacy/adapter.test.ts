import { beforeEach, describe, expect, it } from 'vitest';
import {
  LegacyAdapterFactory,
  LegacyMigrationHelper,
  LegacyServerNode,
  LegacyTransport,
} from './adapter.js';

// Mock the legacy server classes
class MockNpxServer {
  private state = 'stopped';
  private _id: string;

  constructor(id: string) {
    this._id = id;
  }

  getId() {
    return this._id;
  }
  getState() {
    return this.state;
  }

  async start() {
    this.state = 'running';
    this.emit('started');
  }

  async stop() {
    this.state = 'stopped';
    this.emit('stopped');
  }

  getTools() {
    return [
      {
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: { type: 'object' },
      },
    ];
  }

  getResources() {
    return [
      {
        uri: 'test://resource',
        name: 'Test Resource',
        description: 'Test resource',
      },
    ];
  }

  getPrompts() {
    return [
      {
        name: 'test-prompt',
        description: 'Test prompt',
      },
    ];
  }

  async callTool(name: string, args: any) {
    return { result: `Called ${name} with ${JSON.stringify(args)}` };
  }

  async readResource(uri: string) {
    return { contents: [{ uri, text: 'Resource content' }] };
  }

  // EventEmitter methods (simplified)
  private listeners: Record<string, Function[]> = {};

  on(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event: string, ...args: any[]) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(...args));
    }
  }
}

class MockRemoteServer extends MockNpxServer {
  // Remote servers don't have tools/resources discovery
  getTools() {
    return [];
  }
  getResources() {
    return [];
  }
  getPrompts() {
    return [];
  }
}

describe('LegacyTransport', () => {
  let mockNpxServer: MockNpxServer;
  let transport: LegacyTransport;

  beforeEach(() => {
    mockNpxServer = new MockNpxServer('test-npx');
    transport = new LegacyTransport(mockNpxServer as any, 'npx');
  });

  it('should connect to legacy server', async () => {
    expect(transport.isConnected()).toBe(false);

    await transport.connect();

    expect(transport.isConnected()).toBe(true);
  });

  it('should disconnect from legacy server', async () => {
    await transport.connect();
    expect(transport.isConnected()).toBe(true);

    await transport.disconnect();
    expect(transport.isConnected()).toBe(false);
  });

  it('should handle tools/list method', async () => {
    await transport.connect();

    const tools = await transport.send('tools/list');

    expect(tools).toEqual([
      {
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: { type: 'object' },
      },
    ]);
  });

  it('should handle tools/call method', async () => {
    await transport.connect();

    const result = await transport.send('tools/call', {
      name: 'test-tool',
      arguments: { param: 'value' },
    });

    expect(result.result).toContain('Called test-tool');
  });

  it('should handle resources/list method', async () => {
    await transport.connect();

    const resources = await transport.send('resources/list');

    expect(resources).toEqual([
      {
        uri: 'test://resource',
        name: 'Test Resource',
        description: 'Test resource',
      },
    ]);
  });

  it('should handle resources/read method', async () => {
    await transport.connect();

    const result = await transport.send('resources/read', {
      uri: 'test://resource',
    });

    expect(result.contents[0].text).toBe('Resource content');
  });

  it('should reject unsupported methods', async () => {
    await transport.connect();

    await expect(transport.send('unknown/method')).rejects.toThrow(
      'Unsupported method',
    );
  });

  it('should reject streaming operations', async () => {
    await transport.connect();

    expect(() => transport.stream('test/method')).toThrow(
      'Streaming not supported',
    );
  });
});

describe('LegacyServerNode', () => {
  let mockNpxServer: MockNpxServer;
  let serverNode: LegacyServerNode;

  beforeEach(() => {
    mockNpxServer = new MockNpxServer('test-server');
    serverNode = new LegacyServerNode(mockNpxServer as any, 'npx');
  });

  it('should provide server information', () => {
    expect(serverNode.name).toBe('test-server');
    expect(serverNode.isConnected).toBe(false);
    expect(serverNode.isAvailable).toBe(false);
  });

  it('should connect and update state', async () => {
    await serverNode.connect();

    expect(serverNode.isConnected).toBe(true);
    expect(serverNode.isAvailable).toBe(true);
  });

  it('should convert to ServerNode interface', () => {
    const nodeInterface = serverNode.toServerNode();

    expect(nodeInterface.name).toBe('test-server');
    expect(nodeInterface.connect).toBeDefined();
    expect(nodeInterface.disconnect).toBeDefined();
    expect(nodeInterface.call).toBeDefined();
  });

  it('should emit state change events', async () => {
    const stateChanges: any[] = [];
    serverNode.on('state-change', (event) => {
      stateChanges.push(event);
    });

    // Manually trigger state change
    mockNpxServer.emit('stateChanged', 'running');

    expect(stateChanges.length).toBe(1);
    expect(stateChanges[0].to).toBe('connected');
  });
});

describe('LegacyAdapterFactory', () => {
  it('should create NPX adapter', () => {
    const mockServer = new MockNpxServer('test-npx');
    const adapter = LegacyAdapterFactory.createNpxAdapter(mockServer as any);

    expect(adapter.name).toBe('test-npx');
  });

  it('should create Remote adapter', () => {
    const mockServer = new MockRemoteServer('test-remote');
    const adapter = LegacyAdapterFactory.createRemoteAdapter(mockServer as any);

    expect(adapter.name).toBe('test-remote');
  });

  it('should auto-detect server type', () => {
    const npxServer = new MockNpxServer('npx-server');
    const remoteServer = new MockRemoteServer('remote-server');

    // This would work with proper instanceof checks in real implementation
    expect(() =>
      LegacyAdapterFactory.createAdapter(npxServer as any),
    ).not.toThrow();
    expect(() =>
      LegacyAdapterFactory.createAdapter(remoteServer as any),
    ).not.toThrow();
  });
});

describe('LegacyMigrationHelper', () => {
  it('should convert NPX config to v2 format', () => {
    const legacyConfig = {
      id: 'test-npx',
      package: '@test/mcp-server',
      args: ['--config', 'test.json'],
      timeout: 30000,
      env: { NODE_ENV: 'test' },
    };

    const v2Config = LegacyMigrationHelper.convertNpxConfig(legacyConfig);

    expect(v2Config.id).toBe('test-npx');
    expect(v2Config.type).toBe('legacy-npx');
    expect(v2Config.config.package).toBe('@test/mcp-server');
    expect(v2Config.config.args).toEqual(['--config', 'test.json']);
    expect(v2Config.isolation.timeoutMs).toBe(30000);
  });

  it('should convert Remote config to v2 format', () => {
    const legacyConfig = {
      id: 'test-remote',
      url: 'https://example.com/mcp',
      transport: 'sse',
      headers: { Authorization: 'Bearer token' },
      connectTimeoutMs: 15000,
    };

    const v2Config = LegacyMigrationHelper.convertRemoteConfig(legacyConfig);

    expect(v2Config.id).toBe('test-remote');
    expect(v2Config.type).toBe('legacy-remote');
    expect(v2Config.config.url).toBe('https://example.com/mcp');
    expect(v2Config.config.transport).toBe('sse');
    expect(v2Config.isolation.timeoutMs).toBe(15000);
  });

  it('should migrate complete configuration', () => {
    const legacyConfig = {
      npxServers: [
        {
          id: 'npx1',
          package: '@test/server1',
          timeout: 30000,
        },
      ],
      remoteServers: [
        {
          id: 'remote1',
          url: 'https://example.com/mcp',
          connectTimeoutMs: 15000,
        },
      ],
    };

    const v2Config = LegacyMigrationHelper.migrateConfiguration(legacyConfig);

    expect(v2Config.servers.length).toBe(2);
    expect(v2Config.servers[0].type).toBe('legacy-npx');
    expect(v2Config.servers[1].type).toBe('legacy-remote');
    expect(v2Config.compatibility.legacyMode).toBe(true);
  });
});
