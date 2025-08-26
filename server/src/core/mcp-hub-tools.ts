/**
 * MCP Hub Tool Management
 * Handles tool registration, discovery, and invocation
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import type { ServerRegistry } from '../servers/server-registry.js';
import { ErrorCode } from '../utils/error-codes.js';
import { HatagoError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import { createMutex, type Mutex } from '../utils/mutex.js';
import type { ToolRegistry } from './tool-registry.js';
import type { McpConnection } from './types.js';

export class McpHubToolManager {
  private registry: ToolRegistry;
  private serverRegistry: ServerRegistry;
  private connections: Map<string, McpConnection>;
  private server: Server | undefined;
  private registeredTools: Set<string>;
  private toolRegistrationMutex: Mutex;
  private logger: Logger;

  constructor(
    registry: ToolRegistry,
    serverRegistry: ServerRegistry,
    connections: Map<string, McpConnection>,
    server: Server | undefined,
    logger: Logger,
  ) {
    this.registry = registry;
    this.serverRegistry = serverRegistry;
    this.connections = connections;
    this.server = server;
    this.logger = logger;
    this.registeredTools = new Set();
    this.toolRegistrationMutex = createMutex();
    this.initialized = false;
  }

  setInitialized(value: boolean): void {
    this.initialized = value;
  }

  /**
   * Setup tool handlers for MCP server
   */
  setupToolHandlers(): void {
    if (!this.server) {
      this.logger.warn('Cannot setup tool handlers: server not initialized');
      return;
    }

    // List available tools
    // Use internal _requestHandlers as Server class doesn't expose tool handler methods
    (this.server as any)._requestHandlers.set('tools/list', async () => {
      const tools = this.registry.getAllTools();
      this.logger.debug(`Listing ${tools.length} tools`);

      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Handle tool calls
    (this.server as any)._requestHandlers.set(
      'tools/call',
      async (request: any) => {
        const { name, arguments: args } = request.params;
        this.logger.info(`Calling tool: ${name}`);

        try {
          const result = await this.callTool(name, args);
          return result;
        } catch (error) {
          this.logger.error({ error }, `Tool call failed: ${name}`);

          if (error instanceof HatagoError) {
            throw error;
          }

          // Wrap unknown errors
          throw new HatagoError(
            ErrorCode.TOOL_NOT_FOUND,
            `Tool ${name} failed`,
            {
              context: {
                toolName: name,
                originalError: error,
              },
            },
          );
        }
      },
    );

    this.logger.info('Tool handlers registered');
  }

  /**
   * Refresh tools for NPX server
   */
  async refreshNpxServerTools(serverId: string): Promise<void> {
    const server = this.serverRegistry
      .listServers()
      .find((s) => s.id === serverId);
    if (!server) return;

    this.logger.debug(`[DEBUG] refreshNpxServerTools called for ${serverId}`);

    const serverInstance = server.instance as NpxMcpServer | undefined;
    if (!serverInstance || typeof serverInstance.getTools !== 'function') {
      this.logger.debug(
        `[DEBUG] No tools found for ${serverId}, attempting discovery...`,
      );
      return;
    }

    const tools = serverInstance.getTools();
    this.logger.debug(
      `[DEBUG] Discovered ${tools.length} tools from ${serverId}`,
    );

    // Register all tools
    this.registry.registerServerTools(serverId, tools);

    // Update hub tools
    await this.updateHubTools();
  }

  /**
   * Refresh tools for remote server
   */
  async refreshRemoteServerTools(serverId: string): Promise<void> {
    this.logger.debug(
      `[DEBUG] refreshRemoteServerTools called for ${serverId}`,
    );

    const server = this.serverRegistry
      .listServers()
      .find((s) => s.id === serverId);
    if (!server) {
      this.logger.debug(`[DEBUG] Server ${serverId} not found`);
      return;
    }

    const serverInstance = server.instance as RemoteMcpServer | undefined;
    if (!serverInstance) {
      this.logger.debug(`[DEBUG] No instance for ${serverId}`);
      return;
    }

    // Check if server has registered itself
    const registeredServer = this.serverRegistry
      .listServers()
      .find((s) => s.id === serverId);

    if (!registeredServer) {
      this.logger.debug(`[DEBUG] Server ${serverId} not yet registered`);
      return;
    }

    this.logger.debug(
      {
        server: {
          id: registeredServer.id,
          state: registeredServer.state,
          hasInstance: !!registeredServer.instance,
        },
      },
      '[DEBUG] Registered server',
    );

    // Wait for initialization if needed
    if (registeredServer.state === 'starting') {
      this.logger.debug(
        `[DEBUG] Server ${serverId} is still starting, waiting...`,
      );
      return;
    }

    if (registeredServer.state !== 'running') {
      this.logger.debug(
        `[DEBUG] Server ${serverId} is not running: ${registeredServer.state}`,
      );
      return;
    }

    // Get tools from remote server
    try {
      const tools = await serverInstance.listTools();
      this.logger.debug(
        `[DEBUG] Discovered ${tools.length} tools from ${serverId}`,
      );

      // Register all tools
      this.registry.registerServerTools(serverId, tools);

      // Update hub tools
      await this.updateHubTools();
    } catch (error) {
      this.logger.error({ error }, `Failed to refresh tools for ${serverId}`);
    }
  }

  /**
   * Update hub tools
   */
  async updateHubTools(): Promise<void> {
    // Use mutex to prevent concurrent tool registration
    await this.toolRegistrationMutex.runExclusive(async () => {
      const tools = this.registry.getAllTools();
      this.logger.info(`Hub now has ${tools.length} total tools`);

      // Debug: Log the first tool to see its structure
      if (tools.length > 0) {
        this.logger.debug(
          `First tool structure: ${JSON.stringify(tools[0], null, 2)}`,
        );
      }

      // Note: Tool registration with SDK is handled in setupToolHandlers
      // via request handlers. We don't need to use server.addTool here
      // since Server class doesn't have that method (only McpServer does).

      // Just track which tools we have
      for (const tool of tools) {
        this.registeredTools.add(tool.name);
      }
    });
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: unknown): Promise<unknown> {
    this.logger.info(`Hub handling tool call: ${name}`);

    // Find tool registration
    const toolInfo = this.registry.getTool(name);
    if (!toolInfo) {
      throw new HatagoError(
        ErrorCode.TOOL_NOT_FOUND,
        `Tool ${name} not found`,
        {
          context: {
            toolName: name,
          },
        },
      );
    }

    const { serverId } = toolInfo;

    // Find server connection
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new HatagoError(
        ErrorCode.SERVER_NOT_CONNECTED,
        `Server ${serverId} not connected`,
        {
          context: {
            serverId,
            toolName: name,
          },
        },
      );
    }

    // Call tool through transport
    this.logger.info(`Forwarding tool call ${name} to server ${serverId}`);
    try {
      const result = await connection.transport.request({
        method: 'tools/call',
        params: {
          name: toolInfo.originalName,
          arguments: args,
        },
      });

      this.logger.debug({ result }, `Tool call ${name} succeeded`);
      return result;
    } catch (error) {
      this.logger.error({ error }, `Tool call ${name} failed`);

      // Throw appropriate error based on error type
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new HatagoError(
            ErrorCode.TOOL_TIMEOUT,
            `Tool ${name} timed out`,
            {
              context: {
                toolName: name,
                serverId,
                originalError: error,
              },
            },
          );
        }
        throw new HatagoError(
          ErrorCode.TOOL_EXECUTION_FAILED,
          `Tool ${name} failed: ${error.message}`,
          {
            context: {
              toolName: name,
              serverId,
              originalError: error,
            },
          },
        );
      }

      throw new HatagoError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        `Tool ${name} failed`,
        {
          context: {
            toolName: name,
            serverId,
            originalError: error,
          },
        },
      );
    }
  }
}
