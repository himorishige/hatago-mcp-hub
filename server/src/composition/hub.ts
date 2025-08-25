/**
 * Hatago Hub
 *
 * Core hub implementation with mount/import capabilities.
 */

import { EventEmitter } from 'node:events';
import type { Transport } from '../protocol/index.js';
import { HatagoProtocolError, RPC_ERRORS } from '../protocol/index.js';
import { NameResolver, ServerNode } from '../proxy/index.js';
import type {
  CompositionEvents,
  CompositionManifest,
  ImportOptions,
  MountOptions,
  ServerConfig,
  TransportConfig,
} from './types.js';

export interface HatagoHubOptions {
  name?: string;
  maxServers?: number;
  defaultIsolation?: {
    timeoutMs?: number;
    maxConcurrent?: number;
  };
}

export class HatagoHub extends EventEmitter {
  public readonly name: string;
  private readonly nameResolver: NameResolver;
  private readonly options: Required<HatagoHubOptions>;
  private readonly mountedServers = new Map<string, ServerNode>();
  private readonly importedServers = new Map<string, ServerNode>();
  private _isInitialized = false;

  constructor(options: HatagoHubOptions = {}) {
    super();
    this.name = options.name ?? 'hatago-hub';
    this.nameResolver = new NameResolver();
    this.options = {
      name: this.name,
      maxServers: options.maxServers ?? 50,
      defaultIsolation: {
        timeoutMs: options.defaultIsolation?.timeoutMs ?? 30000,
        maxConcurrent: options.defaultIsolation?.maxConcurrent ?? 10,
        ...options.defaultIsolation,
      },
    };
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get serverCount(): number {
    return this.mountedServers.size + this.importedServers.size;
  }

  /**
   * Initialize the hub
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }

    try {
      // Initialize can set up default servers, load manifests, etc.
      this._isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error, 'initialization');
      throw error;
    }
  }

  /**
   * Mount a server dynamically (hot-attachable)
   */
  async mount(config: ServerConfig, options: MountOptions = {}): Promise<void> {
    this.validateInitialized();
    await this.validateServerConfig(config);

    const serverName = this.getEffectiveServerName(config.name, options.prefix);

    // Check for conflicts
    if (
      this.mountedServers.has(serverName) ||
      this.importedServers.has(serverName)
    ) {
      await this.handleNameConflict(serverName, options.overwrite ?? 'error');
    }

    // Check server limits
    if (this.serverCount >= this.options.maxServers) {
      throw HatagoProtocolError.systemError(
        `Cannot mount server: maximum server count (${this.options.maxServers}) reached`,
        { code: RPC_ERRORS.INTERNAL_ERROR },
      );
    }

    try {
      // Create transport and server node
      const transport = await this.createTransport(config.transport);
      const serverNode = new ServerNode({
        name: serverName,
        transport,
        capabilities: config.capabilities,
        isolation: { ...this.options.defaultIsolation, ...config.isolation },
        metadata: {
          ...config.metadata,
          mounted: true,
          dynamic: options.dynamic ?? true,
          mountOptions: options,
        },
      });

      // Connect and register
      await serverNode.connect();
      this.mountedServers.set(serverName, serverNode);
      this.nameResolver.registerServer(serverNode);

      this.emit('serverMounted', serverName, options);
    } catch (error) {
      this.emit('error', error, `mounting server ${serverName}`);
      throw HatagoProtocolError.fromError(error, { serverName });
    }
  }

  /**
   * Unmount a dynamically mounted server
   */
  async unmount(serverName: string): Promise<boolean> {
    this.validateInitialized();

    const server = this.mountedServers.get(serverName);
    if (!server) {
      return false;
    }

    try {
      await server.disconnect();
      this.mountedServers.delete(serverName);
      this.nameResolver.unregisterServer(serverName);

      this.emit('serverUnmounted', serverName);
      return true;
    } catch (error) {
      this.emit('error', error, `unmounting server ${serverName}`);
      throw HatagoProtocolError.fromError(error, { serverName });
    }
  }

  /**
   * Import a server statically (locked at startup)
   */
  async import_server(
    config: ServerConfig,
    options: ImportOptions = {},
  ): Promise<void> {
    this.validateInitialized();
    await this.validateServerConfig(config);

    const serverName = this.getEffectiveServerName(config.name, options.prefix);

    // Check for conflicts
    if (
      this.mountedServers.has(serverName) ||
      this.importedServers.has(serverName)
    ) {
      await this.handleNameConflict(serverName, options.overwrite ?? 'error');
    }

    // Check server limits
    if (this.serverCount >= this.options.maxServers) {
      throw HatagoProtocolError.systemError(
        `Cannot import server: maximum server count (${this.options.maxServers}) reached`,
        { code: RPC_ERRORS.INTERNAL_ERROR },
      );
    }

    try {
      // Create transport and server node
      const transport = await this.createTransport(config.transport);
      const serverNode = new ServerNode({
        name: serverName,
        transport,
        capabilities: config.capabilities,
        isolation: { ...this.options.defaultIsolation, ...config.isolation },
        metadata: {
          ...config.metadata,
          imported: true,
          static: options.static ?? true,
          importOptions: options,
        },
      });

      // Connect and register
      await serverNode.connect();
      this.importedServers.set(serverName, serverNode);
      this.nameResolver.registerServer(serverNode);

      this.emit('serverImported', serverName, options);
    } catch (error) {
      this.emit('error', error, `importing server ${serverName}`);
      throw HatagoProtocolError.fromError(error, { serverName });
    }
  }

  /**
   * Load servers from a composition manifest
   */
  async loadManifest(manifest: CompositionManifest): Promise<void> {
    this.validateInitialized();

    const errors: Error[] = [];

    // Import servers first (static)
    if (manifest.imports) {
      for (const [serverName, importOptions] of Object.entries(
        manifest.imports,
      )) {
        const serverConfig = manifest.servers[serverName];
        if (!serverConfig) {
          errors.push(
            new Error(`Import config references unknown server: ${serverName}`),
          );
          continue;
        }

        try {
          await this.import_server(serverConfig, importOptions);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    }

    // Then mount servers (dynamic)
    if (manifest.mounts) {
      for (const [serverName, mountOptions] of Object.entries(
        manifest.mounts,
      )) {
        const serverConfig = manifest.servers[serverName];
        if (!serverConfig) {
          errors.push(
            new Error(`Mount config references unknown server: ${serverName}`),
          );
          continue;
        }

        try {
          await this.mount(serverConfig, mountOptions);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    }

    if (errors.length > 0) {
      const aggregatedError = new AggregateError(
        errors,
        'Failed to load some servers from manifest',
      );
      this.emit('error', aggregatedError, 'manifest loading');
      throw aggregatedError;
    }

    this.emit('configReloaded', manifest);
  }

  /**
   * Call a tool on any registered server
   */
  async call(toolName: string, params?: unknown): Promise<unknown> {
    this.validateInitialized();

    try {
      const resolved = this.nameResolver.resolve(toolName);
      const server = this.nameResolver.getServer(resolved);

      return await server.call(resolved.toolName, params);
    } catch (error) {
      this.emit('error', error, `calling tool ${toolName}`);
      throw error;
    }
  }

  /**
   * List all available tools
   */
  listTools(): string[] {
    this.validateInitialized();

    const tools: string[] = [];

    for (const serverName of this.nameResolver.listServers()) {
      tools.push(...this.nameResolver.getAvailableTools(serverName));
    }

    return tools;
  }

  /**
   * List all registered servers
   */
  listServers(): Array<{
    name: string;
    type: 'mounted' | 'imported';
    state: string;
  }> {
    const servers: Array<{
      name: string;
      type: 'mounted' | 'imported';
      state: string;
    }> = [];

    for (const [name, server] of this.mountedServers) {
      servers.push({ name, type: 'mounted', state: server.state });
    }

    for (const [name, server] of this.importedServers) {
      servers.push({ name, type: 'imported', state: server.state });
    }

    return servers;
  }

  /**
   * Get detailed server information
   */
  getServerInfo(serverName: string): unknown {
    const server =
      this.mountedServers.get(serverName) ||
      this.importedServers.get(serverName);
    if (!server) {
      return null;
    }

    return {
      ...server.getServerInfo(),
      state: server.state,
      activeCalls: server.activeCalls,
      connectionAttempts: server.connectionAttempts,
      lastError: server.lastError?.message,
      isolation: server.isolation,
    };
  }

  /**
   * Shutdown the hub and all servers
   */
  async shutdown(): Promise<void> {
    const disconnections: Promise<void>[] = [];

    // Disconnect all mounted servers
    for (const server of this.mountedServers.values()) {
      disconnections.push(server.disconnect());
    }

    // Disconnect all imported servers
    for (const server of this.importedServers.values()) {
      disconnections.push(server.disconnect());
    }

    await Promise.allSettled(disconnections);

    this.mountedServers.clear();
    this.importedServers.clear();
    this._isInitialized = false;
  }

  private validateInitialized(): void {
    if (!this._isInitialized) {
      throw HatagoProtocolError.systemError(
        'Hub is not initialized. Call initialize() first.',
        { code: RPC_ERRORS.INTERNAL_ERROR },
      );
    }
  }

  private async validateServerConfig(config: ServerConfig): Promise<void> {
    if (!config.name || typeof config.name !== 'string') {
      throw HatagoProtocolError.userError(
        'Server config must have a valid name',
        { code: RPC_ERRORS.INVALID_PARAMS },
      );
    }

    if (!config.transport) {
      throw HatagoProtocolError.userError(
        'Server config must have transport configuration',
        { code: RPC_ERRORS.INVALID_PARAMS },
      );
    }
  }

  private getEffectiveServerName(baseName: string, prefix?: string): string {
    return prefix ? `${prefix}.${baseName}` : baseName;
  }

  private async handleNameConflict(
    serverName: string,
    overwrite: 'error' | 'warn' | 'silent',
  ): Promise<void> {
    switch (overwrite) {
      case 'error':
        throw HatagoProtocolError.systemError(
          `Server name ${serverName} already exists`,
          { code: RPC_ERRORS.INTERNAL_ERROR, serverName },
        );

      case 'warn':
        console.warn(`Warning: Overwriting existing server ${serverName}`);
      // falls through
      case 'silent':
        // Remove existing server
        await this.unmount(serverName);
        break;
    }
  }

  private async createTransport(config: TransportConfig): Promise<Transport> {
    const { TransportFactory } = await import('../transport/index.js');
    return TransportFactory.createTransport(config);
  }
}

declare interface HatagoHub {
  on<K extends keyof CompositionEvents>(
    event: K,
    listener: CompositionEvents[K],
  ): this;
  emit<K extends keyof CompositionEvents>(
    event: K,
    ...args: Parameters<CompositionEvents[K]>
  ): boolean;
}
