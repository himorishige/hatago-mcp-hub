/**
 * HatagoHub - User-friendly facade for MCP Hub
 */

import type { FSWatcher } from 'node:fs';
import {
  createPromptRegistry,
  createResourceRegistry,
  getPlatform,
  type PromptRegistry,
  type ResourceRegistry,
  SessionManager,
  ToolInvoker,
  ToolRegistry
} from '@himorishige/hatago-runtime';
import type { Tool, LogData } from '@himorishige/hatago-core';
import {
  SSEClientTransport,
  StreamableHTTPTransport,
  type ITransport
} from '@himorishige/hatago-transport';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ServerConfig } from '@himorishige/hatago-core/schemas';
import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { UnsupportedFeatureError } from './errors.js';
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

import { CapabilityRegistry } from './capability-registry.js';
import { connectWithRetry, normalizeServerSpec } from './client/connector.js';
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

  // Event handlers
  protected eventHandlers = new Map<HubEvent, Set<HubEventHandler>>();

  // Logger
  protected logger: Logger;

  // SSE Manager
  private sseManager: SSEManager;

  // StreamableHTTP Transport
  private streamableTransport?: StreamableHTTPTransport;

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

    // Initialize SSE manager
    this.sseManager = new SSEManager(this.logger);

    // Initialize components
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

    // Initialize StreamableHTTP Transport only when enabled
    if (this.options.enableStreamableTransport) {
      this.streamableTransport = new StreamableHTTPTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (sessionId) => {
          this.logger.debug('[Hub] Session initialized via StreamableHTTP', {
            sessionId
          });
        },
        onsessionclosed: (sessionId) => {
          this.logger.debug('[Hub] Session closed via StreamableHTTP', {
            sessionId
          });
        }
      });
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

    // Create transport factory based on spec
    const createTransport = async () => {
      // Helper: wrap fetch to inject headers for remote transports [REH][SF]
      const makeHeaderFetch = (headers?: Record<string, string>) => {
        if (!headers || Object.keys(headers).length === 0) return undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headerFetch = async (input: any, init?: RequestInit) => {
          const mergedHeaders = {
            ...(init?.headers instanceof Headers
              ? Object.fromEntries(init.headers.entries())
              : ((init?.headers as Record<string, string> | undefined) ?? {})),
            ...headers
          } as Record<string, string>;
          const nextInit: RequestInit = { ...init, headers: mergedHeaders };
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          return fetch(input, nextInit);
        };
        return headerFetch;
      };

      if (spec.command) {
        // Local server via stdio - check platform capability
        const platform = getPlatform();
        if (!platform.capabilities.hasProcessSpawn) {
          throw new UnsupportedFeatureError(
            `Local MCP servers are not supported in this environment. Server "${id}" requires process spawning capability.`
          );
        }

        // Dynamically import StdioClientTransport only when needed
        const transportModule = await import('@himorishige/hatago-transport/stdio');
        const { StdioClientTransport } = transportModule;

        this.logger.debug(`Creating StdioClientTransport for ${id}`, {
          command: spec.command,
          args: spec.args
        });
        return new StdioClientTransport({
          command: spec.command,
          args: spec.args ?? [],
          env: spec.env,
          cwd: spec.cwd
        });
      } else if (spec.url && spec.type === 'sse') {
        // Remote SSE server
        this.logger.debug(`Creating SSEClientTransport for ${id}`, {
          url: spec.url
        });
        // Inject headers via custom fetch (EventSource-style transports often ignore plain headers option)
        type TransportCtor = new (url: URL, options?: { fetch?: typeof fetch }) => unknown;
        const Ctor = SSEClientTransport as unknown as TransportCtor;
        const transport = new Ctor(new URL(spec.url), {
          fetch: makeHeaderFetch(spec.headers)
        });
        return transport;
      } else if (spec.url && spec.type === 'http') {
        // Remote HTTP server
        this.logger.debug(`Creating HTTPClientTransport (via SSE) for ${id}`, {
          url: spec.url
        });
        type TransportCtor = new (url: URL, options?: { fetch?: typeof fetch }) => unknown;
        const Ctor = SSEClientTransport as unknown as TransportCtor;
        const transport = new Ctor(new URL(spec.url), {
          fetch: makeHeaderFetch(spec.headers)
        });
        return transport;
      } else if (spec.url && spec.type === 'streamable-http') {
        // Streamable HTTP server
        const { StreamableHTTPClientTransport } = await import(
          '@modelcontextprotocol/sdk/client/streamableHttp.js'
        );
        this.logger.debug(`Creating StreamableHTTPClientTransport for ${id}`, {
          url: spec.url
        });
        type StreamableCtor = new (url: URL, options?: { fetch?: typeof fetch }) => unknown;
        const StreamCtor = StreamableHTTPClientTransport as unknown as StreamableCtor;
        const transport = new StreamCtor(new URL(spec.url), {
          fetch: makeHeaderFetch(spec.headers)
        });
        return transport;
      } else {
        throw new Error(`Invalid server specification for ${id}`);
      }
    };

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

    // Set up notification handler to forward notifications
    // This will catch all notifications from the child server
    const clientWithHandler = client as Client & {
      fallbackNotificationHandler?: (notification: JSONRPCMessage) => Promise<void>;
    };
    clientWithHandler.fallbackNotificationHandler = async (notification: unknown) => {
      this.logger.debug(`[Hub] Notification from server ${id}`, notification as LogData);

      // Forward notification to parent (Claude Code) via callback
      if (this.onNotification) {
        await this.onNotification(notification as JSONRPCMessage);
      }

      // Forward notification to parent via StreamableHTTP transport
      if (this.streamableTransport) {
        await this.streamableTransport.send(notification as JSONRPCMessage);
      }

      // Emit event for other listeners
      this.emit('server:notification', { serverId: id, notification });
    };

    // Update server status
    const server = this.servers.get(id);
    if (server) {
      server.status = 'connected';
    } else {
      this.logger.warn(`Server ${id} not found when updating status to connected`);
    }

    // Register tools using high-level API
    try {
      const toolsResult = await client.listTools();
      const toolArray = toolsResult.tools ?? [];

      this.logger.debug(`[Hub] Registering ${toolArray.length} tools from ${id}`, {
        toolNames: toolArray.map((t) => t.name)
      });

      // Prepare all tools with handlers
      const requestTimeoutMs = spec.timeout ?? this.options.defaultTimeout;
      const toolsWithHandlers = toolArray.map((tool) => ({
        ...tool,
        handler: async (args: unknown, progressCallback?: (progress: number) => void) => {
          // Use high-level callTool API with progress support
          const toolCall = client.callTool(
            {
              name: tool.name,
              arguments: args as { [x: string]: unknown } | undefined
            },
            undefined, // Use default schema
            {
              onprogress: (progress: {
                progressToken?: string;
                progress?: number;
                total?: number;
                message?: string;
              }) => {
                this.logger.debug(`[Hub] Tool progress from ${id}/${tool.name}`, progress);

                // Forward progress notification to parent
                const notification = {
                  jsonrpc: '2.0' as const,
                  method: 'notifications/progress',
                  params: {
                    progressToken: progress.progressToken ?? `${id}-${tool.name}-${Date.now()}`,
                    progress: progress.progress ?? 0,
                    total: progress.total,
                    message: progress.message
                  }
                };

                // Call the progress callback if provided
                if (progressCallback && typeof progress.progress === 'number') {
                  void progressCallback(progress.progress);
                }

                // Forward to parent via onNotification
                if (this.onNotification) {
                  void this.onNotification(notification);
                }
              }
            }
          );

          // Apply request timeout per server
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Tool call timed out after ${requestTimeoutMs}ms`)),
              requestTimeoutMs
            );
          });
          try {
            const result = await Promise.race([toolCall, timeoutPromise]);
            return result;
          } finally {
            if (timer) clearTimeout(timer);
          }
        }
      }));

      // Register all tools at once to avoid clearing issue
      this.toolRegistry.registerServerTools(id, toolsWithHandlers);

      // Get registered tools with their public names
      const registeredTools = this.toolRegistry.getServerTools(id);

      // Register handlers and update server info
      for (let i = 0; i < toolsWithHandlers.length; i++) {
        const tool = toolsWithHandlers[i];
        const registeredTool = registeredTools[i];

        if (registeredTool && tool) {
          if (server) {
            server.tools.push(registeredTool);
          }
          this.toolInvoker.registerHandler(registeredTool.name, tool.handler);
          this.emit('tool:registered', { serverId: id, tool: registeredTool });
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to list tools for ${id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Register resources using high-level API
    try {
      const resourcesResult = await client.listResources();
      const resourceArray = resourcesResult.resources ?? [];

      // Mark as supported
      this.capabilityRegistry.markServerCapability(id, 'resources/list', 'supported');

      // Store resources in server object
      if (server) {
        server.resources = resourceArray;
      }

      // Register all resources in the registry
      this.resourceRegistry.registerServerResources(id, resourceArray);

      for (const resource of resourceArray) {
        this.emit('resource:registered', { serverId: id, resource });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('-32601')) {
        // Method not found - server doesn't support resources
        this.capabilityRegistry.markServerCapability(id, 'resources/list', 'unsupported');
        this.logger.debug(`Server ${id} does not support resources`);
      } else {
        // Other errors are still warnings
        this.logger.warn(`Failed to list resources for ${id}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Register prompts using high-level API
    try {
      const promptsResult = await client.listPrompts();
      const promptArray = promptsResult.prompts ?? [];

      // Mark as supported
      this.capabilityRegistry.markServerCapability(id, 'prompts/list', 'supported');

      // Store prompts in server object
      if (server) {
        server.prompts = promptArray;
      }

      // Register all prompts in the registry
      this.promptRegistry.registerServerPrompts(id, promptArray);

      for (const prompt of promptArray) {
        this.emit('prompt:registered', { serverId: id, prompt });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('-32601')) {
        // Method not found - server doesn't support prompts
        this.capabilityRegistry.markServerCapability(id, 'prompts/list', 'unsupported');
        this.logger.debug(`Server ${id} does not support prompts`);
      } else {
        // Other errors are still warnings
        this.logger.warn(`Failed to list prompts for ${id}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
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
        if (this.streamableTransport) {
          if (config.timeouts?.keepAliveMs && Number.isFinite(config.timeouts.keepAliveMs)) {
            this.streamableTransport.setKeepAliveMs(config.timeouts.keepAliveMs);
          }
          await this.streamableTransport.start();
          this.streamableTransport.onmessage = (message) => {
            void (async () => {
              const result = await this.handleJsonRpcRequest(message as unknown as JSONRPCMessage);
              if (result && this.streamableTransport) {
                await this.streamableTransport.send(result as JSONRPCMessage);
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
            error: errorMessage
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
          const result = await this.handleJsonRpcRequest(message as unknown as JSONRPCMessage);
          if (result && this.streamableTransport) {
            await this.streamableTransport.send(result as JSONRPCMessage);
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
    this.toolsetRevision++;
    this.toolsetHash = await this.calculateToolsetHash();

    const notification = {
      jsonrpc: '2.0' as const,
      method: 'notifications/tools/list_changed',
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
        await this.streamableTransport.send(notification);
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
    list: (options?: ListOptions) => {
      if (options?.serverId) {
        const server = this.servers.get(options.serverId);
        return server?.tools ?? [];
      }
      return this.toolInvoker.listTools();
    },

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
    ) => {
      // Parse qualified name (serverId/toolName or just toolName)
      let toolName = name;
      let serverId = options?.serverId;

      if (name.includes('/')) {
        const parts = name.split('/');
        serverId = parts[0];
        toolName = parts.slice(1).join('/');
      }

      // Use naming strategy to resolve actual tool name
      const publicName =
        serverId && this.options.namingStrategy !== 'none'
          ? `${serverId}${this.options.separator}${toolName}`
          : toolName;

      // Handle tool with progressToken if provided
      // Call the tool through invoker with progress support
      const result = await this.toolInvoker.callTool('default', publicName, args, {
        timeout: options?.timeout ?? this.options.defaultTimeout,
        progressToken: options?.progressToken
      });

      this.emit('tool:called', { name, args, result });
      return result;
    }
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
    list: (options?: ListOptions) => {
      if (options?.serverId) {
        const server = this.servers.get(options.serverId);
        return server?.resources ?? [];
      }
      // Return all registered resources from registry
      return this.resourceRegistry.getAllResources();
    },

    /**
     * Read a resource
     */
    read: async (uri: string, options?: ReadOptions) => {
      // Try to resolve the resource through the registry
      const resourceInfo = this.resourceRegistry.resolveResource(uri);

      if (resourceInfo) {
        // Minimal internal resource handling [SF]
        if (resourceInfo.serverId === '_internal') {
          if (uri === 'hatago://servers') {
            const serverList = this.getServers().map((s) => ({
              id: s.id,
              status: s.status,
              type: s.spec?.url ? 'remote' : 'local',
              url: s.spec?.url ?? null,
              command: s.spec?.command ?? null,
              tools: s.tools?.map((t) => t.name) ?? [],
              resources: s.resources?.map((r) => r.uri) ?? [],
              prompts: s.prompts?.map((p) => p.name) ?? [],
              error: s.error?.message ?? null
            }));

            const payload = { total: serverList.length, servers: serverList };
            this.emit('resource:read', { uri, serverId: '_internal', result: payload });
            return { contents: [{ uri, text: JSON.stringify(payload, null, 2) }] };
          }
          // Unknown internal resource
          throw new Error(`Unknown internal resource: ${uri}`);
        }

        // Resource found in registry
        const client = this.clients.get(resourceInfo.serverId);
        if (client) {
          try {
            // Use the original URI to read from the server
            const result = await client.readResource({
              uri: resourceInfo.originalUri
            });
            this.emit('resource:read', {
              uri,
              serverId: resourceInfo.serverId,
              result
            });
            return result;
          } catch (error) {
            this.logger.error(`Failed to read resource ${uri}`, {
              serverId: resourceInfo.serverId,
              error: error instanceof Error ? error.message : String(error)
            });
            throw error;
          }
        }
      }

      // Fallback: try to find by serverId if provided
      if (options?.serverId) {
        const client = this.clients.get(options.serverId);
        if (client) {
          try {
            const result = await client.readResource({ uri });
            this.emit('resource:read', {
              uri,
              serverId: options.serverId,
              result
            });
            return result;
          } catch (error) {
            this.logger.error(`Failed to read resource ${uri}`, {
              serverId: options.serverId,
              error: error instanceof Error ? error.message : String(error)
            });
            throw error;
          }
        }
      }

      throw new Error(`No server found for resource: ${uri}`);
    }
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
    list: (options?: ListOptions) => {
      if (options?.serverId) {
        const server = this.servers.get(options.serverId);
        return server?.prompts ?? [];
      }
      // Return all registered prompts from registry
      return this.promptRegistry.getAllPrompts();
    },

    /**
     * Get a prompt
     */
    get: async (name: string, args?: unknown) => {
      // Parse prompt name to check if it's namespaced
      let promptName = name;
      let serverId: string | undefined;

      // Check if the name contains the separator (e.g., server_promptName)
      if (name.includes(this.options.separator)) {
        const parts = name.split(this.options.separator);
        serverId = parts[0];
        promptName = parts.slice(1).join(this.options.separator);
      }

      // Find the client for the server
      if (serverId) {
        const client = this.clients.get(serverId);
        if (client) {
          const result = await client.getPrompt({
            name: promptName,
            arguments: args as { [x: string]: string } | undefined
          });
          this.emit('prompt:got', { name, args, result });
          return result;
        }
      }

      // Fallback to prompt registry - for now, return the prompt definition
      // In the future, this could execute the prompt template
      const prompt = this.promptRegistry.getPrompt(name);
      if (prompt) {
        return {
          description: prompt.description,
          arguments: prompt.arguments,
          messages: []
        };
      }
      throw new Error(`Prompt not found: ${name}`);
    }
  };

  /**
   * Event handling
   */
  on(event: HubEvent, handler: HubEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler);
  }

  off(event: HubEvent, handler: HubEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: HubEvent, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data as HubEventData);
        } catch (error) {
          this.logger.error(`Error in event handler for ${event}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
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
  getStreamableTransport(): StreamableHTTPTransport | undefined {
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
      switch (method) {
        case 'initialize': {
          const { handleInitialize } = await import('./rpc/handlers.js');
          return handleInitialize(this, params ?? {}, id ?? null, sessionId);
        }

        case 'notifications/initialized':
          // This is a notification, no response needed
          return null;

        // 'notifications/progress' handling (sampling bridge) removed

        case 'tools/list': {
          const { handleToolsList } = await import('./rpc/handlers.js');
          return await handleToolsList(this, id ?? null);
        }

        case 'tools/call': {
          const { handleToolsCall } = await import('./rpc/handlers.js');
          return await handleToolsCall(this, params ?? {}, id ?? null, sessionId);
        }

        case 'resources/list': {
          const { handleResourcesList } = await import('./rpc/handlers.js');
          return handleResourcesList(this, id ?? null);
        }

        case 'resources/read': {
          const { handleResourcesRead } = await import('./rpc/handlers.js');
          return await handleResourcesRead(this, params ?? {}, id ?? null);
        }

        case 'resources/templates/list': {
          const { handleResourcesTemplatesList } = await import('./rpc/handlers.js');
          return await handleResourcesTemplatesList(this, id ?? null);
        }

        case 'prompts/list': {
          const { handlePromptsList } = await import('./rpc/handlers.js');
          return handlePromptsList(this, id ?? null);
        }

        case 'prompts/get': {
          const { handlePromptsGet } = await import('./rpc/handlers.js');
          return await handlePromptsGet(this, params ?? {}, id ?? null);
        }

        case 'ping': {
          const { handlePing } = await import('./rpc/handlers.js');
          return handlePing(id ?? null);
        }

        case 'sampling/createMessage':
          // This is a sampling request from the client - should not happen in normal flow
          // as sampling requests come from servers to clients
          this.logger.warn('[Hub] Unexpected sampling/createMessage from client');
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: 'Method not supported by hub'
            }
          };

        default:
          return {
            jsonrpc: '2.0',
            id: id as string | number,
            error: {
              code: -32601,
              message: 'Method not found'
            }
          };
      }
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
