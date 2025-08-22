/**
 * MCP Initializer - Transport-agnostic initialization logic
 *
 * Provides unified initialization flow for STDIO, HTTP, and SSE transports
 * with protocol negotiation and timeout management
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  createInitializeRequest,
  type InitializeResult,
  type NegotiatedProtocol,
  ProtocolNegotiator,
} from './protocol-negotiator.js';

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
  private negotiator: ProtocolNegotiator;
  private options: Required<InitializerOptions>;
  private requestId = 1;

  constructor(options: InitializerOptions = {}) {
    this.negotiator = new ProtocolNegotiator();
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
   * Initialize connection with protocol negotiation
   */
  async initialize(
    transport: NegotiableTransport,
  ): Promise<NegotiatedProtocol> {
    const timeout = this.options.isFirstRun
      ? this.options.timeouts.firstRunMs
      : this.options.timeouts.normalMs;

    this.log(
      `Starting initialization (timeout: ${timeout}ms, firstRun: ${this.options.isFirstRun})`,
    );

    // Create initialization function for negotiator
    const initializeFn = async (
      protocolVersion: string,
    ): Promise<InitializeResult> => {
      return this.sendInitialize(transport, protocolVersion, timeout);
    };

    // Perform protocol negotiation
    const negotiated = await this.negotiator.negotiate(initializeFn);

    this.log(`Initialization complete with protocol: ${negotiated.protocol}`);
    return negotiated;
  }

  /**
   * Send initialize request and wait for response
   */
  private async sendInitialize(
    transport: NegotiableTransport,
    protocolVersion: string,
    timeoutMs: number,
  ): Promise<InitializeResult> {
    const id = this.getNextId();

    const request: JSONRPCMessage = {
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: createInitializeRequest(protocolVersion, this.options.clientInfo),
    };

    this.log(`Sending initialize with protocol ${protocolVersion} (id: ${id})`);

    // Send the request
    await transport.send(request);

    // Wait for response
    const response = await transport.waitForResponse(id, timeoutMs);

    // Check for error response
    if ('error' in response) {
      const error = response.error as { message?: string };
      throw new Error(
        `Initialize failed: ${error.message || JSON.stringify(error)}`,
      );
    }

    // Extract result
    if (!('result' in response)) {
      throw new Error('Initialize response missing result');
    }

    return response.result as InitializeResult;
  }

  /**
   * Get the negotiated protocol
   */
  getNegotiatedProtocol(): NegotiatedProtocol | null {
    return this.negotiator.getNegotiatedProtocol();
  }

  /**
   * Create an adapted call function for the transport
   */
  createAdaptedCall(
    callFn: (method: string, params: unknown) => Promise<unknown>,
  ): (method: string, params: unknown) => Promise<unknown> {
    return this.negotiator.createAdaptedCall(callFn);
  }

  /**
   * Get next request ID
   */
  private getNextId(): number {
    return this.requestId++;
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[MCPInitializer] ${message}`);
    }
  }
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

  // Set up message handler
  if (transport.onmessage) {
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

      // Call original handler
      originalHandler(message);

      // Call additional handler if provided
      if (onMessage) {
        onMessage(message);
      }
    };
  }

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
