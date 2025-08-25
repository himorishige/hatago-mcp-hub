/**
 * MCP Initializer - Transport-agnostic initialization logic
 *
 * Provides unified initialization flow for STDIO, HTTP, and SSE transports
 * with protocol negotiation and timeout management
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import type { NegotiatedProtocol } from './types.js';
import type {
  InitializeResult,
  InitializeParams,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Initialization options
 */
export interface InitializerOptions {
  // Client information
  clientInfo?: {
    name: string;
    version: string;
  };

  // Timeout settings
  timeouts?: {
    // Timeout for first run (when packages might need to be downloaded)
    firstRunMs?: number;
    // Normal initialization timeout
    normalMs?: number;
    // Timeout for subsequent RPC calls
    rpcMs?: number;
  };

  // Whether this is the first run (packages might need downloading)
  isFirstRun?: boolean;

  // Debug logging
  debug?: boolean;
}

/**
 * Default timeout values
 */
const DEFAULT_TIMEOUTS = {
  firstRunMs: 90000, // 90 seconds for first run
  normalMs: 30000, // 30 seconds for normal init
  rpcMs: 20000, // 20 seconds for RPC calls
};

/**
 * Transport wrapper for protocol negotiation
 */
export interface NegotiableTransport {
  // Send a JSON-RPC message
  send(message: JSONRPCMessage): Promise<void>;

  // Wait for a response with a specific ID
  waitForResponse(
    id: number | string,
    timeoutMs: number,
  ): Promise<JSONRPCMessage>;

  // Close the transport
  close?(): Promise<void>;
}

/**
 * MCP Initializer class
 */
export class MCPInitializer {
  private negotiatedProtocol: NegotiatedProtocol | null = null;
  private options: Required<InitializerOptions>;
  private requestId = 1;

  constructor(options: InitializerOptions = {}) {
    this.options = {
      clientInfo: options.clientInfo || {
        name: 'hatago-hub',
        version: '0.0.2',
      },
      timeouts: {
        ...DEFAULT_TIMEOUTS,
        ...options.timeouts,
      },
      isFirstRun: options.isFirstRun || false,
      debug: options.debug || false,
    };
  }

  /**
   * Initialize connection with MCP server
   */
  async initialize(
    transport: Transport,
    protocolVersion = '2024-11-05',
  ): Promise<NegotiatedProtocol> {
    try {
      const result = await this.sendInitialize(transport, protocolVersion);

      // Create simplified negotiated protocol
      this.negotiatedProtocol = {
        protocol: protocolVersion,
        serverInfo: result.serverInfo,
        features: {
          notifications: true,
          resources: !!result.capabilities?.resources,
          prompts: !!result.capabilities?.prompts,
          tools: !!result.capabilities?.tools,
        },
      };

      return this.negotiatedProtocol;
    } catch (error) {
      this.log('error', `Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Send initialize request
   */
  private async sendInitialize(
    transport: Transport,
    protocolVersion: string,
  ): Promise<InitializeResult> {
    const id = this.getNextId();

    // Create initialize params
    const params: InitializeParams = {
      protocolVersion,
      capabilities: {
        experimental: {},
        tools: {},
        prompts: {},
        resources: {},
        sampling: {},
      },
      clientInfo: this.options.clientInfo,
    };

    const request: JSONRPCMessage = {
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params,
    };

    this.log('debug', `Sending initialize request: ${JSON.stringify(request)}`);

    // Send the request
    await transport.send(request);

    // Wait for response
    const response = await transport.waitForResponse(
      id,
      this.options.isFirstRun 
        ? this.options.timeouts.firstRunMs 
        : this.options.timeouts.normalMs,
    );

    if ('error' in response) {
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    if (!('result' in response)) {
      throw new Error('Invalid initialize response: missing result');
    }

    this.log(
      'debug',
      `Initialize response: ${JSON.stringify(response.result)}`,
    );

    // Send initialized notification
    await transport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    return response.result as InitializeResult;
  }

  /**
   * Get negotiated protocol
   */
  getNegotiatedProtocol(): NegotiatedProtocol | null {
    return this.negotiatedProtocol;
  }

  /**
   * Create adapted call (simplified - no protocol adaptation needed)
   */
  createAdaptedCall(method: string, params?: unknown): JSONRPCMessage {
    return {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method,
      params,
    };
  }

  /**
   * Get next request ID
   */
  private getNextId(): number {
    return this.requestId++;
  }

  /**
   * Log helper
   */
  private log(level: 'debug' | 'info' | 'error', message: string): void {
    if (this.options.debug || level === 'error') {
      console.log(`[MCPInitializer] ${level}: ${message}`);
    }
  }
}

/**
 * Helper function to create initialize request params
 */
export function createInitializeRequest(
  protocolVersion: string,
  clientInfo = { name: 'hatago-hub', version: '0.0.2' },
): InitializeParams {
  return {
    protocolVersion,
    capabilities: {
      experimental: {},
      tools: {},
      prompts: {},
      resources: {},
      sampling: {},
    },
    clientInfo,
  };
}

/**
 * Create a transport wrapper for standard SDK transports
 */
export function wrapTransport(
  transport: Transport,
  onMessage?: (message: JSONRPCMessage) => void,
): NegotiableTransport {
  const pendingResponses = new Map<
    string | number,
    {
      resolve: (message: JSONRPCMessage) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  // Store the original handler (if any)
  const originalHandler = transport.onmessage;
  transport.onmessage = (message: JSONRPCMessage) => {
    // Check if this is a response to a pending request
    if ('id' in message && message.id !== null && message.id !== undefined) {
      const pending = pendingResponses.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingResponses.delete(message.id);
        pending.resolve(message);
      }
    }

    // Call original handler if it exists
    if (originalHandler) {
      originalHandler(message);
    }

    // Call additional handler if provided
    if (onMessage) {
      onMessage(message);
    }
  };

  return {
    async send(message: JSONRPCMessage): Promise<void> {
      await transport.send(message);
    },

    async waitForResponse(
      id: number | string,
      timeoutMs: number,
    ): Promise<JSONRPCMessage> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingResponses.delete(id);
          reject(
            new Error(
              `Response timeout for request ${id} after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);

        pendingResponses.set(id, { resolve, reject, timer });
      });
    },

    async close(): Promise<void> {
      // Clear all pending responses
      for (const [_id, pending] of pendingResponses) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Transport closed'));
      }
      pendingResponses.clear();

      // Close underlying transport if supported
      if (transport.close) {
        await transport.close();
      }
    },
  };
}

/**
 * Helper to create an initialized transport with negotiation
 */
export async function initializeTransport(
  transport: Transport,
  options?: InitializerOptions,
): Promise<{
  transport: NegotiableTransport;
  protocol: NegotiatedProtocol;
  initializer: MCPInitializer;
}> {
  const initializer = new MCPInitializer(options);
  const wrappedTransport = wrapTransport(transport);

  const protocol = await initializer.initialize(wrappedTransport);

  return {
    transport: wrappedTransport,
    protocol,
    initializer,
  };
}
