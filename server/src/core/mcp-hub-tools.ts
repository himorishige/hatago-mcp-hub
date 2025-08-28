/**
 * MCP Hub Tool Management
 * Handles tool registration, discovery, and invocation
 */

import type { ToolRegistry } from '@hatago/runtime';
import { createMutex, type Mutex } from '@hatago/runtime';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { NpxMcpServer } from '../servers/npx-mcp-server.js';
import type { RemoteMcpServer } from '../servers/remote-mcp-server.js';
import type { ServerRegistry } from '../servers/server-registry.js';
import { ErrorCode } from '../utils/error-codes.js';
import { HatagoError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import type { McpConnection } from './types.js';

export class McpHubToolManager {
  private registry: ToolRegistry;
  private serverRegistry: ServerRegistry;
  private connections: Map<string, McpConnection>;
  private server: Server | undefined;
  private registeredTools: Set<string>;
  private toolRegistrationMutex: Mutex;
  private logger: Logger;
  private transport: unknown;

  constructor(
    registry: ToolRegistry,
    serverRegistry: ServerRegistry,
    connections: Map<string, McpConnection>,
    server: Server | undefined,
    logger: Logger,
    transport?: any,
  ) {
    this.registry = registry;
    this.serverRegistry = serverRegistry;
    this.connections = connections;
    this.server = server;
    this.logger = logger;
    this.transport = transport;
    this.registeredTools = new Set();
    this.toolRegistrationMutex = createMutex();
    this.progressCallbacks = new Map();
    (this as any).initialized = false;
  }

  setInitialized(value: boolean): void {
    (this as any).initialized = value;
  }

  setTransport(transport: any): void {
    this.transport = transport;
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
      async (request: any, extra?: any) => {
        const { name, arguments: args } = request.params;
        const progressToken = request.params?._meta?.progressToken;
        this.logger.info(`Calling tool: ${name}`);

        // Set interval for sending progress notifications
        let progressInterval: NodeJS.Timeout | undefined;
        let progressCount = 0;

        // Use transport from this instance
        const transport = this.transport;

        if (
          progressToken &&
          transport &&
          typeof transport === 'object' &&
          'sendProgressNotification' in transport
        ) {
          // Get requestId from extra or request id
          const requestId = extra?.requestId || (request as any).id;

          progressInterval = setInterval(() => {
            try {
              // Send progress notification via transport
              if (
                transport &&
                typeof transport === 'object' &&
                'sendProgressNotification' in transport
              ) {
                (transport as any).sendProgressNotification(
                  requestId,
                  progressToken,
                  progressCount++,
                  // total is omitted (when unknown)
                );
              }
            } catch (_e) {
              // Ignore errors
            }
          }, 1000); // Send every second
        }

        try {
          const result = await this.callTool(name, args, progressToken);

          // Stop progress notifications
          if (progressInterval) {
            clearInterval(progressInterval);
          }

          return result;
        } catch (error) {
          this.logger.error({ error }, `Tool call failed: ${name}`);

          // Stop progress notifications
          if (progressInterval) {
            clearInterval(progressInterval);
          }

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

    this.logger.debug(`$1`);

    const serverInstance = server.instance as NpxMcpServer | undefined;
    if (!serverInstance || typeof serverInstance.getTools !== 'function') {
      this.logger.debug(`$1`);
      return;
    }

    const tools = serverInstance.getTools();
    this.logger.debug(`$1`);

    // Register all tools
    this.registry.registerServerTools(serverId, tools);

    // Update hub tools
    await this.updateHubTools();
  }

  /**
   * Refresh tools for remote server
   */
  async refreshRemoteServerTools(serverId: string): Promise<void> {
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

    // Check if server has registered itself
    const registeredServer = this.serverRegistry
      .listServers()
      .find((s) => s.id === serverId);

    if (!registeredServer) {
      this.logger.debug(`$1`);
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
      'Registered server',
    );

    // Wait for initialization if needed
    if (registeredServer.state === 'starting') {
      this.logger.debug(`$1`);
      return;
    }

    if (registeredServer.state !== 'running') {
      this.logger.debug(`$1`);
      return;
    }

    // Get tools from remote server
    try {
      const tools = await serverInstance.listTools();
      this.logger.debug(`$1`);

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
      this.logger.debug(`Hub now has ${tools.length} total tools`);

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
  async callTool(
    name: string,
    args: unknown,
    progressToken?: string | number,
  ): Promise<unknown> {
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

    // Call tool through appropriate method based on connection type
    this.logger.info(`Forwarding tool call ${name} to server ${serverId}`);
    try {
      let result: unknown = null;

      if (connection.type === 'npx' && connection.npxServer) {
        // NPX server - use the server instance directly
        result = await connection.npxServer.callTool(
          toolInfo.originalName,
          args,
          progressToken,
        );
      } else if (connection.type === 'remote' && connection.remoteServer) {
        // Remote server - use the server instance directly
        result = await connection.remoteServer.callTool(
          toolInfo.originalName,
          args,
          progressToken,
        );
      } else if (connection.transport) {
        // Local server - use transport.request
        result = await connection.transport.request({
          method: 'tools/call',
          params: {
            name: toolInfo.originalName,
            arguments: args,
          },
        });
      } else {
        throw new Error(
          `No valid method to call tool for connection type: ${connection.type}`,
        );
      }

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
