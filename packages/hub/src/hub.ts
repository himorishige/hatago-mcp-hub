/**
 * HatagoHub - User-friendly facade for MCP Hub
 */

import {
  createPromptRegistry,
  createResourceRegistry,
  getPlatform,
  type PromptRegistry,
  type ResourceRegistry,
  SessionManager,
  ToolInvoker,
  ToolRegistry,
} from '@hatago/runtime';
import { SSEClientTransport, StreamableHTTPTransport } from '@hatago/transport';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { UnsupportedFeatureError } from './errors.js';
import { Logger } from './logger.js';
import { SSEManager } from './sse-manager.js';
import type {
  CallOptions,
  ConnectedServer,
  HubEvent,
  HubEventHandler,
  HubOptions,
  ListOptions,
  ReadOptions,
  ServerSpec,
} from './types.js';

/**
 * Capability support tracking
 */
type CapabilitySupport = 'supported' | 'unsupported' | 'unknown';

class CapabilityRegistry {
  private serverCapabilities = new Map<
    string,
    Map<string, CapabilitySupport>
  >();
  private clientCapabilities = new Map<string, any>(); // sessionId -> capabilities

  // Track server capability support status
  markServerCapability(
    serverId: string,
    method: string,
    support: CapabilitySupport,
  ) {
    if (!this.serverCapabilities.has(serverId)) {
      this.serverCapabilities.set(serverId, new Map());
    }
    this.serverCapabilities.get(serverId)!.set(method, support);
  }

  // Get server capability support status
  getServerCapability(serverId: string, method: string): CapabilitySupport {
    return this.serverCapabilities.get(serverId)?.get(method) || 'unknown';
  }

  // Store client capabilities
  setClientCapabilities(sessionId: string, capabilities: any) {
    this.clientCapabilities.set(sessionId, capabilities || {});
  }

  getClientCapabilities(sessionId: string): any {
    return this.clientCapabilities.get(sessionId) || {};
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
  private sessions: SessionManager;
  private toolRegistry: ToolRegistry;
  private toolInvoker: ToolInvoker;
  private resourceRegistry: ResourceRegistry;
  private promptRegistry: PromptRegistry;
  private capabilityRegistry: CapabilityRegistry;

  // Server management
  private servers = new Map<string, ConnectedServer>();
  private clients = new Map<string, Client>();

  // Event handlers
  private eventHandlers = new Map<HubEvent, Set<HubEventHandler>>();

  // Logger
  private logger: Logger;

  // SSE Manager
  private sseManager: SSEManager;

  // StreamableHTTP Transport
  private streamableTransport?: StreamableHTTPTransport;

  // Options
  protected options: Required<HubOptions>;

  constructor(options: HubOptions = {}) {
    this.options = {
      configFile: options.configFile || '',
      sessionTTL: options.sessionTTL || 3600,
      defaultTimeout: options.defaultTimeout || 30000,
      namingStrategy: options.namingStrategy || 'namespace',
      separator: options.separator || '_',
    };

    // Initialize logger
    this.logger = new Logger('[Hub]');

    // Initialize SSE manager
    this.sseManager = new SSEManager(this.logger);

    // Initialize components
    this.sessions = new SessionManager(this.options.sessionTTL);
    this.toolRegistry = new ToolRegistry({
      namingConfig: {
        strategy: this.options.namingStrategy as any,
        separator: this.options.separator,
      },
    });
    this.toolInvoker = new ToolInvoker(
      this.toolRegistry,
      {
        timeout: this.options.defaultTimeout,
      },
      this.sseManager as any,
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
          sessionId,
        });
      },
      onsessionclosed: (sessionId) => {
        this.logger.debug('[Hub] Session closed via StreamableHTTP', {
          sessionId,
        });
      },
    });
  }

  /**
   * Add and connect to a server
   */
  async addServer(id: string, spec: ServerSpec): Promise<this> {
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
      prompts: [],
    });

    try {
      await this.connectServer(id, spec);
      this.emit('server:connected', { serverId: id });
    } catch (error) {
      const server = this.servers.get(id)!;
      server.status = 'error';
      server.error = error as Error;
      this.emit('server:error', { serverId: id, error });
      throw error;
    }

    return this;
  }

  /**
   * Wrap transport for logging
   */
  private wrapTransport(transport: any, serverId: string): any {
    const logger = this.logger.child(serverId);

    // Wrap send method for request logging
    const originalSend = transport.send?.bind(transport);
    if (originalSend) {
      transport.send = async (message: any) => {
        logger.debug('RPC Request', { message });
        try {
          const result = await originalSend(message);
          logger.debug('RPC Response', { result });
          return result;
        } catch (error) {
          logger.error('RPC Error', {
            error: error instanceof Error ? error.message : String(error),
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
    createTransport: () => any,
    maxRetries: number = 3,
  ): Promise<Client> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const transport = this.wrapTransport(await createTransport(), id);
        const client = new Client(
          {
            name: `hatago-hub-${id}`,
            version: '0.1.0',
          },
          {
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
              sampling: {}, // Enable sampling capability for server-to-client requests
            },
          },
        );

        await client.connect(transport);

        // Set up sampling request handler to forward to the original client
        try {
          (client as any).setRequestHandler(
            CreateMessageRequestSchema,
            async (request: any) => {
              this.logger.info(
                `[Hub] Received sampling/createMessage from server ${id}`,
                { request },
              );

              // Check if the current client supports sampling
              // TODO: Get current sessionId from context
              const currentSessionId = 'default'; // This would need proper session context
              const clientCaps =
                this.capabilityRegistry.getClientCapabilities(currentSessionId);

              if (!clientCaps.sampling) {
                // Client doesn't support sampling - provide clear error message
                const error = new Error(
                  'Sampling not supported: The connected client (e.g., Claude Code/Desktop) ' +
                    'does not currently support the sampling capability. ' +
                    'This feature requires an LLM-capable client. ' +
                    'Support for this feature may be added in a future update.',
                );
                (error as any).code = -32603;
                throw error;
              }

              // Forward the request to the original client through StreamableHTTP
              if (this.streamableTransport) {
                // Create a unique ID for this sampling request
                const samplingId = `sampling-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Check if the request has a progress token
                const progressToken = request.params?._meta?.progressToken;

                // Send the sampling request to the client
                const samplingRequest = {
                  jsonrpc: '2.0' as const,
                  id: samplingId,
                  method: 'sampling/createMessage',
                  params: request.params,
                };

                // Create a promise to wait for the response
                return new Promise((resolve, reject) => {
                  // Store the resolver for this sampling request with progress callback
                  (this as any).samplingSolvers =
                    (this as any).samplingSolvers || new Map();
                  (this as any).samplingSolvers.set(samplingId, {
                    resolve,
                    reject,
                    progressToken,
                    serverId: id,
                  });

                  // Send the request
                  this.streamableTransport!.send(samplingRequest).catch(reject);

                  // Set a timeout
                  setTimeout(() => {
                    (this as any).samplingSolvers?.delete(samplingId);
                    reject(new Error('Sampling request timeout'));
                  }, 30000);
                });
              }

              // Fallback if no transport available
              throw new Error('Sampling not available - no client transport');
            },
          );

          this.logger.debug(`[Hub] Set up sampling handler for server ${id}`);
        } catch (error) {
          this.logger.warn(
            `[Hub] Failed to set up sampling handler for ${id}`,
            {
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }

        this.logger.info(`Successfully connected to ${id} on attempt ${i + 1}`);
        return client;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Connection attempt ${i + 1} failed for ${id}`, {
          error: lastError.message,
          retriesLeft: maxRetries - i - 1,
        });

        if (i < maxRetries - 1) {
          const delay = 500 * 2 ** i; // Exponential backoff
          this.logger.debug(`Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw (
      lastError ||
      new Error(`Failed to connect to ${id} after ${maxRetries} attempts`)
    );
  }

  /**
   * Connect to a server
   */
  private async connectServer(id: string, spec: ServerSpec): Promise<void> {
    this.logger.info(`Connecting to server: ${id}`, { spec });

    // Create transport factory based on spec
    const createTransport = async () => {
      if (spec.command) {
        // Local server via stdio - check platform capability
        const platform = getPlatform();
        if (!platform.capabilities.hasProcessSpawn) {
          throw new UnsupportedFeatureError(
            `Local MCP servers are not supported in this environment. Server "${id}" requires process spawning capability.`,
          );
        }

        // Dynamically import StdioClientTransport only when needed
        const transportModule = (await import(
          '@hatago/transport/stdio'
        )) as any;
        const { StdioClientTransport } = transportModule;

        this.logger.debug(`Creating StdioClientTransport for ${id}`, {
          command: spec.command,
          args: spec.args,
        });
        return new StdioClientTransport({
          command: spec.command,
          args: spec.args || [],
          env: spec.env,
          cwd: spec.cwd,
        });
      } else if (spec.url && spec.type === 'sse') {
        // Remote SSE server
        this.logger.debug(`Creating SSEClientTransport for ${id}`, {
          url: spec.url,
        });
        return new SSEClientTransport(new URL(spec.url));
      } else if (spec.url && spec.type === 'http') {
        // Remote HTTP server
        this.logger.debug(`Creating HTTPClientTransport (via SSE) for ${id}`, {
          url: spec.url,
        });
        return new SSEClientTransport(new URL(spec.url));
      } else if (spec.url && spec.type === 'streamable-http') {
        // Streamable HTTP server
        const { StreamableHTTPClientTransport } = await import(
          '@modelcontextprotocol/sdk/client/streamableHttp.js'
        );
        this.logger.debug(`Creating StreamableHTTPClientTransport for ${id}`, {
          url: spec.url,
        });
        return new StreamableHTTPClientTransport(new URL(spec.url));
      } else {
        throw new Error(`Invalid server specification for ${id}`);
      }
    };

    // Connect with retry logic
    const client = await this.connectWithRetry(id, createTransport);

    // Store client
    this.clients.set(id, client);

    // Set up notification handler to forward notifications through StreamableHTTP
    // Note: We don't set fallbackNotificationHandler for progress notifications
    // because they are handled directly in tools/call with onprogress callback

    // Update server status
    const server = this.servers.get(id)!;
    server.status = 'connected';

    // Register tools using high-level API
    try {
      const toolsResult = await client.listTools();
      const toolArray = toolsResult.tools || [];

      this.logger.debug(
        `[Hub] Registering ${toolArray.length} tools from ${id}`,
        {
          toolNames: toolArray.map((t: any) => t.name),
        },
      );

      // Prepare all tools with handlers
      const toolsWithHandlers = toolArray.map((tool: any) => ({
        ...tool,
        handler: async (args: any, progressCallback?: any) => {
          // Store current streamableTransport for progress notifications
          const transport = this.streamableTransport;

          // Use high-level callTool API with progress support
          const result = await client.callTool(
            {
              name: tool.name,
              arguments: args,
            },
            undefined, // Use default schema
            // Disable onprogress in tool handler to prevent duplicates
            // Progress notifications are handled directly in tools/call
            undefined,
          );
          return result;
        },
      }));

      // Register all tools at once to avoid clearing issue
      this.toolRegistry.registerServerTools(id, toolsWithHandlers);

      // Get registered tools with their public names
      const registeredTools = this.toolRegistry.getServerTools(id);

      // Register handlers and update server info
      for (let i = 0; i < toolsWithHandlers.length; i++) {
        const tool = toolsWithHandlers[i];
        const registeredTool = registeredTools[i];

        if (registeredTool) {
          server.tools.push(registeredTool);
          this.toolInvoker.registerHandler(registeredTool.name, tool.handler);
          this.emit('tool:registered', { serverId: id, tool: registeredTool });
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to list tools for ${id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Register resources using high-level API
    try {
      const resourcesResult = await client.listResources();
      const resourceArray = resourcesResult.resources || [];

      // Mark as supported
      this.capabilityRegistry.markServerCapability(
        id,
        'resources/list',
        'supported',
      );

      // Store resources in server object
      server.resources = resourceArray;

      // Register all resources in the registry
      this.resourceRegistry.registerServerResources(id, resourceArray);

      for (const resource of resourceArray) {
        this.emit('resource:registered', { serverId: id, resource });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('-32601')) {
        // Method not found - server doesn't support resources
        this.capabilityRegistry.markServerCapability(
          id,
          'resources/list',
          'unsupported',
        );
        this.logger.debug(`Server ${id} does not support resources`);
      } else {
        // Other errors are still warnings
        this.logger.warn(`Failed to list resources for ${id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Register prompts using high-level API
    try {
      const promptsResult = await client.listPrompts();
      const promptArray = promptsResult.prompts || [];

      // Mark as supported
      this.capabilityRegistry.markServerCapability(
        id,
        'prompts/list',
        'supported',
      );

      // Store prompts in server object
      server.prompts = promptArray;

      // Register all prompts in the registry
      this.promptRegistry.registerServerPrompts(id, promptArray);

      for (const prompt of promptArray) {
        this.emit('prompt:registered', { serverId: id, prompt });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('-32601')) {
        // Method not found - server doesn't support prompts
        this.capabilityRegistry.markServerCapability(
          id,
          'prompts/list',
          'unsupported',
        );
        this.logger.debug(`Server ${id} does not support prompts`);
      } else {
        // Other errors are still warnings
        this.logger.warn(`Failed to list prompts for ${id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Start the hub
   */
  async start(): Promise<this> {
    // Start StreamableHTTP Transport
    await this.streamableTransport?.start();

    // Set up message handler for StreamableHTTP
    if (this.streamableTransport) {
      this.streamableTransport.onmessage = async (message) => {
        // Check if this is a sampling response
        const msg = message as any;
        if (
          msg.id &&
          typeof msg.id === 'string' &&
          msg.id.startsWith('sampling-')
        ) {
          const solvers = (this as any).samplingSolvers as
            | Map<string, any>
            | undefined;
          const solver = solvers?.get(msg.id);
          if (solver) {
            solvers!.delete(msg.id);
            if (msg.error) {
              solver.reject(new Error(msg.error.message || 'Sampling failed'));
            } else {
              solver.resolve(msg.result);
            }
            // No further processing needed for sampling responses
            return;
          }
        }

        // Handle message through existing JSON-RPC logic
        const result = await this.handleJsonRpcRequest(message);
        if (result && this.streamableTransport) {
          await this.streamableTransport.send(result);
        }
      };
    }

    // Load config if provided
    if (this.options.configFile) {
      try {
        // Read config file
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');

        const configPath = resolve(this.options.configFile);
        const configContent = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        // Process MCP servers from config
        if (config.mcpServers) {
          for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
            const spec = this.normalizeServerSpec(serverConfig as any);

            // Check if server should be started eagerly
            const hatagoOptions = (serverConfig as any).hatagoOptions || {};
            if (hatagoOptions.start !== 'lazy') {
              try {
                await this.addServer(id, spec);
                this.logger.info(`Connected to server: ${id}`);
              } catch (error) {
                this.logger.error(`Failed to connect to server ${id}`, {
                  error: error instanceof Error ? error.message : String(error),
                });
                // Continue with other servers
              }
            }
          }
        }
      } catch (error) {
        // Only log debug level for file not found errors
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('ENOENT')) {
          this.logger.debug('Config file not found', {
            path: this.options.configFile,
          });
        } else {
          this.logger.error('Failed to load config file', {
            error: errorMessage,
          });
        }
        throw error;
      }
    }

    return this;
  }

  /**
   * Normalize server spec from config format
   */
  private normalizeServerSpec(config: any): ServerSpec {
    const spec: ServerSpec = {};

    // Local server via command
    if (config.command) {
      spec.command = config.command;
      spec.args = config.args;
      spec.env = config.env;
      spec.cwd = config.cwd;
    }

    // Remote server via URL
    if (config.url) {
      spec.url = config.url;
      // Support both 'type' and 'transport' fields for remote servers
      spec.type = config.transport || config.type || 'sse';
      spec.headers = config.headers;
    }

    // Common options
    spec.timeout = config.hatagoOptions?.timeouts?.timeout || config.timeout;
    spec.reconnect = config.hatagoOptions?.reconnect;
    spec.reconnectDelay = config.hatagoOptions?.reconnectDelay;

    return spec;
  }

  /**
   * Stop the hub
   */
  async stop(): Promise<void> {
    // Disconnect all servers
    for (const [id, client] of this.clients) {
      try {
        await client.close();
      } catch (error) {
        this.logger.error(`Failed to close client ${id}`, {
          error: error instanceof Error ? error.message : String(error),
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
        return server?.tools || [];
      }
      return this.toolInvoker.listTools();
    },

    /**
     * Call a tool
     */
    call: async (
      name: string,
      args: any,
      options?: CallOptions & {
        progressToken?: string;
        progressCallback?: any;
      },
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
      const result = await this.toolInvoker.callTool(
        'default',
        publicName,
        args,
        {
          timeout: options?.timeout || this.options.defaultTimeout,
          progressToken: options?.progressToken,
        },
      );

      this.emit('tool:called', { name, args, result });
      return result;
    },
  };

  /**
   * Resources API
   */
  resources: {
    list: (options?: ListOptions) => any[];
    read: (uri: string, options?: ReadOptions) => Promise<any>;
  } = {
    /**
     * List available resources
     */
    list: (options?: ListOptions) => {
      if (options?.serverId) {
        const server = this.servers.get(options.serverId);
        return server?.resources || [];
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
        // Resource found in registry
        const client = this.clients.get(resourceInfo.serverId);
        if (client) {
          try {
            // Use the original URI to read from the server
            const result = await client.readResource({
              uri: resourceInfo.originalUri,
            });
            this.emit('resource:read', {
              uri,
              serverId: resourceInfo.serverId,
              result,
            });
            return result;
          } catch (error) {
            this.logger.error(`Failed to read resource ${uri}`, {
              serverId: resourceInfo.serverId,
              error: error instanceof Error ? error.message : String(error),
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
              result,
            });
            return result;
          } catch (error) {
            this.logger.error(`Failed to read resource ${uri}`, {
              serverId: options.serverId,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }
      }

      throw new Error(`No server found for resource: ${uri}`);
    },
  };

  /**
   * Prompts API
   */
  prompts: {
    list: (options?: ListOptions) => any[];
    get: (name: string, args?: any) => Promise<any>;
  } = {
    /**
     * List available prompts
     */
    list: (options?: ListOptions) => {
      if (options?.serverId) {
        const server = this.servers.get(options.serverId);
        return server?.prompts || [];
      }
      // Return all registered prompts from registry
      return this.promptRegistry.getAllPrompts();
    },

    /**
     * Get a prompt
     */
    get: async (name: string, args?: any) => {
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
            arguments: args,
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
          messages: [],
        };
      }
      throw new Error(`Prompt not found: ${name}`);
    },
  };

  /**
   * Event handling
   */
  on(event: HubEvent, handler: HubEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: HubEvent, handler: HubEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private emit(event: HubEvent, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          this.logger.error(`Error in event handler for ${event}`, {
            error: error instanceof Error ? error.message : String(error),
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
   * Handle HTTP request for MCP protocol
   * This is designed to work with Hono or any similar framework
   */
  async handleHttpRequest(context: any): Promise<Response> {
    const request = context.req || context.request || context;
    const method = request.method;
    const url = new URL(request.url);

    this.logger.debug('[Hub] HTTP request received', {
      method,
      url: url.toString(),
    });

    // Handle different HTTP methods for MCP protocol
    if (method === 'POST') {
      // JSON-RPC request handling
      try {
        const body = await request.json();
        const sessionId = request.headers.get('mcp-session-id') || 'default';
        this.logger.debug('[Hub] Request body', body);
        const result = await this.handleJsonRpcRequest(body, sessionId);
        this.logger.debug('[Hub] Response', result);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'mcp-session-id': this.getOrCreateSessionId(request),
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : String(error),
            },
            id: null,
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    } else if (method === 'GET') {
      // SSE stream initialization
      const sessionId = request.headers.get('mcp-session-id');
      if (!sessionId) {
        return new Response('Session ID required', { status: 400 });
      }

      // Return SSE stream
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(`data: {"type":"ready"}

`);
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } else if (method === 'DELETE') {
      // Session termination
      const sessionId = request.headers.get('mcp-session-id');
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
  private async handleJsonRpcRequest(
    body: any,
    sessionId?: string,
  ): Promise<any> {
    const { method, params, id } = body;

    try {
      switch (method) {
        case 'initialize':
          // Save client capabilities
          this.capabilityRegistry.setClientCapabilities(
            sessionId || 'default',
            params.capabilities,
          );

          // Send initialized notification after initialize response
          // This is handled separately in MCP protocol
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {
                tools: {},
                resources: {},
                prompts: {},
              },
              serverInfo: {
                name: 'hatago-hub',
                version: '0.1.0',
              },
            },
          };

        case 'notifications/initialized':
          // This is a notification, no response needed
          return null;

        case 'notifications/progress': {
          // Handle progress notifications from client for sampling requests
          const notificationProgressToken = params?.progressToken;
          if (notificationProgressToken) {
            // Check if this is a progress for a sampling request
            const solvers = (this as any).samplingSolvers as
              | Map<string, any>
              | undefined;
            if (solvers) {
              for (const [samplingId, solver] of solvers.entries()) {
                if (solver.progressToken === notificationProgressToken) {
                  // Forward progress to the server that requested sampling
                  const client = this.clients.get(solver.serverId);
                  if (client) {
                    try {
                      // Send progress notification to the server
                      await (client as any).notification({
                        method: 'notifications/progress',
                        params: {
                          progressToken: solver.progressToken,
                          progress: params.progress,
                          total: params.total,
                          message: params.message,
                        },
                      });
                    } catch (error) {
                      this.logger.warn(
                        `Failed to forward progress to server ${solver.serverId}`,
                        {
                          error:
                            error instanceof Error
                              ? error.message
                              : String(error),
                        },
                      );
                    }
                  }
                  break;
                }
              }
            }
          }
          // Notifications don't need a response
          return null;
        }

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.tools.list(),
            },
          };

        case 'tools/call': {
          // Extract progress token from meta
          const progressToken = params?._meta?.progressToken;

          this.logger.info(`[Hub] tools/call request`, {
            toolName: params.name,
            progressToken,
            hasTransport: !!this.streamableTransport,
            sessionId,
          });

          // Register progress token with SSE manager if present (for legacy support)
          if (progressToken && sessionId && this.sseManager) {
            this.logger.info(`[Hub] Registering progress token`, {
              progressToken,
              sessionId,
            });
            this.sseManager.registerProgressToken(
              progressToken.toString(),
              sessionId,
            );
          }

          // Parse tool name to find server
          let toolName = params.name;
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
            const server = this.servers.get(serverId);
            if (client) {
              // Direct call to client with progress support
              const transport = this.streamableTransport;

              // Create new progress token for upstream
              const upstreamToken = `upstream-${Date.now()}`;

              const result = await (client as any).callTool(
                {
                  name: toolName,
                  arguments: params.arguments,
                  _meta: { progressToken: upstreamToken },
                },
                undefined,
                {
                  onprogress: async (progress: any) => {
                    this.logger.info(`[Hub] Direct client onprogress`, {
                      serverId,
                      toolName,
                      progressToken,
                      progress,
                    });

                    // Forward progress with original progressToken
                    const notification = {
                      jsonrpc: '2.0' as const,
                      method: 'notifications/progress',
                      params: {
                        progressToken,
                        progress: progress.progress || 0,
                        total: progress.total,
                        message: progress.message,
                      },
                    };

                    // Send to StreamableHTTP client
                    if (transport) {
                      await transport.send(notification);
                    }

                    // Also send to SSE clients if registered
                    if (progressToken && this.sseManager) {
                      this.sseManager.sendProgress(progressToken.toString(), {
                        progressToken: progressToken.toString(),
                        progress: progress.progress || 0,
                        total: progress.total,
                        message: progress.message,
                      });
                    }
                  },
                  timeout: server?.spec?.timeout || 30000,
                  maxTotalTimeout: server?.spec?.timeout
                    ? server.spec.timeout * 10
                    : 300000,
                },
              );

              // Unregister progress token after completion
              if (progressToken && this.sseManager) {
                this.sseManager.unregisterProgressToken(progressToken);
              }

              return {
                jsonrpc: '2.0',
                id,
                result,
              };
            }
          }

          // Fallback to normal tool call without progress
          const result = await this.tools.call(params.name, params.arguments, {
            progressToken,
          });

          // Unregister progress token after completion
          if (progressToken && this.sseManager) {
            this.sseManager.unregisterProgressToken(progressToken);
          }

          return {
            jsonrpc: '2.0',
            id,
            result,
          };
        }

        case 'resources/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              resources: this.resources.list(),
            },
          };

        case 'resources/read': {
          const resource = await this.resources.read(params.uri);
          return {
            jsonrpc: '2.0',
            id,
            result: resource,
          };
        }

        case 'resources/templates/list': {
          // Collect resource templates from all servers
          const allTemplates: any[] = [];

          for (const [serverId, client] of this.clients.entries()) {
            try {
              // Try to get resource templates from the server
              const templatesResult = await (client as any).request(
                {
                  method: 'resources/templates/list',
                  params: {},
                },
                {
                  parse: (data: any) => data,
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
                          mimeType: { type: 'string' },
                        },
                      },
                    },
                  },
                } as any,
              );

              if (templatesResult?.resourceTemplates) {
                // Add server prefix to template names
                const namespacedTemplates =
                  templatesResult.resourceTemplates.map((template: any) => ({
                    ...template,
                    name: template.name
                      ? `${serverId}${this.options.separator}${template.name}`
                      : undefined,
                    serverId,
                  }));
                allTemplates.push(...namespacedTemplates);
              }
            } catch (error) {
              // Server doesn't support resource templates
              this.logger.debug(
                `Server ${serverId} doesn't support resource templates`,
                {
                  error: error instanceof Error ? error.message : String(error),
                },
              );
            }
          }

          return {
            jsonrpc: '2.0',
            id,
            result: {
              resourceTemplates: allTemplates,
            },
          };
        }

        case 'prompts/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              prompts: this.prompts.list(),
            },
          };

        case 'prompts/get': {
          const prompt = await this.prompts.get(params.name, params.arguments);
          return {
            jsonrpc: '2.0',
            id,
            result: prompt,
          };
        }

        case 'ping':
          // MCP Inspector's ping functionality - simple health check
          return {
            jsonrpc: '2.0',
            id,
            result: {},
          };

        case 'sampling/createMessage':
          // This is a sampling request from the client - should not happen in normal flow
          // as sampling requests come from servers to clients
          this.logger.warn(
            '[Hub] Unexpected sampling/createMessage from client',
          );
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: 'Method not supported by hub',
            },
          };

        default:
          // Check if this is a sampling response
          if (id && typeof id === 'string' && id.startsWith('sampling-')) {
            const solvers = (this as any).samplingSolvers as
              | Map<string, any>
              | undefined;
            const solver = solvers?.get(id);
            if (solver) {
              solvers!.delete(id);
              if (body.error) {
                solver.reject(
                  new Error(body.error.message || 'Sampling failed'),
                );
              } else {
                solver.resolve(body.result);
              }
              // No response needed for sampling responses
              return null;
            }
          }

          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: 'Method not found',
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Get or create session ID
   */
  private getOrCreateSessionId(request: any): string {
    const existingId =
      request.headers?.get?.('mcp-session-id') ||
      request.headers?.['mcp-session-id'];
    if (existingId) return existingId;

    const newId = crypto.randomUUID();
    this.sessions.create(newId);
    return newId;
  }
}
