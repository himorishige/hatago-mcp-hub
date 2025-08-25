/**
 * Legacy Adapter
 *
 * Integrates existing NPX and Remote MCP servers into the v2 architecture.
 * Provides compatibility layer for old server implementations.
 */

import { EventEmitter } from 'node:events';
import { logger } from '../observability/structured-logger.js';
import type { Capabilities, Transport } from '../protocol/index.js';
import type { ServerNode } from '../proxy/server-node.js';
import { NpxMcpServer } from '../servers/npx-mcp-server.js';
import { RemoteMcpServer } from '../servers/remote-mcp-server.js';

/**
 * State mapping between legacy and v2 systems
 */
const StateMapping = {
  // NPX/Remote states -> ServerNode states
  stopped: 'disconnected',
  starting: 'connecting',
  initialized: 'connecting',
  tools_discovering: 'connecting',
  tools_ready: 'connecting',
  running: 'connected',
  stopping: 'disconnected',
  crashed: 'failed',
} as const;

/**
 * Transport adapter for legacy stdio/SSE connections
 */
export class LegacyTransport extends EventEmitter implements Transport {
  private _isConnected = false;
  private _capabilities: Capabilities = {};

  constructor(
    private legacyServer: NpxMcpServer | RemoteMcpServer,
    private serverType: 'npx' | 'remote',
  ) {
    super();
    this.setupEventHandlers();
  }

  async connect(): Promise<void> {
    try {
      await this.legacyServer.start();
      this._isConnected = true;
      this.emit('connect');

      // Update capabilities from legacy server
      if (this.serverType === 'npx') {
        const npxServer = this.legacyServer as NpxMcpServer;
        this._capabilities = {
          tools: npxServer.getTools().reduce((acc, tool) => {
            acc[tool.name] = {
              description: tool.description,
              inputSchema: tool.inputSchema,
            };
            return acc;
          }, {} as any),
          resources: npxServer.getResources().reduce((acc, resource) => {
            acc[resource.uri] = {
              name: resource.name,
              description: resource.description,
              mimeType: resource.mimeType,
            };
            return acc;
          }, {} as any),
          prompts: npxServer.getPrompts().reduce((acc, prompt) => {
            acc[prompt.name] = {
              description: prompt.description,
              arguments: prompt.arguments,
            };
            return acc;
          }, {} as any),
        };
      }

      logger.info('Legacy transport connected', {
        serverType: this.serverType,
        serverId: this.legacyServer.getId(),
      });
    } catch (error) {
      this._isConnected = false;
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.legacyServer.stop();
      this._isConnected = false;
      this.emit('disconnect');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  getCapabilities(): Capabilities {
    return this._capabilities;
  }

  async send<T = any>(method: string, params?: any): Promise<T> {
    if (!this._isConnected) {
      throw new Error('Transport not connected');
    }

    try {
      // Route different MCP methods to legacy server methods
      switch (method) {
        case 'tools/list':
          if (this.serverType === 'npx') {
            return (this.legacyServer as NpxMcpServer).getTools() as T;
          }
          // Remote servers don't have direct tool listing
          return [] as T;

        case 'tools/call':
          return (await this.legacyServer.callTool(
            params.name,
            params.arguments,
          )) as T;

        case 'resources/list':
          if (this.serverType === 'npx') {
            return (this.legacyServer as NpxMcpServer).getResources() as T;
          }
          return [] as T;

        case 'resources/read':
          return (await this.legacyServer.readResource(params.uri)) as T;

        case 'prompts/list':
          if (this.serverType === 'npx') {
            return (this.legacyServer as NpxMcpServer).getPrompts() as T;
          }
          return [] as T;

        case 'prompts/get':
          // Legacy servers don't have direct prompt support
          throw new Error('Prompts not supported by legacy server');

        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  // Stream methods - legacy servers don't support streaming
  async *stream(_method: string, _params?: any): AsyncGenerator<any> {
    throw new Error('Streaming not supported by legacy transport');
  }

  cancel(id: string): void {
    // Legacy servers don't support cancellation
    logger.warn('Cancellation not supported by legacy transport', { id });
  }

  onError(handler: (error: Error) => void): void {
    this.on('error', handler);
  }

  onClose(handler: () => void): void {
    this.on('disconnect', handler);
  }

  private setupEventHandlers(): void {
    // Map legacy server events to transport events
    this.legacyServer.on('started', () => {
      this._isConnected = true;
      this.emit('connect');
    });

    this.legacyServer.on('stopped', () => {
      this._isConnected = false;
      this.emit('disconnect');
    });

    this.legacyServer.on('crashed', (error: Error) => {
      this._isConnected = false;
      this.emit('error', error);
      this.emit('disconnect');
    });

    this.legacyServer.on('error', (error: Error) => {
      this.emit('error', error);
    });

    // NPX specific events
    if (this.serverType === 'npx') {
      const npxServer = this.legacyServer as NpxMcpServer;

      npxServer.on('toolsReady', () => {
        // Update capabilities when tools are discovered
        this._capabilities.tools = npxServer.getTools().reduce((acc, tool) => {
          acc[tool.name] = {
            description: tool.description,
            inputSchema: tool.inputSchema,
          };
          return acc;
        }, {} as any);

        this.emit('capabilities-updated', this._capabilities);
      });
    }
  }
}

/**
 * Server Node adapter for legacy servers
 */
export class LegacyServerNode extends EventEmitter {
  private transport: LegacyTransport;
  private _state: string = 'disconnected';

  constructor(
    private legacyServer: NpxMcpServer | RemoteMcpServer,
    serverType: 'npx' | 'remote',
  ) {
    super();
    this.transport = new LegacyTransport(legacyServer, serverType);
    this.setupStateMapping();
  }

  get name(): string {
    return this.legacyServer.getId();
  }

  get state(): string {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === 'connected';
  }

  get isAvailable(): boolean {
    return this.isConnected;
  }

  getCapabilities(): Capabilities {
    return this.transport.getCapabilities();
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  async call<T = any>(method: string, params?: any): Promise<T> {
    return await this.transport.send<T>(method, params);
  }

  // Convert to ServerNode-compatible interface
  toServerNode(): Partial<ServerNode> {
    return {
      name: this.name,
      transport: this.transport as any, // Type assertion for compatibility
      isConnected: this.isConnected,
      isAvailable: this.isAvailable,
      capabilities: this.getCapabilities(),
      connect: this.connect.bind(this),
      disconnect: this.disconnect.bind(this),
      call: this.call.bind(this),
    };
  }

  private setupStateMapping(): void {
    // Map legacy server state changes to v2 states
    this.legacyServer.on('stateChanged', (newState: string) => {
      const mappedState =
        StateMapping[newState as keyof typeof StateMapping] || 'disconnected';

      if (mappedState !== this._state) {
        const previousState = this._state;
        this._state = mappedState;

        this.emit('state-change', {
          from: previousState,
          to: this._state,
          server: this.name,
        });

        logger.debug('Legacy server state mapped', {
          server: this.name,
          legacyState: newState,
          mappedState: this._state,
        });
      }
    });

    // Direct state monitoring for servers without stateChanged events
    const checkState = () => {
      const currentState = this.legacyServer.getState();
      const mappedState =
        StateMapping[currentState as keyof typeof StateMapping] ||
        'disconnected';

      if (mappedState !== this._state) {
        const previousState = this._state;
        this._state = mappedState;

        this.emit('state-change', {
          from: previousState,
          to: this._state,
          server: this.name,
        });
      }
    };

    // Poll state every 5 seconds
    setInterval(checkState, 5000);
  }
}

/**
 * Factory for creating legacy adapters
 */
export class LegacyAdapterFactory {
  /**
   * Create adapter for NPX server
   */
  static createNpxAdapter(npxServer: NpxMcpServer): LegacyServerNode {
    return new LegacyServerNode(npxServer, 'npx');
  }

  /**
   * Create adapter for Remote server
   */
  static createRemoteAdapter(remoteServer: RemoteMcpServer): LegacyServerNode {
    return new LegacyServerNode(remoteServer, 'remote');
  }

  /**
   * Auto-detect server type and create appropriate adapter
   */
  static createAdapter(
    server: NpxMcpServer | RemoteMcpServer,
  ): LegacyServerNode {
    if (server instanceof NpxMcpServer) {
      return LegacyAdapterFactory.createNpxAdapter(server);
    } else if (server instanceof RemoteMcpServer) {
      return LegacyAdapterFactory.createRemoteAdapter(server);
    } else {
      throw new Error('Unsupported legacy server type');
    }
  }
}

/**
 * Migration helper for existing configurations
 */
export class LegacyMigrationHelper {
  /**
   * Convert legacy NPX config to v2 server config
   */
  static convertNpxConfig(legacyConfig: any) {
    return {
      id: legacyConfig.id,
      type: 'legacy-npx' as const,
      name: legacyConfig.package || legacyConfig.id,
      config: {
        package: legacyConfig.package,
        args: legacyConfig.args || [],
        cwd: legacyConfig.cwd,
        timeout: legacyConfig.timeout,
        env: legacyConfig.env || {},
      },
      isolation: {
        timeoutMs: legacyConfig.timeout || 30000,
        maxConcurrent: legacyConfig.maxConcurrent || 10,
      },
    };
  }

  /**
   * Convert legacy Remote config to v2 server config
   */
  static convertRemoteConfig(legacyConfig: any) {
    return {
      id: legacyConfig.id,
      type: 'legacy-remote' as const,
      name: legacyConfig.url,
      config: {
        url: legacyConfig.url,
        transport: legacyConfig.transport || 'sse',
        headers: legacyConfig.headers || {},
        connectTimeout: legacyConfig.connectTimeoutMs,
        healthCheck: legacyConfig.healthCheck,
      },
      isolation: {
        timeoutMs: legacyConfig.connectTimeoutMs || 30000,
        maxConcurrent: legacyConfig.maxConcurrent || 10,
      },
    };
  }

  /**
   * Migrate entire legacy configuration to v2
   */
  static migrateConfiguration(legacyConfig: any) {
    const v2Config = {
      servers: [] as any[],
      compatibility: {
        legacyMode: true,
        enableV1Api: true,
      },
    };

    // Migrate NPX servers
    if (legacyConfig.npxServers) {
      for (const npxConfig of legacyConfig.npxServers) {
        v2Config.servers.push(
          LegacyMigrationHelper.convertNpxConfig(npxConfig),
        );
      }
    }

    // Migrate Remote servers
    if (legacyConfig.remoteServers) {
      for (const remoteConfig of legacyConfig.remoteServers) {
        v2Config.servers.push(
          LegacyMigrationHelper.convertRemoteConfig(remoteConfig),
        );
      }
    }

    return v2Config;
  }
}
