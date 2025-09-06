/**
 * HubCore - The thin, transparent core of Hatago MCP Hub
 *
 * Design Philosophy:
 * - Don't transform, relay
 * - Don't judge, pass through
 * - Don't maintain state
 * - Don't cache
 *
 * This is the minimal implementation that only:
 * - Initializes connections
 * - Routes requests to servers
 * - Forwards responses back
 * - Closes connections
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ServerSpec } from './types.js';

// Define minimal JSON-RPC types for HubCore
type JSONRPCRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type JSONRPCResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

/**
 * Minimal options for HubCore
 */
export type HubCoreOptions = {
  /** Optional logger for debugging */
  logger?: {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };
};

/**
 * Thin hub core that only relays without transformation
 */
export class HubCore {
  private servers: Map<
    string,
    {
      spec: ServerSpec;
      client?: Client;
      transport?: Transport;
    }
  > = new Map();

  private readonly logger: HubCoreOptions['logger'];
  private closed = false;

  constructor(options: HubCoreOptions = {}) {
    this.logger = options.logger;
  }

  /**
   * Initialize with server configurations
   * No state management, no caching, just connection setup
   */
  init(servers: Record<string, ServerSpec>): void {
    if (this.closed) {
      throw new Error('HubCore is closed');
    }

    // Store server specs without connecting
    // Connection happens on-demand (lazy)
    for (const [id, spec] of Object.entries(servers)) {
      this.servers.set(id, { spec });
    }

    this.logger?.info('HubCore initialized', { serverCount: this.servers.size });
  }

  /**
   * Handle JSON-RPC request - pure relay
   * No transformation, no caching, no state management
   */
  async handle(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (this.closed) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32603,
          message: 'HubCore is closed'
        }
      };
    }

    try {
      // Extract server ID from method if prefixed
      // Format: "serverId__methodName" or just "methodName"
      const { serverId, method } = this.parseMethod(request.method);

      // Get or connect to server (lazy connection)
      const server = await this.getOrConnectServer(serverId);
      if (!server.client) {
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          error: {
            code: -32603,
            message: `Server ${serverId} not available`
          }
        };
      }

      // Pure relay - no transformation
      // Simply forward the request and return the response
      const modifiedRequest = serverId
        ? { ...request, method } // Remove server prefix if present
        : request;

      // Direct passthrough to server
      const response = await this.forwardToServer(server.client, modifiedRequest);

      return response;
    } catch (error) {
      this.logger?.error('Request handling error', error);
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      };
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Close all connected servers
    const closePromises: Promise<void>[] = [];
    for (const [id, server] of this.servers) {
      if (server.transport) {
        this.logger?.debug(`Closing server ${id}`);
        closePromises.push(
          server.transport.close().catch((err) => {
            this.logger?.error(`Error closing server ${id}:`, err);
          })
        );
      }
    }

    await Promise.allSettled(closePromises);
    this.servers.clear();
    this.logger?.info('HubCore closed');
  }

  /**
   * Parse method to extract server ID if prefixed
   */
  private parseMethod(method: string): { serverId: string | undefined; method: string } {
    // Check for server prefix: "serverId__methodName"
    const parts = method.split('__');
    if (parts.length === 2 && parts[0] && parts[1] && this.servers.has(parts[0])) {
      return { serverId: parts[0], method: parts[1] };
    }

    // No prefix or invalid prefix - route to first available server
    // This maintains backward compatibility
    return { serverId: undefined, method };
  }

  /**
   * Get server or connect if not connected (lazy connection)
   */
  private async getOrConnectServer(serverId: string | undefined) {
    // If no serverId, use first server (backward compatibility)
    const id = serverId ?? this.servers.keys().next().value;
    if (!id) {
      throw new Error('No servers configured');
    }

    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server ${id} not found`);
    }

    // Lazy connection - connect on first use
    if (!server.client) {
      await this.connectServer(id, server);
    }

    return server;
  }

  /**
   * Connect to a server (lazy, on-demand)
   */
  private async connectServer(
    id: string,
    server: {
      spec: ServerSpec;
      client?: Client;
      transport?: Transport;
    }
  ): Promise<void> {
    try {
      this.logger?.debug(`Connecting to server ${id}`);

      const { spec } = server;

      // Create transport based on spec type
      let transport: Transport;

      if ('command' in spec && spec.command) {
        // Local process server - use dynamic import for Node.js specific transport
        const transportModule = await import('@himorishige/hatago-transport/stdio');
        const { StdioClientTransport } = transportModule;

        transport = new StdioClientTransport({
          command: spec.command,
          args: spec.args ?? [],
          env: spec.env,
          cwd: spec.cwd
        });
      } else if ('url' in spec) {
        // Remote server (HTTP/SSE)
        // This would need implementation in transport package
        throw new Error('Remote servers not yet implemented in HubCore');
      } else {
        throw new Error(`Unknown server spec type for ${id}`);
      }

      // Create minimal client
      const { Client: MCPClient } = await import('@modelcontextprotocol/sdk/client/index.js');
      const client = new MCPClient(
        {
          name: 'hatago-hub-core',
          version: '0.1.0'
        },
        {
          capabilities: {}
        }
      );

      // Connect
      await client.connect(transport);

      // Store connected client and transport
      server.client = client;
      server.transport = transport;

      this.logger?.info(`Connected to server ${id}`);
    } catch (error) {
      this.logger?.error(`Failed to connect to server ${id}:`, error);
      throw error;
    }
  }

  /**
   * Forward request to server - pure passthrough
   */
  private async forwardToServer(client: Client, request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // Direct method-to-method mapping for common MCP methods
    // This is a thin mapping layer, not transformation

    try {
      switch (request.method) {
        case 'initialize':
        case 'initialized':
        case 'shutdown':
        case 'ping':
          // System methods - pass through directly
          return await this.callClientMethod(client, request);

        case 'tools/list':
        case 'tools/call':
        case 'resources/list':
        case 'resources/read':
        case 'prompts/list':
        case 'prompts/get':
          // MCP standard methods - pass through directly
          return await this.callClientMethod(client, request);

        default:
          // Unknown method - pass through anyway
          // Let the server handle or reject it
          return await this.callClientMethod(client, request);
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Server error'
        }
      };
    }
  }

  /**
   * Call client method - thin wrapper for error handling
   */
  private async callClientMethod(
    client: Client,
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse> {
    // MCP SDK Client doesn't expose direct request method
    // We need to use the appropriate method based on the request type

    try {
      // Map method names to client methods
      switch (request.method) {
        case 'initialize':
          // Initialize is handled differently - usually called once
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            result: {
              protocolVersion: '1.0.0',
              capabilities: {}
            }
          };

        case 'tools/list': {
          const tools = await client.listTools();
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            result: tools
          };
        }

        case 'tools/call': {
          const params = request.params as { name: string; arguments?: unknown };
          const result = await client.callTool({
            name: params.name,
            arguments: params.arguments as Record<string, unknown> | undefined
          });
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            result
          };
        }

        case 'resources/list': {
          const resources = await client.listResources();
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            result: resources
          };
        }

        case 'resources/read': {
          const params = request.params as { uri: string };
          const result = await client.readResource(params);
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            result
          };
        }

        case 'prompts/list': {
          const prompts = await client.listPrompts();
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            result: prompts
          };
        }

        case 'prompts/get': {
          const params = request.params as { name: string; arguments?: Record<string, string> };
          const result = await client.getPrompt(params);
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            result
          };
        }

        default:
          // Unknown method
          return {
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      };
    }
  }
}
