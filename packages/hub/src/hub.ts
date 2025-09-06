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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ServerConfig } from '@himorishige/hatago-core/schemas';
import {
  CreateMessageRequestSchema,
  type JSONRPCMessage
} from '@modelcontextprotocol/sdk/types.js';
import { UnsupportedFeatureError } from './errors.js';
import { Logger } from './logger.js';
import {
  type NotificationConfig,
  NotificationManager,
  type NotificationSeverity
} from './notification-manager.js';
import { SSEManager } from './sse-manager.js';
import type { ServerStateMachine } from './mcp-server/state-machine.js';
import type { ActivationManager } from './mcp-server/activation-manager.js';
import type { IdleManager } from './mcp-server/idle-manager.js';
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

/**
 * Capability support tracking
 */
type CapabilitySupport = 'supported' | 'unsupported' | 'unknown';

class CapabilityRegistry {
  private serverCapabilities = new Map<string, Map<string, CapabilitySupport>>();
  private clientCapabilities = new Map<string, Record<string, unknown>>(); // sessionId -> capabilities

  // Track server capability support status
  markServerCapability(serverId: string, method: string, support: CapabilitySupport) {
    if (!this.serverCapabilities.has(serverId)) {
      this.serverCapabilities.set(serverId, new Map());
    }
    this.serverCapabilities.get(serverId)?.set(method, support);
  }

  // Get server capability support status
  getServerCapability(serverId: string, method: string): CapabilitySupport {
    return this.serverCapabilities.get(serverId)?.get(method) ?? 'unknown';
  }

  // Store client capabilities
  setClientCapabilities(sessionId: string, capabilities: Record<string, unknown>) {
    this.clientCapabilities.set(sessionId, capabilities ?? {});
  }

  getClientCapabilities(sessionId: string): Record<string, unknown> {
    return this.clientCapabilities.get(sessionId) ?? {};
  }

  // Clear capabilities for a session
  clearClientCapabilities(sessionId: string) {
    this.clientCapabilities.delete(sessionId);
  }

  // Clear server capabilities
  clearServerCapabilities(serverId: string) {
    this.serverCapabilities.delete(serverId);
  }
}

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

  // Notification Manager
  private notificationManager?: NotificationManager;

  // Config file watcher
  private configWatcher?: FSWatcher;

  // Sampling request handlers
  private samplingSolvers: Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
      progressToken?: string;
      serverId: string;
    }
  > = new Map();

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
  };

  // Notification callback for forwarding to parent
  public onNotification?: (notification: unknown) => Promise<void>;

  // Toolset versioning
  private toolsetRevision = 0;
  private toolsetHash = '';

  // Startup synchronization: ensure first tools/list waits briefly until servers connect [REH][SF]
  private startupDeferred?: { promise: Promise<void>; resolve: () => void; completed: boolean };

  // Notification sink tracking (for logging once)
  private warnedNoSinkOnce = false;
  private notedHttpSinkOnce = false;

  constructor(options: HubOptions = {}) {
    this.options = {
      configFile: options.configFile ?? '',
      preloadedConfig: options.preloadedConfig ?? undefined,
      watchConfig: options.watchConfig ?? false,
      sessionTTL: options.sessionTTL ?? 3600,
      defaultTimeout: options.defaultTimeout ?? 30000,
      namingStrategy: options.namingStrategy ?? 'namespace',
      separator: options.separator ?? '_',
      tags: options.tags
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

    // Initialize StreamableHTTP Transport
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
    // Some MCP clients（例: Claude Code）では最初の通知しか認識しないケースがあるため、
    // 起動フェーズでは呼び出し側で一括通知に切り替え可能にする。[REH][ISA]
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
   * Wrap transport for logging
   */
  private wrapTransport(transport: ITransport, serverId: string): ITransport {
    const logger = this.logger.child(serverId);

    // Wrap send method for request logging
    const originalSend = transport.send?.bind(transport);
    if (originalSend) {
      transport.send = async (message: unknown) => {
        logger.debug('RPC Request', { message });
        try {
          const result = await originalSend(message);
          logger.debug('RPC Response', { result });
          return result;
        } catch (error) {
          logger.error('RPC Error', {
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      };
    }

    return transport;
  }

  /**
   * Connect to a server with retry logic
   */
  private async connectWithRetry(
    id: string,
    createTransport: () => ITransport | Promise<ITransport>,
    maxRetries: number = 3,
    connectTimeoutMs?: number
  ): Promise<Client> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const transport = this.wrapTransport(await createTransport(), id);
        const client = new Client(
          {
            name: `hatago-hub-${id}`,
            version: '0.0.8'
          },
          {
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
              sampling: {} // Enable sampling capability for server-to-client requests
            }
          }
        );

        // Apply connection timeout if provided
        if (connectTimeoutMs && Number.isFinite(connectTimeoutMs)) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const race = Promise.race([
            client.connect(transport),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`Connection timed out after ${connectTimeoutMs}ms`)),
                connectTimeoutMs
              );
            })
          ]);
          try {
            await race;
          } finally {
            if (timer) clearTimeout(timer);
          }
        } else {
          await client.connect(transport);
        }

        // Set up sampling request handler to forward to the original client
        try {
          const clientWithHandler = client as Client & {
            setRequestHandler: (
              schema: unknown,
              handler: (request: unknown) => Promise<unknown>
            ) => void;
          };
          clientWithHandler.setRequestHandler(
            CreateMessageRequestSchema,
            async (request: unknown) => {
              this.logger.info(`[Hub] Received sampling/createMessage from server ${id}`, {
                request
              });

              // Check if the current client supports sampling
              // TODO: Get current sessionId from context
              const currentSessionId = 'default'; // This would need proper session context
              const clientCaps = this.capabilityRegistry.getClientCapabilities(currentSessionId);

              if (!clientCaps.sampling) {
                // Client doesn't support sampling - provide clear error message
                const error = new Error(
                  'Sampling not supported: The connected client (e.g., Claude Code/Desktop) ' +
                    'does not currently support the sampling capability. ' +
                    'This feature requires an LLM-capable client. ' +
                    'Support for this feature may be added in a future update.'
                ) as Error & { code?: number };
                error.code = -32603;
                throw error;
              }

              // Forward the request to the original client through StreamableHTTP
              if (this.streamableTransport) {
                // Create a unique ID for this sampling request
                const samplingId = `sampling-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Check if the request has a progress token
                const requestWithParams = request as {
                  params?: { _meta?: { progressToken?: string } };
                };
                const progressToken = requestWithParams.params?._meta?.progressToken;

                // Send the sampling request to the client
                const samplingRequest = {
                  jsonrpc: '2.0' as const,
                  id: samplingId,
                  method: 'sampling/createMessage',
                  params: requestWithParams.params
                };

                // Create a promise to wait for the response
                return new Promise((resolve, reject) => {
                  // Store the resolver for this sampling request with progress callback
                  this.samplingSolvers.set(samplingId, {
                    resolve: resolve as (value: unknown) => void,
                    reject,
                    progressToken,
                    serverId: id
                  });

                  // Send the request
                  this.streamableTransport?.send(samplingRequest).catch(reject);

                  // Set a timeout
                  setTimeout(() => {
                    this.samplingSolvers.delete(samplingId);
                    this.notificationManager?.notifyTimeout(id, 'sampling', 30000);
                    reject(new Error('Sampling request timeout'));
                  }, 30000);
                });
              }

              // Fallback if no transport available
              throw new Error('Sampling not available - no client transport');
            }
          );

          this.logger.debug(`[Hub] Set up sampling handler for server ${id}`);
        } catch (error) {
          this.logger.warn(`[Hub] Failed to set up sampling handler for ${id}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }

        this.logger.info(`Successfully connected to ${id} on attempt ${i + 1}`);
        return client;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Connection attempt ${i + 1} failed for ${id}`, {
          error: lastError.message,
          retriesLeft: maxRetries - i - 1
        });

        if (i < maxRetries - 1) {
          const delay = 500 * 2 ** i; // Exponential backoff
          this.logger.debug(`Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error(`Failed to connect to ${id} after ${maxRetries} attempts`);
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
    const client = await this.connectWithRetry(
      id,
      createTransport as unknown as () => Promise<ITransport>,
      3,
      spec.connectTimeout
    );

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
    // Register internal management tools
    await this.registerInternalTools();

    // Prepare startup gate (resolved after eager servers connect)
    if (!this.startupDeferred) {
      let _resolve!: () => void;
      const promise = new Promise<void>((res) => (_resolve = res));
      this.startupDeferred = { promise, resolve: _resolve, completed: false };
    }

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

        // Initialize notification manager if configured
        if (config.notifications) {
          const notificationConfig: NotificationConfig = {
            enabled: config.notifications.enabled ?? false,
            rateLimitSec: config.notifications.rateLimitSec ?? 60,
            severity: (config.notifications.severity ?? ['warn', 'error']) as NotificationSeverity[]
          };
          this.notificationManager = new NotificationManager(notificationConfig, this.logger);
        }

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
              // Check if this is a sampling response
              const msg = message as {
                id?: unknown;
                error?: { message?: string };
                result?: unknown;
              };
              if (msg.id && typeof msg.id === 'string' && msg.id.startsWith('sampling-')) {
                const solver = this.samplingSolvers.get(msg.id);
                if (solver) {
                  this.samplingSolvers.delete(msg.id);
                  if (msg.error) {
                    solver.reject(new Error(msg.error.message ?? 'Sampling failed'));
                  } else {
                    solver.resolve(msg.result);
                  }
                  // No further processing needed for sampling responses
                  return;
                }
              }

              // Handle message through existing JSON-RPC logic
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
                  this.notificationManager?.notifyServerStatus(id, 'starting');
                  // 起動時はツール一覧通知を抑止し、後で一括送信する
                  await this.addServer(id, spec, { suppressToolListNotification: true });
                  this.logger.info(`Connected to server: ${id}`);
                  this.notificationManager?.notifyServerStatus(id, 'connected');
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  this.logger.error(`Failed to connect to server ${id}`, {
                    error: errorMessage
                  });
                  this.notificationManager?.notifyServerStatus(id, 'error', errorMessage);
                  // Continue with other servers
                }
              })();
              connectPromises.push(task);
            }
          }
          // すべての eager サーバー接続が終わってから、最初の tools/list_changed を一度だけ送る
          await Promise.allSettled(connectPromises);
          await this.sendToolListChangedNotification();
          // Mark startup as complete for HTTP clients
          if (this.startupDeferred && !this.startupDeferred.completed) {
            this.startupDeferred.completed = true;
            this.startupDeferred.resolve();
          }
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
        await this.setupConfigWatcher();
      }
    }
    // No config file case: start StreamableHTTP transport with defaults
    else if (this.streamableTransport) {
      await this.streamableTransport.start();
      this.streamableTransport.onmessage = (message) => {
        void (async () => {
          // Check if this is a sampling response
          const msg = message as { id?: unknown; error?: { message?: string }; result?: unknown };
          if (msg.id && typeof msg.id === 'string' && msg.id.startsWith('sampling-')) {
            const solver = this.samplingSolvers.get(msg.id);
            if (solver) {
              this.samplingSolvers.delete(msg.id);
              if (msg.error) {
                solver.reject(new Error(msg.error.message ?? 'Sampling failed'));
              } else {
                solver.resolve(msg.result);
              }
              // No further processing needed for sampling responses
              return;
            }
          }

          // Handle message through existing JSON-RPC logic
          const result = await this.handleJsonRpcRequest(message as unknown as JSONRPCMessage);
          if (result && this.streamableTransport) {
            await this.streamableTransport.send(result as JSONRPCMessage);
          }
        })();
      };
      // No servers configured: mark startup complete
      if (this.startupDeferred && !this.startupDeferred.completed) {
        this.startupDeferred.completed = true;
        this.startupDeferred.resolve();
      }
    }

    return this;
  }

  /**
   * Normalize server spec from config format
   */
  private normalizeServerSpec(config: ServerConfig): ServerSpec {
    const spec: ServerSpec = {};

    // Local server via command
    if ('command' in config) {
      spec.command = config.command;
      spec.args = config.args;
      spec.env = config.env;
      spec.cwd = config.cwd;
    }

    // Remote server via URL
    if ('url' in config) {
      spec.url = config.url;
      // Support both 'type' and 'transport' fields for remote servers
      // Default to 'streamable-http' for HTTP endpoints, 'sse' requires explicit type
      spec.type = config.type ?? 'streamable-http';
      spec.headers = config.headers;
    }

    // Common options
    // Support for new Zod schema structure
    if (config.timeouts) {
      // Use server-specific timeouts if available
      spec.timeout = config.timeouts.requestMs;
      spec.connectTimeout = config.timeouts.connectMs;
      spec.keepAliveTimeout = config.timeouts.keepAliveMs;
    } else {
      // Fallback to old config structure
      const hatagoOpts = config as unknown as {
        hatagoOptions?: {
          timeouts?: { timeout?: number };
          reconnect?: boolean;
          reconnectDelay?: number;
        };
        timeout?: number;
      };
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Preserve legacy fallback where 0 selects the alternate timeout
      spec.timeout = hatagoOpts.hatagoOptions?.timeouts?.timeout || hatagoOpts.timeout;
    }
    const hatagoOpts = config as unknown as {
      hatagoOptions?: {
        reconnect?: boolean;
        reconnectDelay?: number;
      };
    };
    spec.reconnect = hatagoOpts.hatagoOptions?.reconnect;
    spec.reconnectDelay = hatagoOpts.hatagoOptions?.reconnectDelay;

    return spec;
  }

  /**
   * Register internal management tools
   */
  private async registerInternalTools(): Promise<void> {
    const { getInternalTools } = await import('./internal-tools.js');
    const { zodToJsonSchema } = await import('./zod-to-json-schema.js');
    const { HatagoManagementServer } = await import('./mcp-server/hatago-management-server.js');

    const internalTools = getInternalTools();
    const managementServer = new HatagoManagementServer({
      configFilePath: '',
      stateMachine: null as unknown as ServerStateMachine,
      activationManager: null as unknown as ActivationManager,
      idleManager: null as unknown as IdleManager
    });

    this.logger.info('[Hub] Registering internal management tools', {
      count: internalTools.length
    });

    // Register tools with special internal server ID
    const toolsWithHandlers = internalTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
      handler: async (args: unknown) => Promise.resolve(tool.handler(args, this))
    }));

    // Register as internal server
    this.toolRegistry.registerServerTools('_internal', toolsWithHandlers as unknown as Tool[]);

    // Register management server resources
    const resources = managementServer.getResources();
    this.resourceRegistry.registerServerResources('_internal', resources);

    // Register management server prompts
    const prompts = managementServer.getPrompts();
    this.promptRegistry.registerServerPrompts('_internal', prompts);

    // Get registered tools with their public names (includes prefix)
    const registeredTools = this.toolRegistry.getServerTools('_internal');

    // Register handlers with actual registered names
    for (let i = 0; i < registeredTools.length; i++) {
      const registeredTool = registeredTools[i];
      const originalTool = toolsWithHandlers[i];
      if (registeredTool && originalTool) {
        this.toolInvoker.registerHandler(registeredTool.name, originalTool.handler);
        this.logger.debug('[Hub] Registered internal tool handler', {
          name: registeredTool.name
        });
      }
    }

    // Update hash and revision
    this.toolsetRevision++;
    this.toolsetHash = await this.calculateToolsetHash();
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

  /**
   * Set up config file watcher
   */
  private async setupConfigWatcher(): Promise<void> {
    if (!this.options.configFile) {
      return;
    }

    try {
      const { watch } = await import('node:fs');
      const { resolve } = await import('node:path');

      const configPath = resolve(this.options.configFile);

      this.logger.info('Setting up config file watcher', { path: configPath });

      // Create a debounced reload function to avoid multiple reloads
      let reloadTimeout: NodeJS.Timeout | undefined;

      this.configWatcher = watch(configPath, (eventType) => {
        this.logger.debug(`Config file event: ${eventType}`, {
          path: configPath
        });
        if (eventType === 'change') {
          // Clear existing timeout
          if (reloadTimeout) {
            clearTimeout(reloadTimeout);
          }

          // Set a new timeout to debounce rapid changes
          reloadTimeout = setTimeout(() => {
            void (async () => {
              this.logger.info('[ConfigWatcher] Config file changed, starting reload...');
              await this.reloadConfig();
              this.logger.info('[ConfigWatcher] Config reload completed');
            })();
          }, 1000); // Wait 1 second after last change
        }
      });

      this.logger.info('Config file watcher started');
    } catch (error) {
      this.logger.error('Failed to set up config watcher', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Reload configuration
   */
  private async reloadConfig(): Promise<void> {
    if (!this.options.configFile) {
      return;
    }

    this.logger.info('[ConfigReload] Starting configuration reload...');

    try {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      const configPath = resolve(this.options.configFile);
      const configContent = readFileSync(configPath, 'utf-8');
      const newConfig = JSON.parse(configContent) as unknown;

      // Validate config using Zod
      const { safeParseConfig, formatConfigError } = await import(
        '@himorishige/hatago-core/schemas'
      );
      const parseResult = safeParseConfig(newConfig);

      if (!parseResult.success) {
        const errorMessage = formatConfigError(parseResult.error);
        this.logger.error('Invalid config file', { error: errorMessage });
        this.notificationManager?.notifyConfigReload(false, errorMessage);
        return;
      }

      const config = parseResult.data;

      // Update notification manager if configured
      if (config.notifications) {
        const notificationConfig: NotificationConfig = {
          enabled: config.notifications.enabled ?? false,
          rateLimitSec: config.notifications.rateLimitSec ?? 60,
          severity: (config.notifications.severity ?? [
            'warn',
            'error'
          ]) as string[] as NotificationSeverity[]
        };

        if (this.notificationManager) {
          // Update existing notification manager
          this.notificationManager = new NotificationManager(notificationConfig, this.logger);
        } else {
          // Create new notification manager
          this.notificationManager = new NotificationManager(notificationConfig, this.logger);
        }
      }

      // Track servers to add/remove
      const newServerIds = new Set(Object.keys(config.mcpServers ?? {}));
      const existingServerIds = new Set(this.servers.keys());

      // Remove servers that are no longer in config
      for (const id of existingServerIds) {
        if (!newServerIds.has(id)) {
          this.logger.info(`[ConfigReload] Removing server ${id} (no longer in config)`);
          await this.removeServer(id);
        }
      }

      // Add or update servers
      if (config.mcpServers) {
        for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
          // Skip disabled servers
          if (serverConfig.disabled === true) {
            // If server exists and is now disabled, remove it
            if (existingServerIds.has(id)) {
              this.logger.info(`Removing server ${id} (now disabled)`);
              await this.removeServer(id);
            } else {
              this.logger.info(`Skipping disabled server: ${id}`);
            }
            continue;
          }

          // Check tag filtering
          if (this.options.tags && this.options.tags.length > 0) {
            const serverTags = (serverConfig as unknown as { tags?: string[] }).tags ?? [];
            const hasMatchingTag = this.options.tags.some((tag) => serverTags.includes(tag));

            if (!hasMatchingTag) {
              // If server exists but no longer matches tags, remove it
              if (existingServerIds.has(id)) {
                this.logger.info(`[ConfigReload] Removing server ${id} (no matching tags)`, {
                  requiredTags: this.options.tags,
                  serverTags
                });
                await this.removeServer(id);
              } else {
                this.logger.info(`[ConfigReload] Skipping server ${id} (no matching tags)`, {
                  requiredTags: this.options.tags,
                  serverTags
                });
              }
              continue;
            }
          }

          const spec = this.normalizeServerSpec(serverConfig);

          // Check if server should be started eagerly
          const hatagoOptions =
            (serverConfig as unknown as { hatagoOptions?: { start?: string } }).hatagoOptions ?? {};
          if (hatagoOptions?.start !== 'lazy') {
            try {
              // If server already exists, check if spec has changed
              if (existingServerIds.has(id)) {
                const existingServer = this.servers.get(id);
                if (
                  existingServer &&
                  JSON.stringify(existingServer.spec) !== JSON.stringify(spec)
                ) {
                  this.logger.info(`Reloading server ${id} (config changed)`);
                  await this.removeServer(id);
                  this.notificationManager?.notifyServerStatus(id, 'starting');
                  await this.addServer(id, spec, { suppressToolListNotification: true });
                  this.notificationManager?.notifyServerStatus(id, 'connected');
                }
              } else {
                // New server
                this.logger.info(`[ConfigReload] Adding new server: ${id}`, {
                  spec
                });
                this.notificationManager?.notifyServerStatus(id, 'starting');
                await this.addServer(id, spec, { suppressToolListNotification: true });
                this.notificationManager?.notifyServerStatus(id, 'connected');
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              this.logger.error(`Failed to connect to server ${id}`, {
                error: errorMessage
              });
              this.notificationManager?.notifyServerStatus(id, 'error', errorMessage);
            }
          }
        }
      }

      this.logger.info('Configuration reloaded successfully');
      this.notificationManager?.notifyConfigReload(true);

      // Send tools/list_changed notification
      await this.sendToolListChangedNotification();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to reload config', { error: errorMessage });
      this.notificationManager?.notifyConfigReload(false, errorMessage);
    }
  }

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
        // Special handling for internal server resources
        if (resourceInfo.serverId === '_internal') {
          const { HatagoManagementServer } = await import(
            './mcp-server/hatago-management-server.js'
          );
          const managementServer = new HatagoManagementServer({
            configFilePath: this.options.configFile ?? '',
            stateMachine: null as unknown as ServerStateMachine,
            activationManager: null as unknown as ActivationManager,
            idleManager: null as unknown as IdleManager
          });

          try {
            const result = await managementServer.handleResourceRead(uri);
            this.emit('resource:read', {
              uri,
              serverId: '_internal',
              result
            });
            return { contents: [{ uri, text: JSON.stringify(result, null, 2) }] };
          } catch (error) {
            this.logger.error(`Failed to read internal resource ${uri}`, {
              error: error instanceof Error ? error.message : String(error)
            });
            throw error;
          }
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
    return this.reloadConfig();
  }

  /**
   * Handle HTTP request for MCP protocol
   * This is designed to work with Hono or any similar framework
   */
  async handleHttpRequest(context: unknown): Promise<Response> {
    const ctx = context as {
      req?: {
        method: string;
        url: string;
        json: () => Promise<unknown>;
        headers: { get: (key: string) => string | null };
      };
      request?: {
        method: string;
        url: string;
        json: () => Promise<unknown>;
        headers: { get: (key: string) => string | null };
      };
      method?: string;
      url?: string;
      json?: () => Promise<unknown>;
      headers?: { get: (key: string) => string | null };
    };
    const request = ctx.req ?? ctx.request ?? ctx;
    const method = (request as { method: string }).method;
    const url = new URL((request as { url: string }).url);

    this.logger.debug('[Hub] HTTP request received', {
      method,
      url: url.toString()
    });

    // Handle different HTTP methods for MCP protocol
    if (method === 'POST') {
      // JSON-RPC request handling
      try {
        const body = await (request as { json: () => Promise<unknown> }).json();
        const sessionId =
          (request as { headers: { get: (key: string) => string | null } }).headers.get(
            'mcp-session-id'
          ) ?? 'default';
        this.logger.debug('[Hub] Request body', body as LogData);
        const result = await this.handleJsonRpcRequest(body, sessionId);
        this.logger.debug('[Hub] Response', result as LogData);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'mcp-session-id': this.getOrCreateSessionId(
              request as { headers: { get: (key: string) => string | null } }
            )
          }
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : String(error)
            },
            id: null
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    } else if (method === 'GET') {
      // SSE stream initialization
      const sessionId = request.headers?.get('mcp-session-id');
      if (!sessionId) {
        return new Response('Session ID required', { status: 400 });
      }

      // Return SSE stream
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(`data: {"type":"ready"}

`);
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        }
      });
    } else if (method === 'DELETE') {
      // Session termination
      const sessionId = (
        request as { headers: { get: (key: string) => string | null } }
      ).headers.get('mcp-session-id');
      if (sessionId) {
        await this.sessions.destroy(sessionId);
      }
      return new Response(null, { status: 204 });
    }

    return new Response('Method not allowed', { status: 405 });
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
        case 'initialize':
          // Save client capabilities
          this.capabilityRegistry.setClientCapabilities(
            sessionId ?? 'default',
            params?.capabilities as Record<string, unknown>
          );

          // Send initialized notification after initialize response
          // This is handled separately in MCP protocol
          return {
            jsonrpc: '2.0',
            id: id as string | number,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {
                tools: {},
                resources: {},
                prompts: {}
              },
              serverInfo: {
                name: 'hatago-hub',
                version: '0.0.8'
              }
            }
          };

        case 'notifications/initialized':
          // This is a notification, no response needed
          return null;

        case 'notifications/progress': {
          // Handle progress notifications from client for sampling requests
          const notificationProgressToken = params?.progressToken as string | number | undefined;
          if (notificationProgressToken) {
            // Check if this is a progress for a sampling request
            for (const [, solver] of this.samplingSolvers.entries()) {
              if (solver.progressToken === notificationProgressToken) {
                // Forward progress to the server that requested sampling
                const client = this.clients.get(solver.serverId);
                if (client) {
                  try {
                    // Send progress notification to the server
                    await (
                      client as unknown as { notification: (msg: unknown) => Promise<void> }
                    ).notification({
                      method: 'notifications/progress',
                      params: {
                        progressToken: solver.progressToken,
                        progress: params?.progress as number,
                        total: params?.total as number | undefined,
                        message: params?.message as string | undefined
                      }
                    });
                  } catch (error) {
                    this.logger.warn(`Failed to forward progress to server ${solver.serverId}`, {
                      error: error instanceof Error ? error.message : String(error)
                    });
                  }
                }
                break;
              }
            }
          }
          // Notifications don't need a response
          return null;
        }

        case 'tools/list':
          // Wait briefly for startup so the first response includes external tools [REH][SF]
          if (this.startupDeferred && !this.startupDeferred.completed) {
            const WAIT_MS = 3000;
            await Promise.race([
              this.startupDeferred.promise,
              new Promise((r) => setTimeout(r, WAIT_MS))
            ]);
          }
          // Update hash if needed
          if (!this.toolsetHash) {
            this.toolsetHash = await this.calculateToolsetHash();
          }

          return {
            jsonrpc: '2.0',
            id: id as string | number,
            result: {
              tools: this.tools.list(),
              // Add toolset metadata
              _meta: {
                toolset_hash: this.toolsetHash,
                revision: this.toolsetRevision
              }
            }
          };

        case 'tools/call': {
          // Extract progress token from meta
          const progressToken = (params as { _meta?: { progressToken?: string | number } })?._meta
            ?.progressToken;

          this.logger.info(`[Hub] tools/call request`, {
            toolName: (params as { name?: string })?.name,
            progressToken,
            hasTransport: !!this.streamableTransport,
            sessionId
          });

          // Register progress token with SSE manager if present (for legacy support)
          if (progressToken && sessionId && this.sseManager) {
            this.logger.info(`[Hub] Registering progress token`, {
              progressToken,
              sessionId
            });
            this.sseManager.registerProgressToken(progressToken.toString(), sessionId);
          }

          // Parse tool name to find server
          let toolName = (params as { name?: string })?.name ?? '';
          let serverId: string | undefined;

          if (toolName.includes('_')) {
            const parts = toolName.split('_');
            serverId = parts[0];
            toolName = parts.slice(1).join('_');
          }

          // Find the client for direct call (bypass ToolInvoker) when we have progressToken
          // This prevents duplicate progress notifications from the normal tool handler
          if (this.streamableTransport && serverId && progressToken) {
            const client = this.clients.get(serverId);
            // const server = this.servers.get(serverId);
            if (client) {
              // Direct call to client with progress support
              const transport = this.streamableTransport;

              // Create new progress token for upstream
              const upstreamToken = `upstream-${Date.now()}`;

              const result = await (
                client as unknown as {
                  callTool: (
                    request: unknown,
                    schema: undefined,
                    options: { onprogress: (progress: unknown) => void }
                  ) => Promise<unknown>;
                }
              ).callTool(
                {
                  name: toolName,
                  arguments: (params as { arguments?: unknown })?.arguments,
                  _meta: { progressToken: upstreamToken }
                },
                undefined,
                {
                  onprogress: (progress: unknown) => {
                    this.logger.info(`[Hub] Direct client onprogress`, {
                      serverId,
                      toolName,
                      progressToken,
                      progress
                    });

                    // Forward progress with original progressToken
                    const notification = {
                      jsonrpc: '2.0' as const,
                      method: 'notifications/progress',
                      params: {
                        progressToken,
                        progress: (progress as { progress?: number })?.progress ?? 0,
                        total: (progress as { total?: number })?.total,
                        message: (progress as { message?: string })?.message
                      }
                    };

                    // Check notification sinks
                    const hasOnNotification = !!this.onNotification;
                    const hasStreamable = !!transport;

                    // Log once about notification configuration
                    if (!hasOnNotification && !hasStreamable && !this.warnedNoSinkOnce) {
                      this.logger.warn(
                        '[Hub] No notification sink configured; notifications will be dropped'
                      );
                      this.warnedNoSinkOnce = true;
                    } else if (!hasOnNotification && hasStreamable && !this.notedHttpSinkOnce) {
                      // Normal case for HTTP mode (debug level, logged once)
                      this.logger.debug(
                        '[Hub] Using StreamableHTTP transport for notifications (HTTP mode)'
                      );
                      this.notedHttpSinkOnce = true;
                    }

                    // Forward to parent via onNotification callback (for STDIO mode)
                    if (hasOnNotification && this.onNotification) {
                      this.logger.debug('[Hub] Forwarding notification via onNotification handler');
                      void this.onNotification(notification);
                    }

                    // Send to StreamableHTTP client
                    if (hasStreamable) {
                      void transport.send(notification);
                    }

                    // Also send to SSE clients if registered (HTTP mode only)
                    // In STDIO mode, sessionId is not available so SSE is not used
                    if (progressToken && this.sseManager && sessionId) {
                      this.sseManager.sendProgress(progressToken.toString(), {
                        progressToken: progressToken.toString(),
                        progress: (progress as { progress?: number })?.progress ?? 0,
                        total: (progress as { total?: number })?.total,
                        message: (progress as { message?: string })?.message
                      });
                    }
                  }
                  // timeout and maxTotalTimeout are not part of the onprogress options
                  // They should be removed or handled differently
                }
              );

              // Unregister progress token after completion
              if (progressToken && this.sseManager) {
                this.sseManager.unregisterProgressToken(String(progressToken));
              }

              return {
                jsonrpc: '2.0',
                id: id as string | number,
                result
              };
            }
          }

          // Fallback to normal tool call without progress
          const result = await this.tools.call(params?.name as string, params?.arguments, {
            progressToken: progressToken as string | undefined,
            sessionId
          });

          // Unregister progress token after completion
          if (progressToken && this.sseManager) {
            this.sseManager.unregisterProgressToken(String(progressToken));
          }

          return {
            jsonrpc: '2.0',
            id,
            result
          };
        }

        case 'resources/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              resources: this.resources.list()
            }
          };

        case 'resources/read': {
          const resource = await this.resources.read(params?.uri as string);
          return {
            jsonrpc: '2.0',
            id,
            result: resource
          };
        }

        case 'resources/templates/list': {
          // Collect resource templates from all servers
          const allTemplates: unknown[] = [];

          // Note: Most MCP servers don't implement resources/templates/list
          // This is an optional feature primarily used by MCP Inspector
          // We'll try each server but won't fail if they don't support it

          for (const [serverId, client] of this.clients.entries()) {
            try {
              // Skip if client is not ready
              if (!client) continue;

              // Try to get resource templates from the server
              // Most servers will return an error for this method
              const templatesResult = await (
                client as unknown as {
                  request: (req: unknown, schema: unknown) => Promise<unknown>;
                }
              ).request(
                {
                  method: 'resources/templates/list',
                  params: {}
                },
                {
                  parse: (data: unknown) => data,
                  type: 'object',
                  properties: {
                    resourceTemplates: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          uriTemplate: { type: 'string' },
                          name: { type: 'string' },
                          description: { type: 'string' },
                          mimeType: { type: 'string' }
                        }
                      }
                    }
                  }
                } as unknown
              );

              const result = templatesResult as { resourceTemplates?: unknown[] };
              if (result?.resourceTemplates) {
                // Add server prefix to template names
                const namespacedTemplates = result.resourceTemplates.map((template: unknown) => {
                  const t = template as { name?: string };
                  return {
                    ...(template as Record<string, unknown>),
                    name: t.name ? `${serverId}${this.options.separator}${t.name}` : undefined,
                    serverId
                  };
                });
                allTemplates.push(...(namespacedTemplates as unknown[]));
              }
            } catch (error) {
              // Server doesn't support resource templates - this is normal
              // Most MCP servers don't implement this optional feature
              this.logger.debug(
                `Server ${serverId} doesn't support resource templates (expected)`,
                {
                  error: error instanceof Error ? error.message : String(error)
                }
              );
            }
          }

          // Return empty array if no templates found (this is the normal case)
          return {
            jsonrpc: '2.0',
            id,
            result: {
              resourceTemplates: allTemplates
            }
          };
        }

        case 'prompts/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              prompts: this.prompts.list()
            }
          };

        case 'prompts/get': {
          const prompt = await this.prompts.get(params?.name as string, params?.arguments);
          return {
            jsonrpc: '2.0',
            id,
            result: prompt
          };
        }

        case 'ping':
          // MCP Inspector's ping functionality - simple health check
          return {
            jsonrpc: '2.0',
            id,
            result: {}
          };

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
          // Check if this is a sampling response
          if (id && typeof id === 'string' && id.startsWith('sampling-')) {
            const solver = this.samplingSolvers.get(id);
            if (solver) {
              this.samplingSolvers.delete(id);
              const requestBody = request as { error?: { message?: string }; result?: unknown };
              if (requestBody.error) {
                solver.reject(new Error(requestBody.error.message ?? 'Sampling failed'));
              } else {
                solver.resolve(requestBody.result);
              }
              // No response needed for sampling responses
              return null;
            }
          }

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
  private getOrCreateSessionId(request: {
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
