/**
 * Transport Factory
 *
 * Creates appropriate transport instances from configuration.
 */

import type { TransportConfig } from '../composition/types.js';
import { HatagoProtocolError, RPC_ERRORS } from '../protocol/errors.js';
import type { Transport } from '../protocol/index.js';
// import { WebSocketTransport } from './websocket.js';

export class TransportFactory {
  /**
   * Create a transport instance from configuration
   */
  static async createTransport(config: TransportConfig): Promise<Transport> {
    switch (config.type) {
      case 'websocket':
        throw new Error('WebSocket transport not yet implemented');
      // return TransportFactory.createWebSocketTransport(config);

      case 'http':
        return TransportFactory.createHttpTransport(config);

      case 'sse':
        return TransportFactory.createSSETransport(config);

      case 'stdio':
        return TransportFactory.createStdioTransport(config);

      default:
        throw HatagoProtocolError.userError(
          `Unsupported transport type: ${(config as any).type}`,
          { code: RPC_ERRORS.INVALID_PARAMS },
        );
    }
  }

  // private static createWebSocketTransport(config: TransportConfig): Transport {
  //   if (!config.url) {
  //     throw HatagoProtocolError.userError('WebSocket transport requires URL', {
  //       code: RPC_ERRORS.INVALID_PARAMS,
  //     });
  //   }

  //   return new WebSocketTransport({
  //     url: config.url,
  //     headers: config.headers,
  //     connectionTimeout: config.timeout,
  //   });
  // }

  private static createHttpTransport(_config: TransportConfig): Transport {
    // TODO: Implement HTTP transport (using fetch/axios)
    throw HatagoProtocolError.systemError(
      'HTTP transport not implemented yet',
      { code: RPC_ERRORS.INTERNAL_ERROR },
    );
  }

  private static createSSETransport(_config: TransportConfig): Transport {
    // TODO: Implement SSE transport
    throw HatagoProtocolError.systemError('SSE transport not implemented yet', {
      code: RPC_ERRORS.INTERNAL_ERROR,
    });
  }

  private static createStdioTransport(config: TransportConfig): Transport {
    // TODO: Implement stdio transport (child_process based)
    if (!config.command) {
      throw HatagoProtocolError.userError('Stdio transport requires command', {
        code: RPC_ERRORS.INVALID_PARAMS,
      });
    }

    // Mock implementation for now
    return new MockStdioTransport(config);
  }
}

// Mock stdio transport for development
class MockStdioTransport implements Transport {
  private connected = false;
  private messageHandlers = new Set<(message: any) => void>();
  private errorHandlers = new Set<(error: Error) => void>();
  private closeHandlers = new Set<() => void>();

  async connect(): Promise<void> {
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.closeHandlers.forEach((handler) => handler());
  }

  async send(message: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    // Mock response after delay
    setTimeout(() => {
      const response = {
        jsonrpc: '2.0',
        id: message.id,
        result: { mock: true, method: message.method, params: message.params },
      };

      this.messageHandlers.forEach((handler) => handler(response));
    }, 50);
  }

  onMessage(handler: (message: any) => void): void {
    this.messageHandlers.add(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.add(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }
}
