/**
 * MCP Hub - Slim Coordinator Layer
 * Coordinates between various managers for MCP protocol handling
 */

import {
  createPromptRegistry,
  createResourceRegistry,
  McpRouter,
  type PromptRegistry,
  type ResourceRegistry,
  SessionManager,
  ToolRegistry,
} from '@hatago/runtime';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { HatagoConfig } from '../config/types.js';
import { APP_NAME, APP_VERSION } from '../constants.js';
import type { StreamableHTTPTransport } from '../hono-mcp/index.js';
import type { Platform } from '../platform/types.js';
import { ServerRegistry } from '../servers/server-registry.js';
import type { RegistryStorage } from '../storage/registry-storage.js';
import { logger } from '../utils/logger.js';
import {
  createConnectionManager,
  type McpHubConnectionManager,
} from './mcp-hub-connections.js';
import { createDiscovery, type McpHubDiscovery } from './mcp-hub-discovery.js';
import { createHandlers, type McpHubHandlers } from './mcp-hub-handlers.js';
import {
  createLifecycleManager,
  type McpHubLifecycleManager,
} from './mcp-hub-lifecycle.js';
import { McpHubPromptManager } from './mcp-hub-prompts.js';
import { McpHubResourceManager } from './mcp-hub-resources.js';
import { McpHubToolManager } from './mcp-hub-tools.js';
import { ResourceTemplateRegistry } from './resource-template-registry.js';

/**
 * MCP Hub - Coordinates all managers
 */
export class McpHub {
  // Core components
  private server: McpServer;
  private config: HatagoConfig;

  // Registries
  private toolRegistry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;
  private promptRegistry: PromptRegistry;
  private resourceTemplateRegistry: ResourceTemplateRegistry;
  private serverRegistry: ServerRegistry;

  // Managers
  private router: McpRouter;
  private sessionManager: SessionManager;
  private connectionManager: McpHubConnectionManager;
  private lifecycleManager: McpHubLifecycleManager;
  private handlers: McpHubHandlers;
  private discovery: McpHubDiscovery;
  private toolManager: McpHubToolManager;
  private resourceManager: McpHubResourceManager;
  private promptManager: McpHubPromptManager;

  // State
  private isInitialized = false;
  private connections = new Map<string, any>();

  constructor(
    config: HatagoConfig,
    platform: Platform,
    storage?: RegistryStorage,
  ) {
    this.config = config;
    this.platform = platform;

    // Initialize registries
    this.toolRegistry = new ToolRegistry({
      namingConfig: config.toolNaming,
    });

    this.resourceRegistry = createResourceRegistry({
      namingConfig: config.toolNaming,
    });

    this.promptRegistry = createPromptRegistry();

    this.resourceTemplateRegistry = new ResourceTemplateRegistry(
      config.toolNaming,
    );

    this.serverRegistry = new ServerRegistry();

    // Initialize session manager
    this.sessionManager = new SessionManager({
      sessionTimeout: config.sessionTimeout,
    });

    // Initialize router
    this.router = new McpRouter(
      this.toolRegistry,
      this.resourceRegistry,
      this.promptRegistry,
      {
        namingStrategy: config.toolNaming?.strategy || 'namespace',
        separator: config.toolNaming?.separator || '_',
      },
    );

    // Initialize connection manager
    this.connectionManager = createConnectionManager({
      platform,
      toolRegistry: this.toolRegistry,
      resourceRegistry: this.resourceRegistry,
      promptRegistry: this.promptRegistry,
      resourceTemplateRegistry: this.resourceTemplateRegistry,
      serverRegistry: this.serverRegistry,
    });

    // Initialize lifecycle manager
    this.lifecycleManager = createLifecycleManager({
      platform,
      config,
      storage,
      sessionManager: this.sessionManager,
      serverRegistry: this.serverRegistry,
      connectionManager: this.connectionManager,
    });

    // Initialize handlers
    this.handlers = createHandlers({
      serverRegistry: this.serverRegistry,
      toolRegistry: this.toolRegistry,
      resourceRegistry: this.resourceRegistry,
      promptRegistry: this.promptRegistry,
    });

    // Initialize discovery
    this.discovery = createDiscovery({
      serverRegistry: this.serverRegistry,
      toolRegistry: this.toolRegistry,
      resourceRegistry: this.resourceRegistry,
      promptRegistry: this.promptRegistry,
      resourceTemplateRegistry: this.resourceTemplateRegistry,
    });

    // Initialize MCP server first
    this.server = new McpServer(
      {
        name: APP_NAME,
        version: APP_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    // Initialize protocol managers after server is created
    this.toolManager = new McpHubToolManager(
      this.toolRegistry,
      this.serverRegistry,
      this.connections,
      this.server,
      logger,
    );

    this.resourceManager = new McpHubResourceManager(
      this.resourceRegistry,
      this.serverRegistry,
      this.connections,
      this.server,
      logger,
    );

    this.promptManager = new McpHubPromptManager(
      this.promptRegistry,
      this.serverRegistry,
      this.connections,
      this.server,
      logger,
    );

    // Setup request handlers
    this.setupHandlers();
  }

  /**
   * Initialize the hub
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Hub already initialized');
      return;
    }

    logger.info('Initializing MCP Hub...');

    // Delegate to lifecycle manager
    await this.lifecycleManager.initialize();

    // Connect servers from config
    if (this.config.servers && this.config.servers.length > 0) {
      await this.connectConfiguredServers();
    }

    this.isInitialized = true;
    logger.info('MCP Hub initialized successfully');
  }

  /**
   * Connect to a server
   */
  async connectServer(serverConfig: any): Promise<void> {
    const result = await this.connectionManager.connectServer(serverConfig);

    if (result.success && result.client) {
      // Store connection
      this.connections.set(result.serverId, {
        serverId: result.serverId,
        client: result.client,
        config: serverConfig,
      });

      // Discover capabilities
      await this.discovery.discoverServerCapabilities(
        result.serverId,
        result.client,
      );

      // Update protocol managers
      this.toolManager.setConnections(this.connections);
      this.resourceManager.setConnections(this.connections);
      this.promptManager.setConnections(this.connections);
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnectServer(serverId: string): Promise<void> {
    // Clear capabilities
    this.discovery.clearServerCapabilities(serverId);

    // Remove connection
    this.connections.delete(serverId);

    // Delegate to connection manager
    await this.connectionManager.disconnectServer(serverId);

    // Update protocol managers
    this.toolManager.setConnections(this.connections);
    this.resourceManager.setConnections(this.connections);
    this.promptManager.setConnections(this.connections);
  }

  /**
   * Serve the hub
   */
  async serve(transport: StreamableHTTPTransport | any): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    logger.info('Starting MCP Hub server...');

    // Connect transport
    await this.server.connect(transport);

    // Update protocol managers
    this.toolManager.setServer(this.server);
    this.resourceManager.setServer(this.server);
    this.promptManager.setServer(this.server);
    this.toolManager.setTransport(transport);

    logger.info('MCP Hub server started successfully');
  }

  /**
   * Shutdown the hub
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP Hub...');

    // Delegate to lifecycle manager
    await this.lifecycleManager.shutdown();

    // Clear connections
    this.connections.clear();

    this.isInitialized = false;
    logger.info('MCP Hub shutdown complete');
  }

  /**
   * Setup request handlers
   */
  private setupHandlers(): void {
    // Debug: Check server instance
    if (!this.server) {
      logger.error('Server instance not initialized before setupHandlers');
      throw new Error('Server not initialized');
    }

    // Debug: Check if setRequestHandler exists
    if (!this.server.setRequestHandler) {
      logger.error('setRequestHandler method not found on server');
      throw new Error('Invalid server instance');
    }

    // Tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handlers.handleToolCall(request);
    });

    // Resource operations
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        return this.handlers.handleResourceRead(request);
      },
    );

    // Prompt operations
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return this.handlers.handlePromptGet(request);
    });

    // Completion
    this.server.setRequestHandler(CompleteRequestSchema, async (request) => {
      return this.handlers.handleResourceComplete(request);
    });

    // Tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.toolRegistry.getAllTools() };
    });

    // Resource listing
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return { resources: this.resourceRegistry.getAllResources() };
    });

    // Prompt listing
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: this.promptRegistry.getAllPrompts() };
    });
  }

  /**
   * Connect configured servers
   */
  private async connectConfiguredServers(): Promise<void> {
    const servers = this.config.servers || [];

    logger.info(`Connecting to ${servers.length} configured servers`);

    const results = await Promise.allSettled(
      servers.map((server) => this.connectServer(server)),
    );

    const successes = results.filter((r) => r.status === 'fulfilled').length;
    const failures = results.filter((r) => r.status === 'rejected').length;

    logger.info(`Connected to ${successes}/${servers.length} servers`);

    if (failures > 0) {
      logger.warn(`Failed to connect to ${failures} servers`);
    }
  }

  // Getters for backward compatibility
  getServer() {
    return this.server;
  }
  getRegistry() {
    return this.toolRegistry;
  }
  getConnections() {
    return this.connections;
  }
  getSessionManager() {
    return this.sessionManager;
  }
  getRouter() {
    return this.router;
  }
}

/**
 * Create MCP Hub instance
 */
export function createMcpHub(
  config: HatagoConfig,
  platform: Platform,
  storage?: RegistryStorage,
): McpHub {
  return new McpHub(config, platform, storage);
}
