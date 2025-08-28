/**
 * MCP Hub Prompt Management
 * Handles prompt registration, discovery, and invocation
 */

import type { PromptRegistry } from '@hatago/runtime';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import type { ServerRegistry } from '../servers/server-registry.js';
import { ErrorCode } from '../utils/error-codes.js';
import { HatagoError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import type { McpConnection } from './types.js';

export class McpHubPromptManager {
  private promptRegistry: PromptRegistry;
  private serverRegistry: ServerRegistry;
  private connections: Map<string, McpConnection>;
  private server: Server | undefined;
  private logger: Logger;
  private initialized: boolean;

  constructor(
    promptRegistry: PromptRegistry,
    serverRegistry: ServerRegistry,
    connections: Map<string, McpConnection>,
    server: Server | undefined,
    logger: Logger,
  ) {
    this.promptRegistry = promptRegistry;
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
   * Setup prompt handlers for MCP server
   */
  setupPromptHandlers(): void {
    if (!this.server) {
      this.logger.warn('Cannot setup prompt handlers: server not initialized');
      return;
    }

    // List available prompts
    // Use internal _requestHandlers as Server class doesn't expose prompt handler methods
    (this.server as any)._requestHandlers.set(
      'prompts/list',
      async (_request: any) => {
        const prompts = this.promptRegistry.getAllPrompts();
        this.logger.debug(`Listing ${prompts.length} prompts`);

        return {
          prompts: prompts.map((prompt) => ({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments,
          })),
        };
      },
    );

    // Get prompt by name
    (this.server as any)._requestHandlers.set(
      'prompts/get',
      async (request: any) => {
        const { name, arguments: args } = request.params;
        this.logger.info(`Getting prompt: ${name}`);

        const promptInfo = this.promptRegistry.getPrompt(name);
        if (!promptInfo) {
          throw new HatagoError(
            ErrorCode.PROMPT_NOT_FOUND,
            `Prompt ${name} not found`,
            {
              context: { promptName: name },
            },
          );
        }

        // Resolve to get server information
        const resolved = this.promptRegistry.resolvePrompt(name);
        if (!resolved) {
          throw new HatagoError(
            ErrorCode.PROMPT_NOT_FOUND,
            `Cannot resolve prompt ${name}`,
            {
              context: { promptName: name },
            },
          );
        }

        const { originalName, serverId } = resolved;

        // Find server connection
        const connection = this.connections.get(serverId);
        if (!connection) {
          throw new HatagoError(
            ErrorCode.SERVER_NOT_CONNECTED,
            `Server ${serverId} not connected`,
            {
              context: { serverId, promptName: name },
            },
          );
        }

        // Get prompt through appropriate method based on connection type
        this.logger.info(`Forwarding prompt get ${name} to server ${serverId}`);
        try {
          let result: unknown = null;

          if (connection.type === 'npx' && connection.npxServer) {
            // NPX server - use the server instance directly
            result = await connection.npxServer.getPrompt(originalName, args);
          } else if (connection.type === 'remote' && connection.remoteServer) {
            // Remote server - use the server instance directly
            result = await connection.remoteServer.getPrompt(
              originalName,
              args,
            );
          } else if (connection.transport) {
            // Local server - use transport.request
            result = await connection.transport.request({
              method: 'prompts/get',
              params: {
                name: originalName,
                arguments: args,
              },
            });
          } else {
            throw new Error(
              `No valid method to get prompt for connection type: ${connection.type}`,
            );
          }

          this.logger.debug(`Prompt get ${name} succeeded`);
          return result;
        } catch (error) {
          this.logger.error({ error }, `Prompt get ${name} failed`);
          throw error;
        }
      },
    );

    this.logger.info('Prompt handlers registered');
  }

  /**
   * Refresh prompts for NPX server
   */
  async refreshNpxServerPrompts(serverId: string): Promise<void> {
    this.logger.debug(`refreshNpxServerPrompts called for ${serverId}`);
    const server = this.serverRegistry
      .listServers()
      .find((s) => s.id === serverId);
    if (!server) {
      this.logger.debug(`Server ${serverId} not found in registry`);
      return;
    }

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
    this.logger.debug(`Got ${prompts.length} prompts from ${serverId}`);
    if (prompts.length > 0) {
      this.logger.debug(`$1`);
      // Register all prompts
      this.promptRegistry.registerServerPrompts(serverId, prompts);
      this.logger.debug(`Registered ${prompts.length} prompts for ${serverId}`);
    } else {
      this.logger.debug(`No prompts found for ${serverId}`);
    }

    // Update hub prompts
    this.updateHubPrompts();
  }

  /**
   * Refresh prompts for remote server
   */
  async refreshRemoteServerPrompts(serverId: string): Promise<void> {
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

    // Get prompts from remote server
    try {
      const prompts = await serverInstance.listPrompts();
      if (!prompts || prompts.length === 0) {
        this.logger.warn(
          `Server ${serverId} doesn't support prompts/list method`,
        );
        return;
      }

      this.logger.debug(`$1`);

      // Register all prompts
      this.promptRegistry.registerServerPrompts(serverId, prompts);

      // Update hub prompts
      this.updateHubPrompts();
    } catch (_error) {
      // Don't log as error since many servers don't support prompts
      this.logger.warn(
        `Server ${serverId} doesn't support prompts/list method`,
      );
    }
  }

  /**
   * Update hub prompts
   */
  private updateHubPrompts(): void {
    const prompts = this.promptRegistry.getAllPrompts();
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
