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
    warn: (message: string, ...args: any[]) => void;
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
        const transportModule = await import('@himorishige/hatago-transport');

        if (spec.type === 'sse') {
          // SSE transport
          const { SSEClientTransport } = transportModule;
          if (!spec.url) {
            throw new Error(`SSE server ${id} requires a URL`);
          }
          transport = new SSEClientTransport(new URL(spec.url));
        } else {
          // HTTP transport - use SSE for now as HTTP client is not yet implemented
          // This is a limitation that will be addressed in future versions
          this.logger?.warn(
            `HTTP transport not yet fully implemented for ${id}, falling back to SSE`
          );
          const { SSEClientTransport } = transportModule;
          if (!spec.url) {
            throw new Error(`HTTP server ${id} requires a URL`);
          }
          transport = new SSEClientTransport(new URL(spec.url));
        }
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
   * Method routing table for clean dispatch
   * @internal Currently all methods use same handler but table structure
   * enables future method-specific handling without breaking changes
   */
  private static readonly METHOD_HANDLERS: Record<
    string,
    'direct' | 'tools' | 'resources' | 'prompts' | 'system'
  > = {
    // System methods
    initialize: 'system',
    initialized: 'system',
    shutdown: 'system',
    ping: 'system',

    // Tool methods
    'tools/list': 'tools',
    'tools/call': 'tools',

    // Resource methods
    'resources/list': 'resources',
    'resources/read': 'resources',

    // Prompt methods
    'prompts/list': 'prompts',
    'prompts/get': 'prompts'
  };

  /**
   * Forward request to server - pure passthrough
   */
  private async forwardToServer(client: Client, request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      // Method routing is defined in METHOD_HANDLERS table but all go through same handler
      // This maintains the table-driven pattern for future extensibility
      const handlerType = HubCore.METHOD_HANDLERS[request.method] ?? 'direct';
      this.logger?.debug(`Routing ${request.method} as ${handlerType} type`);

      // All methods go through the same handler - pure relay
      return await this.callClientMethod(client, request);
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
   * Method handlers for different request types
   */
  private static readonly METHOD_EXECUTORS: Record<
    string,
    (client: Client, params: unknown) => Promise<unknown>
  > = {
    'tools/list': async (client) => client.listTools(),
    'tools/call': async (client, params) =>
      client.callTool({
        name: (params as any).name,
        arguments: (params as any).arguments as Record<string, unknown> | undefined
      }),
    'resources/list': async (client) => client.listResources(),
    'resources/read': async (client, params) => client.readResource(params as { uri: string }),
    'prompts/list': async (client) => client.listPrompts(),
    'prompts/get': async (client, params) =>
      client.getPrompt(params as { name: string; arguments?: Record<string, string> })
  };

  /**
   * Call client method - thin wrapper for error handling
   */
  private async callClientMethod(
    client: Client,
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse> {
    try {
      // Special handling for system methods
      if (request.method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {
            protocolVersion: '1.0.0',
            capabilities: {}
          }
        };
      }

      // Use executor table for standard methods
      const executor = HubCore.METHOD_EXECUTORS[request.method];
      if (executor) {
        const result = await executor(client, request.params);
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          result
        };
      }

      // Unknown method - return method not found error
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`
        }
      };
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
