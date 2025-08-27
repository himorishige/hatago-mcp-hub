/**
 * MCP Hub Resource Management
 * Handles resource registration, discovery, and access
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import type { ServerRegistry } from '../servers/server-registry.js';
import { ErrorCode } from '../utils/error-codes.js';
import { HatagoError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import type { ResourceRegistry } from './resource-registry.js';
import type { McpConnection } from './types.js';

export class McpHubResourceManager {
  private resourceRegistry: ResourceRegistry;
  private serverRegistry: ServerRegistry;
  private connections: Map<string, McpConnection>;
  private server: Server | undefined;
  private logger: Logger;
  private initialized: boolean;

  constructor(
    resourceRegistry: ResourceRegistry,
    serverRegistry: ServerRegistry,
    connections: Map<string, McpConnection>,
    server: Server | undefined,
    logger: Logger,
  ) {
    this.resourceRegistry = resourceRegistry;
    this.serverRegistry = serverRegistry;
    this.connections = connections;
    this.server = server;
    this.logger = logger;
    this.initialized = false;
  }

  setInitialized(value: boolean): void {
    this.initialized = value;
  }

  /**
   * Setup resource handlers for MCP server
   */
  setupResourceHandlers(): void {
    if (!this.server) {
      this.logger.warn(
        'Cannot setup resource handlers: server not initialized',
      );
      return;
    }

    // List available resources
    // Use internal _requestHandlers as Server class doesn't expose resource handler methods
    (this.server as any)._requestHandlers.set(
      'resources/list',
      async (_request: any) => {
        const resources = this.resourceRegistry.getAllResources();
        this.logger.debug(`Listing ${resources.length} resources`);

        return {
          resources: resources.map((resource) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
          })),
        };
      },
    );

    // Read resource content
    (this.server as any)._requestHandlers.set(
      'resources/read',
      async (request: any) => {
        const { uri } = request.params;
        this.logger.info(`Reading resource: ${uri}`);

        // Find resource registration
        const resourceInfo = this.resourceRegistry.resolveResource(uri);
        if (!resourceInfo) {
          throw new HatagoError(
            ErrorCode.RESOURCE_NOT_FOUND,
            `Resource ${uri} not found`,
            {
              context: { uri },
            },
          );
        }

        const { originalUri, serverId } = resourceInfo;

        // Find server connection
        const connection = this.connections.get(serverId);
        if (!connection) {
          throw new HatagoError(
            ErrorCode.SERVER_NOT_CONNECTED,
            `Server ${serverId} not connected`,
            {
              context: { serverId, uri },
            },
          );
        }

        // Read resource through appropriate method based on connection type
        this.logger.info(
          `Forwarding resource read ${uri} to server ${serverId}`,
        );
        try {
          let result: unknown = null;

          if (connection.type === 'npx' && connection.npxServer) {
            // NPX server - use the server instance directly
            result = await connection.npxServer.readResource(originalUri);
          } else if (connection.type === 'remote' && connection.remoteServer) {
            // Remote server - use the server instance directly
            result = await connection.remoteServer.readResource(originalUri);
          } else if (connection.transport) {
            // Local server - use transport.request
            result = await connection.transport.request({
              method: 'resources/read',
              params: { uri: originalUri },
            });
          } else {
            throw new Error(
              `No valid method to read resource for connection type: ${connection.type}`,
            );
          }

          this.logger.debug(`Resource read ${uri} succeeded`);
          return result;
        } catch (error) {
          this.logger.error({ error }, `Resource read ${uri} failed`);
          throw error;
        }
      },
    );

    this.logger.info('Resource handlers registered');
  }

  /**
   * Refresh resources for NPX server
   */
  async refreshNpxServerResources(serverId: string): Promise<void> {
    const server = this.serverRegistry
      .listServers()
      .find((s) => s.id === serverId);
    if (!server) return;

    this.logger.debug(`$1`);

    const serverInstance = server.instance as NpxMcpServer | undefined;
    if (!serverInstance || typeof serverInstance.getResources !== 'function') {
      this.logger.debug(`$1`);
      return;
    }

    const resources = serverInstance.getResources();
    this.logger.debug(`$1`);

    // Register all resources
    this.resourceRegistry.registerServerResources(serverId, resources);

    // Update hub resources
    this.updateHubResources();
  }

  /**
   * Refresh resources for remote server
   */
  async refreshRemoteServerResources(serverId: string): Promise<void> {
    this.logger.debug(`$1`);

    const server = this.serverRegistry
      .listServers()
      .find((s) => s.id === serverId);
    if (!server) {
      this.logger.debug(`$1`);
      return;
    }

    const serverInstance = server.instance as RemoteMcpServer | undefined;
    if (!serverInstance) {
      this.logger.debug(`$1`);
      return;
    }

    // Get resources from remote server
    try {
      const resources = await serverInstance.listResources();
      if (!resources || resources.length === 0) {
        this.logger.warn(
          `Server ${serverId} doesn't support resources/list method`,
        );
        return;
      }

      this.logger.debug(`$1`);

      // Register all resources
      this.resourceRegistry.registerServerResources(serverId, resources);

      // Update hub resources
      this.updateHubResources();
    } catch (_error) {
      // Don't log as error since many servers don't support resources
      this.logger.warn(
        `Server ${serverId} doesn't support resources/list method`,
      );
    }
  }

  /**
   * Update hub resources
   */
  private updateHubResources(): void {
    const resources = this.resourceRegistry.getAllResources();
    this.logger.debug(`Hub now has ${resources.length} total resources`);

    // Debug: Log the first resource to see its structure
    if (resources.length > 0) {
      this.logger.debug({ resource: resources[0] }, 'First resource structure');
    }

    // Notify clients that resource list has changed (if capability is registered)
    this.notifyResourcesChanged();
  }

  /**
   * Notify clients that the resource list has changed
   * This implements the MCP resources/list_changed notification
   */
  private notifyResourcesChanged(): void {
    // Don't send notifications during startup or if no client is connected
    // This prevents errors when NPX servers discover resources before a client connects
    if (!this.initialized) {
      return;
    }

    try {
      // Check if server is connected before sending notification
      if (!this.server) {
        return;
      }

      // Use SDK's isConnected() method to reliably check connection state
      // This prevents "Not connected" errors when resources are discovered
      // before client connection or during server restarts
      // TODO: isConnected is not available on SDK Server
      // if (!this.server.isConnected()) {
      if (!this.server) {
        // Connection not established yet, skip notification
        return;
      }

      // Check if we have registered the listChanged capability
      // TODO: getCapabilities is private in SDK Server - need alternative approach
      // TODO: Re-enable when capability tracking is implemented
      // const capabilities = this.server.getCapabilities();
      // if (capabilities?.resources?.listChanged) {
      //   this.server.notification({
      //     method: 'notifications/resources/list_changed',
      //     params: {},
      //   });
      //   this.logger.info('Sent resources/list_changed notification');
      // }
    } catch (error) {
      // Log unexpected errors, but don't crash
      this.logger.debug(
        { error },
        'Failed to send resources/list_changed notification',
      );
    }
  }

  /**
   * Refresh prompts for NPX server
   */
  async refreshNpxServerPrompts(serverId: string): Promise<void> {
    const server = this.serverRegistry
      .listServers()
      .find((s) => s.id === serverId);
    if (!server) return;

    const serverInstance = server.instance as NpxMcpServer | undefined;
    if (!serverInstance || typeof serverInstance.getPrompts !== 'function') {
      this.logger.debug(
        `Server ${serverId} doesn't implement prompts/list (not all servers support prompts)`,
      );
      return;
    }

    // Note: Prompts are not yet implemented in registry
    // This is a placeholder for future prompt support
    const prompts = serverInstance.getPrompts?.() ?? [];
    if (prompts.length > 0) {
      this.logger.debug(`$1`);
      // TODO: Register prompts when prompt registry is implemented
    }

    // Update hub prompts
    this.updateHubPrompts();
  }

  /**
   * Update hub prompts
   */
  private updateHubPrompts(): void {
    const prompts: any[] = []; // TODO: Add proper type
    this.logger.debug(`Hub now has ${prompts.length} total prompts`);

    // Debug: Log the first prompt to see its structure
    if (prompts.length > 0) {
      this.logger.debug({ prompt: prompts[0] }, 'First prompt structure');
    }

    // Notify clients that prompt list has changed (if capability is registered)
    this.notifyPromptsChanged();
  }

  /**
   * Notify clients that the prompt list has changed
   * This implements the MCP prompts/list_changed notification
   */
  private notifyPromptsChanged(): void {
    // Don't send notifications during startup or if no client is connected
    // This prevents errors when NPX servers discover prompts before a client connects
    if (!this.initialized) {
      return;
    }

    try {
      // Check if server is connected before sending notification
      if (!this.server) {
        return;
      }

      // Use SDK's isConnected() method to reliably check connection state
      // This prevents "Not connected" errors when prompts are discovered
      // before client connection or during server restarts
      // TODO: isConnected is not available on SDK Server
      // if (!this.server.isConnected()) {
      if (!this.server) {
        // Connection not established yet, skip notification
        return;
      }

      // Check if we have registered the listChanged capability
      // TODO: getCapabilities is private in SDK Server - need alternative approach
      // TODO: Re-enable when capability tracking is implemented
      // const capabilities = this.server.getCapabilities();
      // if (capabilities?.prompts?.listChanged) {
      //   this.server.notification({
      //     method: 'notifications/prompts/list_changed',
      //     params: {},
      //   });
      //   this.logger.info('Sent prompts/list_changed notification');
      // }
    } catch (error) {
      // Log unexpected errors, but don't crash
      this.logger.debug(
        { error },
        'Failed to send prompts/list_changed notification',
      );
    }
  }
}
