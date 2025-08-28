/**
 * Connection management for MCP Hub
 * Handles server connections and lifecycle
 */

import type {
  PromptRegistry,
  ResourceRegistry,
  ToolRegistry,
} from '@hatago/runtime';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  NpxServerConfig,
  RemoteServerConfig,
  ServerConfig,
} from '../config/types.js';
import type { Platform } from '../platform/types.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpConnection } from '../servers/remote-mcp-connection.js';
import type { ServerRegistry } from '../servers/server-registry.js';
import { ErrorHelpers } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { ResourceTemplateRegistry } from './resource-template-registry.js';

/**
 * Connection manager configuration
 */
export interface ConnectionManagerConfig {
  platform: Platform;
  toolRegistry: ToolRegistry;
  resourceRegistry: ResourceRegistry;
  promptRegistry: PromptRegistry;
  resourceTemplateRegistry?: ResourceTemplateRegistry;
  serverRegistry: ServerRegistry;
}

/**
 * Connection result
 */
export interface ConnectionResult {
  success: boolean;
  serverId: string;
  client?: Client;
  error?: Error;
}

/**
 * Manages server connections for MCP Hub
 */
export class McpHubConnectionManager {
  private platform: Platform;
  private toolRegistry: ToolRegistry;
  private resourceRegistry: ResourceRegistry;
  private promptRegistry: PromptRegistry;
  private resourceTemplateRegistry?: ResourceTemplateRegistry;
  private serverRegistry: ServerRegistry;
  private connections: Map<string, RemoteMcpConnection> = new Map();

  constructor(config: ConnectionManagerConfig) {
    this.platform = config.platform;
    this.toolRegistry = config.toolRegistry;
    this.resourceRegistry = config.resourceRegistry;
    this.promptRegistry = config.promptRegistry;
    this.resourceTemplateRegistry = config.resourceTemplateRegistry;
    this.serverRegistry = config.serverRegistry;
  }

  /**
   * Connect to a server
   */
  async connectServer(serverConfig: ServerConfig): Promise<ConnectionResult> {
    const serverId = serverConfig.id;
    logger.info(`Connecting to server: ${serverId}`);

    try {
      // Check if already connected
      if (this.serverRegistry.hasServer(serverId)) {
        logger.warn(`Server ${serverId} is already connected`);
        return {
          success: false,
          serverId,
          error: new Error(`Server ${serverId} is already connected`),
        };
      }

      // Create appropriate server instance
      const server = await this.createServer(serverConfig);

      // Connect to server
      const client = await server.connect();

      // Register server
      this.serverRegistry.registerServer(serverId, {
        config: serverConfig,
        server,
        client,
      });

      // Store connection for remote servers
      if (
        serverConfig.type === 'remote' &&
        server instanceof RemoteMcpConnection
      ) {
        this.connections.set(serverId, server);
      }

      // Discover and register server capabilities
      await this.discoverCapabilities(serverId, client);

      logger.info(`Successfully connected to server: ${serverId}`);
      return {
        success: true,
        serverId,
        client,
      };
    } catch (error) {
      logger.error(`Failed to connect to server ${serverId}:`, error);
      return {
        success: false,
        serverId,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnectServer(serverId: string): Promise<void> {
    logger.info(`Disconnecting from server: ${serverId}`);

    try {
      // Get server info
      const serverInfo = this.serverRegistry.getServer(serverId);
      if (!serverInfo) {
        logger.warn(`Server ${serverId} not found`);
        return;
      }

      // Unregister capabilities
      this.unregisterCapabilities(serverId);

      // Disconnect based on server type
      if (serverInfo.server) {
        await this.disconnectByType(serverId, serverInfo.server);
      }

      // Remove from registry
      this.serverRegistry.unregisterServer(serverId);

      // Clean up connection
      this.connections.delete(serverId);

      logger.info(`Successfully disconnected from server: ${serverId}`);
    } catch (error) {
      logger.error(`Error disconnecting from server ${serverId}:`, error);
      throw ErrorHelpers.createConnectionError(
        `Failed to disconnect from server ${serverId}`,
        serverId,
      );
    }
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    const serverIds = this.serverRegistry.getAllServerIds();

    logger.info(`Disconnecting from ${serverIds.length} servers`);

    const results = await Promise.allSettled(
      serverIds.map((id) => this.disconnectServer(id)),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      logger.warn(`Failed to disconnect from ${failures.length} servers`);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(
    serverId: string,
  ): 'connected' | 'disconnected' | 'error' {
    const serverInfo = this.serverRegistry.getServer(serverId);
    if (!serverInfo) return 'disconnected';

    // Check if connection is healthy
    const connection = this.connections.get(serverId);
    if (connection) {
      return connection.isConnected() ? 'connected' : 'error';
    }

    return 'connected';
  }

  /**
   * Get all connections
   */
  getAllConnections(): Map<string, RemoteMcpConnection> {
    return new Map(this.connections);
  }

  /**
   * Create server instance based on config
   */
  private async createServer(config: ServerConfig): Promise<any> {
    switch (config.type) {
      case 'npx':
        return this.createNpxServer(config as NpxServerConfig);

      case 'remote':
        return this.createRemoteServer(config as RemoteServerConfig);

      case 'local':
        return this.createLocalServer(config);

      default:
        throw new Error(`Unsupported server type: ${(config as any).type}`);
    }
  }

  /**
   * Create NPX server
   */
  private async createNpxServer(
    config: NpxServerConfig,
  ): Promise<NpxMcpServer> {
    const { createNpxMcpServer } = await import('../servers/npx-mcp-server.js');
    return createNpxMcpServer(config, this.platform);
  }

  /**
   * Create remote server
   */
  private async createRemoteServer(
    config: RemoteServerConfig,
  ): Promise<RemoteMcpConnection> {
    const { createRemoteMcpConnection } = await import(
      '../servers/remote-mcp-connection.js'
    );
    return createRemoteMcpConnection(config);
  }

  /**
   * Create local server
   */
  private async createLocalServer(config: ServerConfig): Promise<any> {
    const { createCustomStdioTransport } = await import(
      '../servers/custom-stdio-transport.js'
    );
    const transport = await createCustomStdioTransport(
      {
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        cwd: config.cwd,
      },
      this.platform,
    );

    const { Client } = await import(
      '@modelcontextprotocol/sdk/client/index.js'
    );
    const client = new Client(
      {
        name: `hatago-hub-${config.id}`,
        version: '0.0.1',
      },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);
    return client;
  }

  /**
   * Disconnect based on server type
   */
  private async disconnectByType(
    _serverId: string,
    server: any,
  ): Promise<void> {
    if (server.disconnect) {
      await server.disconnect();
    } else if (server.close) {
      await server.close();
    }
  }

  /**
   * Discover server capabilities
   */
  private async discoverCapabilities(
    serverId: string,
    client: Client,
  ): Promise<void> {
    try {
      // Discover tools
      const toolsResult = await client.listTools();
      if (toolsResult.tools && toolsResult.tools.length > 0) {
        this.toolRegistry.registerServerTools(serverId, toolsResult.tools);
        logger.info(
          `Registered ${toolsResult.tools.length} tools from ${serverId}`,
        );
      }

      // Discover resources
      const resourcesResult = await client.listResources();
      if (resourcesResult.resources && resourcesResult.resources.length > 0) {
        this.resourceRegistry.registerServerResources(
          serverId,
          resourcesResult.resources,
        );
        logger.info(
          `Registered ${resourcesResult.resources.length} resources from ${serverId}`,
        );
      }

      // Discover prompts
      const promptsResult = await client.listPrompts();
      if (promptsResult.prompts && promptsResult.prompts.length > 0) {
        this.promptRegistry.registerServerPrompts(
          serverId,
          promptsResult.prompts,
        );
        logger.info(
          `Registered ${promptsResult.prompts.length} prompts from ${serverId}`,
        );
      }

      // Discover resource templates if available
      if (this.resourceTemplateRegistry && client.listResourceTemplates) {
        const templatesResult = await client.listResourceTemplates();
        if (templatesResult.resourceTemplates) {
          this.resourceTemplateRegistry.registerTemplates(
            serverId,
            templatesResult.resourceTemplates,
          );
          logger.info(
            `Registered ${templatesResult.resourceTemplates.length} resource templates from ${serverId}`,
          );
        }
      }
    } catch (error) {
      logger.warn(`Failed to discover capabilities for ${serverId}:`, error);
    }
  }

  /**
   * Unregister server capabilities
   */
  private unregisterCapabilities(serverId: string): void {
    this.toolRegistry.unregisterServerTools(serverId);
    this.resourceRegistry.clearServerResources(serverId);
    this.promptRegistry.unregisterServerPrompts(serverId);

    if (this.resourceTemplateRegistry) {
      this.resourceTemplateRegistry.clearServerTemplates(serverId);
    }
  }
}

/**
 * Create connection manager
 */
export function createConnectionManager(
  config: ConnectionManagerConfig,
): McpHubConnectionManager {
  return new McpHubConnectionManager(config);
}
