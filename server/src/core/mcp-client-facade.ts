/**
 * MCP Client Facade
 *
 * Wraps the SDK Client with protocol negotiation capabilities
 * Provides a unified interface for different protocol versions
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  type InitializerOptions,
  MCPInitializer,
  type NegotiableTransport,
  wrapTransport,
} from './mcp-initializer.js';
import type { NegotiatedProtocol } from './protocol-negotiator.js';

/**
 * Client facade options
 */
export interface ClientFacadeOptions {
  // Client name and version
  name: string;
  version: string;

  // Initializer options
  initializerOptions?: InitializerOptions;

  // Debug logging
  debug?: boolean;
}

/**
 * MCP Client Facade
 * Provides protocol negotiation on top of standard SDK Client
 */
export class MCPClientFacade {
  private client: Client;
  private initializer: MCPInitializer;
  private negotiatedProtocol: NegotiatedProtocol | null = null;
  private wrappedTransport: NegotiableTransport | null = null;
  private connected = false;

  constructor(private options: ClientFacadeOptions) {
    // Create standard SDK client
    this.client = new Client({
      name: options.name,
      version: options.version,
    });

    // Create initializer
    this.initializer = new MCPInitializer({
      ...options.initializerOptions,
      clientInfo: {
        name: options.name,
        version: options.version,
      },
      debug: options.debug,
    });
  }

  /**
   * Connect to a transport with protocol negotiation
   */
  async connect(transport: Transport): Promise<NegotiatedProtocol> {
    if (this.connected) {
      throw new Error('Client already connected');
    }

    this.log('Connecting with protocol negotiation...');

    // Wrap the transport for negotiation
    this.wrappedTransport = wrapTransport(transport, (message) => {
      // Additional message handling if needed
      this.handleMessage(message);
    });

    // Perform protocol negotiation BEFORE connecting the SDK client
    try {
      this.negotiatedProtocol = await this.initializer.initialize(
        this.wrappedTransport,
      );
      this.log(`Negotiated protocol: ${this.negotiatedProtocol.protocol}`);
    } catch (error) {
      // Clean up on failure
      if (this.wrappedTransport.close) {
        await this.wrappedTransport.close();
      }
      throw error;
    }

    // Now connect the SDK client with a custom transport wrapper
    // that bypasses the SDK's initialization (since we already did it)
    const bypassTransport = this.createBypassTransport(transport);
    await this.client.connect(bypassTransport);

    this.connected = true;
    return this.negotiatedProtocol;
  }

  /**
   * Create a transport that bypasses SDK initialization
   * This allows us to control the initialization process
   */
  private createBypassTransport(originalTransport: Transport): Transport {
    let initIntercepted = false;

    return {
      send: async (message: JSONRPCMessage) => {
        // Intercept initialize requests from SDK and respond immediately
        if (
          'method' in message &&
          message.method === 'initialize' &&
          !initIntercepted
        ) {
          initIntercepted = true;
          this.log('Intercepting SDK initialize request');

          // Send a fake successful response back to the SDK
          setTimeout(() => {
            if (originalTransport.onmessage) {
              originalTransport.onmessage({
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  protocolVersion: '0.1.0', // SDK expects this
                  capabilities: this.negotiatedProtocol?.capabilities || {},
                  serverInfo: this.negotiatedProtocol?.serverInfo,
                },
              });
            }
          }, 0);

          return; // Don't actually send the initialize
        }

        // For all other messages, adapt and forward
        const adapted = this.adaptOutgoingMessage(message);
        return originalTransport.send(adapted);
      },

      onmessage: originalTransport.onmessage,
      onerror: originalTransport.onerror,
      onclose: originalTransport.onclose,

      close: originalTransport.close
        ? async () => originalTransport.close?.()
        : undefined,
    };
  }

  /**
   * Adapt outgoing messages based on negotiated protocol
   */
  private adaptOutgoingMessage(message: JSONRPCMessage): JSONRPCMessage {
    if (!this.negotiatedProtocol || !this.initializer) {
      return message;
    }

    // Use the negotiator's adaptation logic
    if ('method' in message && message.method) {
      const protocol = this.initializer.getNegotiatedProtocol();
      if (protocol) {
        // Apply any necessary adaptations
        // Currently, the negotiator handles this internally
      }
    }

    return message;
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: JSONRPCMessage): void {
    // Log protocol-specific messages if debugging
    if (this.options.debug) {
      if ('method' in message) {
        this.log(`Received notification: ${message.method}`);
      } else if ('id' in message) {
        this.log(`Received response for request ${message.id}`);
      }
    }
  }

  /**
   * Get the underlying SDK client
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Get negotiated protocol information
   */
  getNegotiatedProtocol(): NegotiatedProtocol | null {
    return this.negotiatedProtocol;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.log('Closing connection...');

    // Close the wrapped transport
    if (this.wrappedTransport?.close) {
      await this.wrappedTransport.close();
    }

    // SDK client doesn't have a close method, but we mark as disconnected
    this.connected = false;
    this.negotiatedProtocol = null;
    this.wrappedTransport = null;
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[MCPClientFacade] ${message}`);
    }
  }
}

/**
 * Helper to create a facade-wrapped client
 */
export async function createNegotiatedClient(
  transport: Transport,
  options: ClientFacadeOptions,
): Promise<{
  facade: MCPClientFacade;
  client: Client;
  protocol: NegotiatedProtocol;
}> {
  const facade = new MCPClientFacade(options);
  const protocol = await facade.connect(transport);

  return {
    facade,
    client: facade.getClient(),
    protocol,
  };
}
