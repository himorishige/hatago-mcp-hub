/**
 * HatagoHub - User-friendly facade for MCP Hub
 */

import type { FSWatcher } from 'node:fs';
import {
  createPromptRegistry,
  createResourceRegistry,
  type PromptRegistry,
  type ResourceRegistry,
  SessionManager,
  ToolInvoker,
  ToolRegistry
} from '@himorishige/hatago-runtime';
import type { Tool } from '@himorishige/hatago-core';
import { RPC_NOTIFICATION as CORE_RPC_NOTIFICATION } from '@himorishige/hatago-core';
const FALLBACK_RPC_NOTIFICATION = {
  initialized: 'notifications/initialized',
  cancelled: 'notifications/cancelled',
  progress: 'notifications/progress',
  tools_list_changed: 'notifications/tools/list_changed'
} as const;
const RPC_NOTIFICATION = CORE_RPC_NOTIFICATION ?? FALLBACK_RPC_NOTIFICATION;
import type { RelayTransport } from '@himorishige/hatago-transport';
import { type ITransport, createRelayHttpTransport } from '@himorishige/hatago-transport';
import * as ToolsApi from './api/tools.js';
import * as ResourcesApi from './api/resources.js';
import * as PromptsApi from './api/prompts.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ServerConfig } from '@himorishige/hatago-core/schemas';
import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
// import { UnsupportedFeatureError } from './errors.js'; // moved to transport-factory
import { Logger } from './logger.js';
// Notifications are handled outside base hub (Enhanced only)
import { SSEManager } from './sse-manager.js';
// Management server types removed with internal tools/resources simplification [SF]
import type {
  CallOptions,
  ConnectedServer,
  HubEvent,
  HubEventData,
  HubEventHandler,
  HubOptions,
  ListOptions,
  ReadOptions,
  ServerSpec
} from './types.js';
import { createEventEmitter, type EventEmitter as HubEventEmitter } from './utils/events.js';

import { CapabilityRegistry } from './capability-registry.js';
import { connectWithRetry, normalizeServerSpec } from './client/connector.js';
import { createTransportFactory } from './client/transport-factory.js';
import { attachClientNotificationForwarder } from './client/notifier.js';
import {
  registerServerTools,
  registerServerResources,
  registerServerPrompts
} from './client/registrar.js';
// Internal tools removed. Keep minimal internal resources only. [SF]
import type { Resource } from '@himorishige/hatago-core';

/**
 * Main Hub class - provides simplified API for MCP operations
 */
export class HatagoHub {
  // Core components
  protected sessions: SessionManager;
  protected toolRegistry: ToolRegistry;
  protected toolInvoker: ToolInvoker;
  protected resourceRegistry: ResourceRegistry;
  protected promptRegistry: PromptRegistry;
  protected capabilityRegistry: CapabilityRegistry;

  // Server management
  protected servers = new Map<string, ConnectedServer>();
  protected clients = new Map<string, Client>();

  // Event emitter (extracted)
  private events: HubEventEmitter<HubEvent, unknown>;

  // Logger
  protected logger: Logger;

  // SSE Manager
  private sseManager: SSEManager;

  // StreamableHTTP Transport
  private streamableTransport?: RelayTransport;

  // Notification Manager removed from base hub

  // Config file watcher
  private configWatcher?: FSWatcher;

  // Sampling bridge removed

  // Options
  protected options: {
    configFile: string;
    preloadedConfig?: { path?: string; data: object };
    watchConfig: boolean;
    sessionTTL: number;
    defaultTimeout: number;
    namingStrategy: 'none' | 'namespace' | 'prefix';
    separator: string;
    tags?: string[];
    enableStreamableTransport: boolean;
  };

  // Notification callback for forwarding to parent
  public onNotification?: (notification: unknown) => Promise<void>;

  // Toolset versioning
  private toolsetRevision = 0;
  private toolsetHash = '';

  // Startup wait removed to keep hub thin [SF]

  // Notification sink tracking removed with handler extraction

  constructor(options: HubOptions = {}) {
    this.options = {
      configFile: options.configFile ?? '',
      preloadedConfig: options.preloadedConfig ?? undefined,
      watchConfig: options.watchConfig ?? false,
      sessionTTL: options.sessionTTL ?? 3600,
      defaultTimeout: options.defaultTimeout ?? 30000,
      namingStrategy: options.namingStrategy ?? 'namespace',
      separator: options.separator ?? '_',
      tags: options.tags,
      enableStreamableTransport: options.enableStreamableTransport ?? true
    };

    // Initialize logger
    this.logger = new Logger('[Hub]');
    // Initialize event emitter
    this.events = createEventEmitter<HubEvent, unknown>(this.logger);

    // Initialize SSE manager
    this.sseManager = new SSEManager(this.logger);

    // Initialize components with standard implementations
    this.sessions = new SessionManager(this.options.sessionTTL);
    this.toolRegistry = new ToolRegistry({
      namingConfig: {
        strategy: this.options.namingStrategy,
        separator: this.options.separator
      }
    });
    this.toolInvoker = new ToolInvoker(
      this.toolRegistry,
      {
        timeout: this.options.defaultTimeout
      },
      this.sseManager
    );
    this.resourceRegistry = createResourceRegistry();
    this.promptRegistry = createPromptRegistry();
    this.capabilityRegistry = new CapabilityRegistry();

    // Initialize RelayTransport when enabled
    if (this.options.enableStreamableTransport) {
      this.logger.info('Using RelayTransport implementation');
      this.streamableTransport = createRelayHttpTransport({
        sessionId: crypto.randomUUID(),
        debug: false
      }) as RelayTransport;
    }
  }

  /**
   * Add and connect to a server
   */
  async addServer(
    id: string,
    spec: ServerSpec,
    options?: { suppressToolListNotification?: boolean }
  ): Promise<this> {
    if (this.servers.has(id)) {
      throw new Error(`Server ${id} already exists`);
    }

    // Store server info
    this.servers.set(id, {
      id,
      spec,
      status: 'connecting',
      tools: [],
      resources: [],
      prompts: []
    });

    try {
      await this.connectServer(id, spec);
      this.emit('server:connected', { serverId: id });
    } catch (error) {
      const server = this.servers.get(id);
      if (server) {
        server.status = 'error';
        server.error = error as Error;
      } else {
        this.logger.error(`Server ${id} missing from registry when marking error`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      this.emit('server:error', { serverId: id, error });
      throw error;
    }

    // Notify clients that tools are available after startup
    // Some MCP clients only recognize the first notification.
    // During startup, allow caller to batch notifications. [REH][ISA]
    if (!options?.suppressToolListNotification) {
      await this.sendToolListChangedNotification();
    }

    return this;
  }

  /**
   * Remove a server
   */
  async removeServer(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client) {
      try {
        await client.close();
      } catch (error) {
        this.logger.error(`Failed to close client ${id}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      this.clients.delete(id);
    }

    const server = this.servers.get(id);
    if (server) {
      // Unregister tools
      if (server.tools.length > 0) {
        this.toolRegistry.clearServerTools(id);
        for (const tool of server.tools) {
          this.toolInvoker.unregisterHandler(tool.name);
        }
      }

      // Unregister resources
      if (server.resources.length > 0) {
        this.resourceRegistry.clearServerResources(id);
      }

      // Unregister prompts
      if (server.prompts.length > 0) {
        this.promptRegistry.unregisterServerPrompts(id);
      }

      this.servers.delete(id);
      this.emit('server:disconnected', { serverId: id });
    }
  }

  /**
   * Connect to a server
   */
  private async connectServer(id: string, spec: ServerSpec): Promise<void> {
    // Mask sensitive headers before logging
    const maskedSpec: ServerSpec = {
      ...spec,
      headers: spec.headers
        ? Object.fromEntries(
            Object.entries(spec.headers).map(([k, v]) =>
              k.toLowerCase() === 'authorization'
                ? [k, typeof v === 'string' ? v.replace(/^(Bearer\s+).+$/, '$1***') : '***']
                : [k, v]
            )
          )
        : undefined
    };
    this.logger.info(`Connecting to server: ${id}`, { spec: maskedSpec });

    // Create transport factory based on spec (extracted) [SF]
    const createTransport = createTransportFactory(id, spec, this.logger);

    // Connect with retry logic
    const client = await connectWithRetry({
      id,
      createTransport: createTransport as unknown as () => Promise<ITransport>,
      maxRetries: 3,
      connectTimeoutMs: spec.connectTimeout,
      logger: this.logger
    });

    // Store client
    this.clients.set(id, client);

    // Attach unified notification forwarder
    attachClientNotificationForwarder(
      {
        logger: this.logger,
        emit: this.emit.bind(this),
        onNotification: this.onNotification?.bind(this),
        getStreamableTransport: this.getStreamableTransport.bind(this)
      },
      client,
      id
    );

    // Update server status
    const server = this.servers.get(id);
    if (server) {
      server.status = 'connected';
    } else {
      this.logger.warn(`Server ${id} not found when updating status to connected`);
    }

    // Register tools using extracted registrar
    {
      const requestTimeoutMs = spec.timeout ?? this.options.defaultTimeout;
      this.logger.debug('Before registerServerTools - checking toolInvoker:', {
        hasListTools:
          'listTools' in this.toolInvoker &&
          typeof (this.toolInvoker as { listTools?: unknown }).listTools === 'function',
        toolInvokerType: this.toolInvoker?.constructor?.name || 'unknown'
      });
      await registerServerTools(this as never, client, id, requestTimeoutMs);
    }

    await registerServerResources(this as never, client, id);

    await registerServerPrompts(this as never, client, id);
  }

  /**
   * Start the hub
   */
  async start(): Promise<this> {
    // Register minimal internal resources (no internal tools/prompts)
    this.registerInternalResources();

    // Startup gate removed

    // Load config if provided
    if (this.options.configFile || this.options.preloadedConfig) {
      try {
        // Use preloaded config if available, otherwise read from file
        let config: {
          notifications?: {
            enabled?: boolean;
            rateLimitSec?: number;
            severity?: string[];
          };
          mcpServers?: Record<
            string,
            {
              disabled?: boolean;
              hatagoOptions?: {
                start?: string;
                timeout?: number;
              };
              command?: string;
              args?: string[];
              env?: Record<string, string>;
              cwd?: string;
              url?: string;
              transport?: {
                type?: string;
              };
              headers?: Record<string, string>;
              timeouts?: {
                connectMs?: number;
                requestMs?: number;
                keepAliveMs?: number;
              };
              [key: string]: unknown;
            }
          >;
          timeouts?: {
            connectMs?: number;
            requestMs?: number;
            keepAliveMs?: number;
          };
        };

        // Determine config source: preloaded (with extends processed) > direct file > empty
        if (this.options.preloadedConfig?.data) {
          // Use preloaded config which has already processed extends/inheritance
          config = this.options.preloadedConfig.data as typeof config;
          this.logger.debug('Using preloaded config with extends processed');
        } else if (this.options.configFile) {
          // Fallback: Read config file directly (no extends processing)
          const { readFileSync } = await import('node:fs');
          const { resolve } = await import('node:path');

          const configPath = resolve(this.options.configFile);
          const configContent = readFileSync(configPath, 'utf-8');
          config = JSON.parse(configContent) as typeof config;
          this.logger.debug('Reading config file directly (no extends processing)');
        } else {
          // Edge case: Neither preloaded nor file config available
          this.logger.warn('No configuration source available, using empty config');
          config = {};
        }

        // Base hub: notifications are not managed here

        // Apply global timeouts to ToolInvoker default timeout if provided
        if (config.timeouts?.requestMs && Number.isFinite(config.timeouts.requestMs)) {
          // Recreate ToolInvoker with new default timeout before connecting servers
          this.toolInvoker = new ToolInvoker(
            this.toolRegistry,
            {
              timeout: config.timeouts.requestMs
            },
            this.sseManager
          );
          // Also reflect to options for consistency
          this.options.defaultTimeout = config.timeouts.requestMs;
        }

        // Apply keepAliveMs to StreamableHTTP transport and start it
        this.logger.debug('[Hub] Checking streamableTransport before start', {
          hasTransport: !!this.streamableTransport
        });
        if (this.streamableTransport) {
          if (config.timeouts?.keepAliveMs && Number.isFinite(config.timeouts.keepAliveMs)) {
            this.streamableTransport.setKeepAliveMs(config.timeouts.keepAliveMs);
          }
          this.logger.debug('[Hub] Calling streamableTransport.start()');
          await this.streamableTransport.start();
          this.logger.debug('[Hub] streamableTransport.start() completed');
          this.streamableTransport.onmessage = (message) => {
            void (async () => {
              const result = await this.handleJsonRpcRequest(message as JSONRPCMessage);
              if (result && this.streamableTransport) {
                // RelayTransport has overloaded send method that accepts JSONRPCMessage
                const transport = this.streamableTransport as RelayTransport & {
                  send(message: JSONRPCMessage): Promise<void>;
                };
                await transport.send(result as JSONRPCMessage);
              }
            })();
          };
        }

        // Process MCP servers from config
        if (config.mcpServers) {
          const connectPromises: Array<Promise<void>> = [];
          for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
            // Skip disabled servers
            if (serverConfig.disabled === true) {
              this.logger.info(`Skipping disabled server: ${id}`);
              continue;
            }

            // Check tag filtering
            if (this.options.tags && this.options.tags.length > 0) {
              const serverTags = (serverConfig as unknown as { tags?: string[] }).tags ?? [];
              const hasMatchingTag = this.options.tags.some((tag) => serverTags.includes(tag));

              if (!hasMatchingTag) {
                this.logger.info(`Skipping server ${id} (no matching tags)`, {
                  requiredTags: this.options.tags,
                  serverTags
                });
                continue;
              }
            }

            const spec = this.normalizeServerSpec(serverConfig as ServerConfig);

            // Check if server should be started eagerly
            const hatagoOptions = serverConfig.hatagoOptions ?? {};
            if (hatagoOptions.start !== 'lazy') {
              const task = (async () => {
                try {
                  // Suppress tools list notifications during startup; send once later
                  await this.addServer(id, spec, { suppressToolListNotification: true });
                  this.logger.info(`Connected to server: ${id}`);
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  this.logger.error(`Failed to connect to server ${id}`, {
                    error: errorMessage
                  });
                  // Continue with other servers
                }
              })();
              connectPromises.push(task);
            }
          }
          // After all eager server connections, send tools/list_changed once
          await Promise.allSettled(connectPromises);
          await this.sendToolListChangedNotification();
        }
      } catch (error) {
        // Only log debug level for file not found errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('ENOENT')) {
          this.logger.debug('Config file not found', {
            path: this.options.configFile
          });
        } else {
          this.logger.error('Failed to load config file', {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined
          });
        }
        throw error;
      }

      // Set up config file watching if enabled
      this.logger.info('[Hub] Config watch mode', {
        watchConfig: this.options.watchConfig
      });
      if (this.options.watchConfig) {
        const { startConfigWatcher } = await import('./config/watch.js');
        await startConfigWatcher(this);
      }
    }
    // No config file case: start StreamableHTTP transport with defaults
    else if (this.streamableTransport) {
      await this.streamableTransport.start();
      this.streamableTransport.onmessage = (message) => {
        void (async () => {
          const result = await this.handleJsonRpcRequest(message as JSONRPCMessage);
          if (result && this.streamableTransport) {
            // RelayTransport has overloaded send method that accepts JSONRPCMessage
            const transport = this.streamableTransport as RelayTransport & {
              send(message: JSONRPCMessage): Promise<void>;
            };
            await transport.send(result as JSONRPCMessage);
          }
        })();
      };
      // No servers configured: nothing else to do
    }

    return this;
  }

  /**
   * Normalize server spec from config format
   */
  private normalizeServerSpec(config: ServerConfig): ServerSpec {
    return normalizeServerSpec(config);
  }

  /**
   * Register minimal internal resources only
   * Keep hub thin: no internal tools/prompts. [SF][DM]
   */
  private registerInternalResources(): void {
    const resources: Resource[] = [
      {
        uri: 'hatago://servers',
        name: 'Connected Servers',
        description: 'List of currently connected MCP servers',
        mimeType: 'application/json'
      }
    ];

    this.logger.info('[Hub] Registering internal resources', { count: resources.length });
    this.resourceRegistry.registerServerResources('_internal', resources);
  }

  /**
   * Calculate hash of current toolset
   */
  private async calculateToolsetHash(): Promise<string> {
    const tools = this.tools.list();
    const toolData = tools.map((t) => {
      const tool = t as Tool;
      const toolInfo = {
        name: String(tool.name),
        description: String(tool.description ?? '')
      };
      return toolInfo;
    });
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(JSON.stringify(toolData)).digest('hex').substring(0, 16);
  }

  /**
   * Send tools/list_changed notification
   */
  private async sendToolListChangedNotification(): Promise<void> {
    // Debug: Check toolInvoker before using it
    this.logger.debug('sendToolListChangedNotification - toolInvoker check:', {
      hasListTools:
        'listTools' in this.toolInvoker &&
        typeof (this.toolInvoker as { listTools?: unknown }).listTools === 'function',
      toolInvokerType: this.toolInvoker?.constructor?.name || 'unknown'
    });

    this.toolsetRevision++;
    this.toolsetHash = await this.calculateToolsetHash();

    const notification = {
      jsonrpc: '2.0' as const,
      method: RPC_NOTIFICATION.tools_list_changed,
      params: {
        revision: this.toolsetRevision,
        hash: this.toolsetHash
      }
    };

    this.logger.info('[Hub] Sending tools/list_changed notification', {
      revision: this.toolsetRevision,
      hash: this.toolsetHash
    });

    // Send to parent if available (STDIO mode)
    if (this.onNotification) {
      await this.onNotification(notification);
    }

    // Send to StreamableHTTP clients
    if (this.streamableTransport) {
      try {
        // RelayTransport has overloaded send method that accepts notifications
        const transport = this.streamableTransport as RelayTransport & {
          send(notification: { jsonrpc: '2.0'; method: string; params: unknown }): Promise<void>;
        };
        await transport.send(notification);
      } catch (error) {
        this.logger.warn('[Hub] Failed to send notification to client', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  // Config watcher moved to config/watch.ts

  // Reload configuration helper moved: use doReloadConfig()

  /**
   * Stop the hub
   */
  async stop(): Promise<void> {
    // Stop config watcher if exists
    if (this.configWatcher) {
      this.configWatcher.close();
      this.configWatcher = undefined;
    }

    // Disconnect all servers
    for (const [id, client] of this.clients) {
      try {
        await client.close();
      } catch (error) {
        this.logger.error(`Failed to close client ${id}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.clients.clear();
    this.servers.clear();
    this.sessions.stop();

    // Close StreamableHTTP transport if enabled to release timers/sockets
    if (this.streamableTransport) {
      try {
        await this.streamableTransport.close();
      } catch (error) {
        this.logger.warn('[Hub] Error while closing StreamableHTTP transport', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Tools API
   */
  tools = {
    /**
     * List available tools
     */
    list: (options?: ListOptions) =>
      ToolsApi.listTools(this as unknown as ToolsApi.ToolsHub, options),

    /**
     * Call a tool
     */
    call: async (
      name: string,
      args: unknown,
      options?: CallOptions & {
        progressToken?: string;
        progressCallback?: unknown;
      }
    ) => ToolsApi.callTool(this as unknown as ToolsApi.ToolsHub, name, args, options)
  };

  /**
   * Resources API
   */
  resources: {
    list: (options?: ListOptions) => unknown[];
    read: (uri: string, options?: ReadOptions) => Promise<unknown>;
  } = {
    /**
     * List available resources
     */
    list: (options?: ListOptions) =>
      ResourcesApi.listResources(this as unknown as ResourcesApi.ResourcesHub, options),

    /**
     * Read a resource
     */
    read: async (uri: string, options?: ReadOptions) =>
      ResourcesApi.readResource(this as unknown as ResourcesApi.ResourcesHub, uri, options)
  };

  /**
   * Prompts API
   */
  prompts: {
    list: (options?: ListOptions) => unknown[];
    get: (name: string, args?: unknown) => Promise<unknown>;
  } = {
    /**
     * List available prompts
     */
    list: (options?: ListOptions) =>
      PromptsApi.listPrompts(this as unknown as PromptsApi.PromptsHub, options),

    /**
     * Get a prompt
     */
    get: async (name: string, args?: unknown) =>
      PromptsApi.getPrompt(this as unknown as PromptsApi.PromptsHub, name, args)
  };

  /**
   * Event handling
   */
  on(event: HubEvent, handler: HubEventHandler): void {
    this.events.on(event, handler as (d: unknown) => void);
  }

  off(event: HubEvent, handler: HubEventHandler): void {
    this.events.off(event, handler as (d: unknown) => void);
  }

  private emit(event: HubEvent, data: unknown): void {
    this.events.emit(event, data as HubEventData);
  }

  /**
   * Get connected servers
   */
  getServers(): ConnectedServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get a specific server
   */
  getServer(id: string): ConnectedServer | undefined {
    return this.servers.get(id);
  }

  /**
   * Get SSE manager
   */
  getSSEManager(): SSEManager {
    return this.sseManager;
  }

  /**
   * Get StreamableHTTP Transport
   */
  getStreamableTransport(): RelayTransport | undefined {
    return this.streamableTransport;
  }

  /**
   * Get toolset revision
   */
  getToolsetRevision(): number {
    return this.toolsetRevision;
  }

  /**
   * Get toolset hash
   */
  getToolsetHash(): string {
    return this.toolsetHash;
  }

  /**
   * Reload configuration (public wrapper)
   */
  async doReloadConfig(): Promise<void> {
    const { reloadConfig } = await import('./config/reload.js');
    const ctx = {
      options: this.options,
      logger: this.logger,
      servers: this.servers,
      removeServer: this.removeServer.bind(this),
      addServer: this.addServer.bind(this),
      sendToolListChangedNotification: this.sendToolListChangedNotification.bind(this)
    };
    return reloadConfig(ctx);
  }

  /**
   * Handle HTTP request for MCP protocol
   * This is designed to work with Hono or any similar framework
   */
  async handleHttpRequest(context: unknown): Promise<Response> {
    const { handleHttpRequest } = await import('./http/handler.js');
    return handleHttpRequest(this, context);
  }

  /**
   * Handle JSON-RPC request
   */
  public async handleJsonRpcRequest(body: unknown, sessionId?: string): Promise<unknown> {
    const request = body as {
      method?: string;
      params?: Record<string, unknown>;
      id?: string | number | null;
    };
    const { method, params, id } = request;

    try {
      // Notification (no response)
      if (method === RPC_NOTIFICATION.initialized) return null;

      // Table dispatch
      const { RPC_DISPATCH, isRpcMethod } = await import('./rpc/dispatch.js');
      const handler = method && isRpcMethod(method) ? RPC_DISPATCH[method] : undefined;

      if (handler) {
        return await handler(this, params ?? {}, id ?? null, sessionId);
      }

      // Default: method not found (keep legacy behavior)
      return {
        jsonrpc: '2.0',
        id: id as string | number,
        error: { code: -32601, message: 'Method not found' }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: id as string | number | null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Get or create session ID
   */
  public getOrCreateSessionId(request: {
    headers: { get?: (key: string) => string | null } | Record<string, string>;
  }): string {
    const headers = request.headers as { get?: (key: string) => string | null } & Record<
      string,
      string
    >;
    const existingId = headers.get?.('mcp-session-id') ?? headers['mcp-session-id'];
    if (existingId) return existingId;

    const newId = crypto.randomUUID();
    void this.sessions.create(newId);
    return newId;
  }
}
